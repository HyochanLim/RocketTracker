const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const crypto = require("crypto");
const mongodb = require("mongodb");
const FlightFile = require("../models/flight-file.model");
const { parseFlightFileToJson } = require("../logic/parsing/flight-data.parser");
const { parseRowsWithAiAgent } = require("../logic/parsing/ai-parsing-agent");
const { storeAiParsedData, getAiParsedData } = require("../logic/aiAgent/agent");

function isAjaxRequest(req) {
  return req.xhr || req.get("X-Requested-With") === "XMLHttpRequest";
}

function recordsFromParsedJsonPayload(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.records)) return parsed.records;
  return [];
}

function makeSafeBaseName(filename) {
  return String(filename || "flight-data")
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80) || "flight-data";
}

function getCesiumIonAccessToken() {
  if (process.env.CESIUM_ION_ACCESS_TOKEN && String(process.env.CESIUM_ION_ACCESS_TOKEN).trim()) {
    return String(process.env.CESIUM_ION_ACCESS_TOKEN).trim();
  }
  try {
    const cfg = require("../config/cesium-ion.local");
    if (cfg && typeof cfg.accessToken === "string" && cfg.accessToken.trim()) return cfg.accessToken.trim();
  } catch {
    /* optional local file */
  }
  return "";
}

async function getTracker(req, res, next) {
  try {
    const files = await FlightFile.findByUser(req.session.uid);
    const message = req.query.uploaded
      ? { type: "success", text: "Flight data uploaded and saved." }
      : req.query.duplicate
        ? { type: "success", text: "This file already exists. Reused existing saved file." }
        : req.query.error
          ? { type: "error", text: req.query.error }
          : null;
    res.render("tracker/index", { files, message, cesiumIonToken: getCesiumIonAccessToken() });
  } catch (error) {
    next(error);
  }
}

function computeFileHash(filePath) {
  return new Promise(function (resolve, reject) {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", function (chunk) {
      hash.update(chunk);
    });
    stream.on("end", function () {
      resolve(hash.digest("hex"));
    });
  });
}

async function uploadTrackerFile(req, res, next) {
  if (req.fileValidationError) {
    if (isAjaxRequest(req)) return res.status(422).json({ ok: false, message: req.fileValidationError });
    return res.redirect(`/tracker?error=${encodeURIComponent(req.fileValidationError)}`);
  }
  if (!req.file) {
    if (isAjaxRequest(req)) return res.status(422).json({ ok: false, message: "Please select a file." });
    return res.redirect("/tracker?error=Please%20select%20a%20file.");
  }

  try {
    const absolutePath = req.file.path;
    const fileHash = await computeFileHash(absolutePath);

    const existing = await FlightFile.findByUserAndHash(req.session.uid, fileHash);
    if (existing) {
      fs.unlink(absolutePath, function () {});
      try {
        const dupText = await fsp.readFile(path.join(__dirname, "..", existing.storedPath), "utf-8");
        storeAiParsedData(req.session.uid, JSON.parse(dupText));
      } catch (_) {
        /* Duplicate file metadata only; on parse load failure leave session memory cleared */
      }
      if (isAjaxRequest(req)) {
        return res.json({
          ok: true,
          duplicate: true,
          file: {
            _id: existing._id.toString(),
            originalName: existing.originalName,
            size: existing.size,
            storedPath: existing.storedPath,
          },
        });
      }
      return res.redirect("/tracker?duplicate=1");
    }

    const parsedRecords = await parseFlightFileToJson(absolutePath);
    const aiParsed = await parseRowsWithAiAgent(parsedRecords, {
      filename: req.file.originalname,
    });
    const standardizedRecords =
      aiParsed && Array.isArray(aiParsed.standardizedRecords) && aiParsed.standardizedRecords.length > 0
        ? aiParsed.standardizedRecords
        : parsedRecords;
    const parsedDir = path.join(__dirname, "..", "data", "storage", "parsed_json", req.session.uid);
    await fsp.mkdir(parsedDir, { recursive: true });

    const safeBase = makeSafeBaseName(req.file.originalname);
    const parsedFilename = `${safeBase}-${Date.now()}.json`;
    const parsedAbsolutePath = path.join(parsedDir, parsedFilename);
    await fsp.writeFile(parsedAbsolutePath, JSON.stringify(standardizedRecords, null, 2), "utf-8");

    const relativeStoredPath = path.relative(path.join(__dirname, ".."), parsedAbsolutePath).replace(/\\/g, "/");

    const rawDir = path.join(__dirname, "..", "data", "storage", "raw_uploads", req.session.uid);
    await fsp.mkdir(rawDir, { recursive: true });
    const rawExt = path.extname(req.file.originalname || "").toLowerCase() || ".dat";
    const rawFilename = `${fileHash.slice(0, 16)}-${safeBase}${rawExt}`;
    const rawPermanentPath = path.join(rawDir, rawFilename);
    await fsp.copyFile(absolutePath, rawPermanentPath);
    await fsp.unlink(absolutePath);
    const relativeRawPath = path.relative(path.join(__dirname, ".."), rawPermanentPath).replace(/\\/g, "/");

    const insertResult = await FlightFile.create({
      userId: new mongodb.ObjectId(req.session.uid),
      originalName: req.file.originalname,
      mimeType: "application/json",
      size: req.file.size,
      storedPath: relativeStoredPath,
      rawStoredPath: relativeRawPath,
      fileHash,
      sourceExt: path.extname(req.file.originalname || "").toLowerCase(),
      recordCount: Array.isArray(standardizedRecords) ? standardizedRecords.length : 0,
      createdAt: new Date(),
    });

    storeAiParsedData(req.session.uid, standardizedRecords);

    if (isAjaxRequest(req)) {
      return res.json({
        ok: true,
        uploaded: true,
        file: {
          _id: insertResult.insertedId.toString(),
          originalName: req.file.originalname,
          size: req.file.size,
          storedPath: relativeStoredPath,
        },
      });
    }

    return res.redirect("/tracker?uploaded=1");
  } catch (error) {
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, function () {});
    }
    next(error);
  }
}

const projectRoot = path.join(__dirname, "..");

async function rebuildParsedJsonFromRaw(flight) {
  if (!flight.rawStoredPath) {
    return null;
  }
  const rawAbs = path.join(projectRoot, flight.rawStoredPath);
  const parsedAbs = path.join(projectRoot, flight.storedPath);
  const parsedRecords = await parseFlightFileToJson(rawAbs);
  const aiParsed = await parseRowsWithAiAgent(parsedRecords, {
    filename: flight.originalName,
  });
  const standardizedRecords =
    aiParsed && Array.isArray(aiParsed.standardizedRecords) && aiParsed.standardizedRecords.length > 0
      ? aiParsed.standardizedRecords
      : parsedRecords;
  await fsp.mkdir(path.dirname(parsedAbs), { recursive: true });
  await fsp.writeFile(parsedAbs, JSON.stringify(standardizedRecords, null, 2), "utf-8");
  return standardizedRecords;
}

async function getFlightData(req, res, next) {
  try {
    const sf = req.selectedFlightFile;
    if (!sf) {
      return res.status(500).json({ ok: false, message: "Flight file context missing." });
    }
    if (!storagePathBelongsToUser(sf.storedPath, req.session.uid)) {
      return res.status(403).json({ ok: false, message: "Access denied." });
    }
    if (sf.rawStoredPath && !storagePathBelongsToUser(sf.rawStoredPath, req.session.uid)) {
      return res.status(403).json({ ok: false, message: "Access denied." });
    }

    const parsedAbs = path.join(projectRoot, sf.storedPath);
    let records;
    try {
      const text = await fsp.readFile(parsedAbs, "utf-8");
      records = JSON.parse(text);
    } catch (err) {
      if (err && err.code === "ENOENT") {
        try {
          const rebuilt = await rebuildParsedJsonFromRaw(sf);
          if (!rebuilt) {
            return res.status(404).json({
              ok: false,
              message: "Stored flight data is missing and cannot be rebuilt. Please upload the file again.",
            });
          }
          records = rebuilt;
        } catch {
          return res.status(404).json({
            ok: false,
            message: "Stored flight data is missing and could not be rebuilt. Please upload the file again.",
          });
        }
      } else {
        throw err;
      }
    }

    const payload = recordsFromParsedJsonPayload(records);
    storeAiParsedData(req.session.uid, records);

    return res.json({
      ok: true,
      file: {
        _id: sf.id,
        originalName: sf.originalName,
      },
      records: payload,
    });
  } catch (error) {
    next(error);
  }
}

function isSafeRelativeStoragePath(rel) {
  if (!rel || typeof rel !== "string") return false;
  if (rel.includes("..")) return false;
  if (path.isAbsolute(rel)) return false;
  return true;
}

/** Whether storage path is under the signed-in user’s folder (blocks cross-account access) */
function storagePathBelongsToUser(rel, sessionUid) {
  if (!isSafeRelativeStoragePath(rel)) return false;
  const uid = String(sessionUid || "");
  if (!uid) return false;
  const norm = String(rel).replace(/\\/g, "/");
  return (
    norm.startsWith("data/storage/parsed_json/" + uid + "/") ||
    norm.startsWith("data/storage/raw_uploads/" + uid + "/")
  );
}

async function unlinkIfExists(absPath) {
  try {
    await fsp.unlink(absPath);
  } catch (err) {
    if (err && err.code !== "ENOENT") throw err;
  }
}

async function deleteTrackerFile(req, res, next) {
  if (!isAjaxRequest(req)) {
    return res.status(400).json({ ok: false, message: "Invalid request." });
  }
  try {
    const sf = req.selectedFlightFile;
    if (!sf) {
      return res.status(500).json({ ok: false, message: "Flight file context missing." });
    }

    const relPaths = [sf.storedPath, sf.rawStoredPath].filter(Boolean);
    for (let i = 0; i < relPaths.length; i += 1) {
      const rel = relPaths[i];
      if (!storagePathBelongsToUser(rel, req.session.uid)) {
        return res.status(403).json({ ok: false, message: "Access denied." });
      }
      await unlinkIfExists(path.join(projectRoot, rel));
    }

    const delResult = await FlightFile.deleteByIdForUser(req.session.uid, sf.id);
    if (!delResult.deletedCount) {
      return res.status(404).json({ ok: false, message: "Saved file not found." });
    }

    return res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

function loadAiAgentConfig() {
  try {
    return require("../config/ai-agent.local");
  } catch {
    return {};
  }
}

function systemPromptTrackerAgent() {
  return [
    "You are a helpful copilot next to the Orbit flight tracker.",
    "For greetings, small talk, and light questions, reply naturally and concisely in English.",
    "Only for flight, trajectory, altitude, or telemetry questions, open /home/user/ai_parsed_data.json, use it as context, and answer briefly.",
  ].join(" ");
}

function trimAgentChatMessages(arr, maxMsgs, maxContentLen) {
  const slice = Array.isArray(arr) ? arr.slice(-maxMsgs) : [];
  const out = [];
  for (let i = 0; i < slice.length; i += 1) {
    const m = slice[i];
    if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
    let c = String(m.content || "").trim();
    if (!c) continue;
    const chars = Array.from(c);
    if (chars.length > maxContentLen) c = chars.slice(0, maxContentLen).join("") + "…";
    out.push({ role: m.role, content: c });
  }
  return out;
}

/** Same shape as ai_parsed_data, serialized for the sandbox file */
function serializeAiParsedForSandbox(aiParsedObj) {
  if (aiParsedObj == null) return "{}";
  return JSON.stringify(aiParsedObj);
}

async function postAgentChat(req, res, next) {
  if (!isAjaxRequest(req)) {
    return res.status(400).json({ ok: false, message: "Invalid request." });
  }
  try {
    const cfg = loadAiAgentConfig();
    if (!cfg.apiKey || !cfg.endpoint || !cfg.model) {
      return res.status(503).json({ ok: false, message: "AI agent is not configured." });
    }

    const trimmed = trimAgentChatMessages(req.body && req.body.messages, 20, 600);
    if (trimmed.length === 0 || trimmed[trimmed.length - 1].role !== "user") {
      return res.status(422).json({ ok: false, message: "Send messages ending with user." });
    }

    let aiParsed = getAiParsedData(req.session.uid);
    const bodyFileId = req.body && req.body.fileId != null ? String(req.body.fileId).trim() : "";
    if (!aiParsed && bodyFileId && mongodb.ObjectId.isValid(bodyFileId)) {
      const doc = await FlightFile.findByIdForUser(req.session.uid, bodyFileId);
      if (!doc) {
        return res.status(404).json({ ok: false, message: "Saved file not found." });
      }
      if (!storagePathBelongsToUser(doc.storedPath, req.session.uid)) {
        return res.status(403).json({ ok: false, message: "Access denied." });
      }
      try {
        const rawText = await fsp.readFile(path.join(projectRoot, doc.storedPath), "utf-8");
        const parsedRoot = JSON.parse(rawText);
        aiParsed = Array.isArray(parsedRoot) ? { records: parsedRoot } : parsedRoot;
        storeAiParsedData(req.session.uid, parsedRoot);
      } catch {
        return res.status(422).json({ ok: false, message: "Could not read flight data." });
      }
    }

    if (!aiParsed) {
      aiParsed = {};
    }

    const aiParsedJson = serializeAiParsedForSandbox(aiParsed);
    const openAiMessages = [{ role: "system", content: systemPromptTrackerAgent() }].concat(trimmed);

    const { runSandboxChatSession } = require("../logic/aiAgent/e2b-chat.cjs");
    const text = await runSandboxChatSession(String(req.session.uid), cfg, openAiMessages, aiParsedJson);
    return res.json({ ok: true, text: text || "" });
  } catch (err) {
    next(err);
  }
}

module.exports = { getTracker, uploadTrackerFile, getFlightData, deleteTrackerFile, postAgentChat };
