const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const crypto = require("crypto");
const mongodb = require("mongodb");
const FlightFile = require("../models/flight-file.model");
const ChatThread = require("../models/chat-thread.model");
const { parseFlightFileToJson } = require("../logic/parsing/flight-data.parser");
const { parseRowsWithAiAgent } = require("../logic/parsing/ai-parsing-agent");
const { buildParseInterpretation } = require("../logic/parsing/parse-interpretation");
const { storeAiParsedData, getAiParsedData } = require("../logic/aiAgent/agent");
const { loadAiAgentConfig, resolveModels, resolveProviderConfig } = require("../util/ai-models");
const layout = require("../util/user-data-layout");

function isAjaxRequest(req) {
  return req.xhr || req.get("X-Requested-With") === "XMLHttpRequest";
}

function recordsFromParsedJsonPayload(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.records)) return parsed.records;
  return [];
}

/**
 * AI 표준화 결과는 행이 있어도 매핑이 비면 위경도가 전부 null일 수 있다(AI env 미설정 등).
 * 그때는 원본 파싱 레코드를 써야 Cesium 궤적이 나온다.
 */
function recordsToPersist(parsedRecords, aiParsed) {
  const std = aiParsed && Array.isArray(aiParsed.standardizedRecords) ? aiParsed.standardizedRecords : [];
  const m = aiParsed && aiParsed.mapping;
  const hasLatLonColumns = !!(m && m.latitude && m.longitude);
  if (std.length > 0 && hasLatLonColumns) return std;
  return parsedRecords;
}

function makeSafeBaseName(filename) {
  return String(filename || "flight-data")
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80) || "flight-data";
}

function getCesiumIonAccessToken() {
  return String(process.env.CESIUM_ION_ACCESS_TOKEN || "").trim();
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
    const standardizedRecords = recordsToPersist(parsedRecords, aiParsed);
    layout.ensureUserDirs(req.session.uid);
    const parsedDir = layout.userParsedDir(req.session.uid);

    const safeBase = makeSafeBaseName(req.file.originalname);
    const parsedFilename = `${safeBase}-${Date.now()}.json`;
    const parsedAbsolutePath = path.join(parsedDir, parsedFilename);
    await fsp.writeFile(parsedAbsolutePath, JSON.stringify(standardizedRecords, null, 2), "utf-8");

    const relativeStoredPath = layout.relativeFromProject(parsedAbsolutePath);

    const rawDir = layout.userRawDir(req.session.uid);
    const rawExt = path.extname(req.file.originalname || "").toLowerCase() || ".dat";
    const rawFilename = `${fileHash.slice(0, 16)}-${safeBase}${rawExt}`;
    const rawPermanentPath = path.join(rawDir, rawFilename);
    await fsp.copyFile(absolutePath, rawPermanentPath);
    await fsp.unlink(absolutePath);
    const relativeRawPath = layout.relativeFromProject(rawPermanentPath);

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
      const parseInterpretation = buildParseInterpretation(aiParsed, { filename: req.file.originalname });
      return res.json({
        ok: true,
        uploaded: true,
        file: {
          _id: insertResult.insertedId.toString(),
          originalName: req.file.originalname,
          size: req.file.size,
          storedPath: relativeStoredPath,
        },
        parseInterpretation,
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

const projectRoot = layout.PROJECT_ROOT;

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
  const standardizedRecords = recordsToPersist(parsedRecords, aiParsed);
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
  return layout.isUserStoragePathForUid(norm, uid);
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

async function postAgentThreadReset(req, res, next) {
  if (!isAjaxRequest(req)) {
    return res.status(400).json({ ok: false, message: "Invalid request." });
  }
  if (!req.session.uid) {
    return res.status(401).json({ ok: false, message: "로그인이 필요합니다. 페이지를 새로고침한 뒤 다시 시도하세요." });
  }
  try {
    const bodyFileId = req.body && req.body.fileId != null ? String(req.body.fileId).trim() : "";
    const cleared = await ChatThread.clearForUserAndFile(req.session.uid, bodyFileId || "default");
    if (!cleared || !cleared.ok) {
      return res.status(500).json({ ok: false, message: "대화 저장소를 비우지 못했습니다." });
    }
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function getAgentHistory(req, res, next) {
  if (!isAjaxRequest(req)) return res.status(400).json({ ok: false, message: "Invalid request." });
  try {
    const fileId = req.query && req.query.fileId != null ? String(req.query.fileId).trim() : "";
    const thread = await ChatThread.getByUserAndFile(req.session.uid, fileId);
    const msgs = thread && Array.isArray(thread.messages) ? thread.messages : [];
    return res.json({ ok: true, messages: msgs });
  } catch (err) {
    next(err);
  }
}

const MAX_AGENT_CODE_CHARS = 300_000;

async function postAgentRun(req, res, next) {
  if (!isAjaxRequest(req)) {
    return res.status(400).json({ ok: false, message: "Invalid request." });
  }
  try {
    const code = req.body && req.body.code != null ? String(req.body.code) : "";
    const trimmed = code.trim();
    if (!trimmed) {
      return res.status(422).json({ ok: false, message: "Missing code." });
    }
    if (trimmed.length > MAX_AGENT_CODE_CHARS) {
      return res.status(422).json({ ok: false, message: "Code is too long." });
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
      return res.status(422).json({ ok: false, message: "No flight data loaded. Open a saved file or upload first." });
    }

    const aiParsedJson = serializeAiParsedForSandbox(aiParsed);
    const { runPythonInSandbox } = require("../logic/aiAgent/e2b-chat.cjs");
    const datasetKey = bodyFileId || "default";

    let out;
    try {
      out = await runPythonInSandbox(String(req.session.uid), datasetKey, trimmed, aiParsedJson);
    } catch (err) {
      const msg = err && err.message ? String(err.message) : "Sandbox run failed.";
      return res.status(502).json({ ok: false, message: msg });
    }

    const summary =
      out.result && typeof out.result === "object" && out.result.summary != null
        ? String(out.result.summary).trim()
        : "";
    const text = summary || (out.stdout && String(out.stdout).trim()) || "Run finished (no summary in result.json).";

    const resResult = out.result || null;
    const vizCommands =
      resResult && Array.isArray(resResult.vizCommands) ? resResult.vizCommands : null;

    return res.json({
      ok: true,
      text,
      result: resResult,
      vizCommands,
      artifacts: Array.isArray(out.artifacts) ? out.artifacts : [],
      executedCode: trimmed,
      stdout: out.stdout || "",
      stderr: out.stderr || "",
      artifactsAllowed: true,
    });
  } catch (err) {
    next(err);
  }
}

async function postAgentChat(req, res, next) {
  if (!isAjaxRequest(req)) {
    return res.status(400).json({ ok: false, message: "Invalid request." });
  }
  try {
    const cfg = loadAiAgentConfig();
    const models = resolveModels(cfg);
    cfg.model = models.freeModel;
    const provider = resolveProviderConfig(cfg);
    cfg.apiKey = provider.apiKey;
    cfg.endpoint = provider.endpoint;
    cfg.timeoutMs = provider.timeoutMs;

    if (!cfg.apiKey || !cfg.endpoint || !cfg.model) {
      return res.status(503).json({
        ok: false,
        message: "AI agent is not configured. Set AI_ENDPOINT, AI_API_KEY, and AI_MODEL.",
      });
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
    const openAiMessages = trimmed;

    const { runSandboxChatSession } = require("../logic/aiAgent/e2b-chat.cjs");
    const datasetKey = bodyFileId || "default";
    const out = await runSandboxChatSession(String(req.session.uid), cfg, openAiMessages, aiParsedJson, datasetKey);

    const replyText = (out && out.text) || "";
    const nextTranscript = trimmed.concat([{ role: "assistant", content: String(replyText).trim() }]);
    await ChatThread.upsertMessages(req.session.uid, bodyFileId || "default", nextTranscript, { maxMessages: 120 });

    const resResult = (out && out.result) || null;
    const vizCommands =
      resResult && Array.isArray(resResult.vizCommands) ? resResult.vizCommands : null;

    return res.json({
      ok: true,
      text: replyText,
      result: resResult,
      vizCommands,
      artifacts: (out && Array.isArray(out.artifacts) && out.artifacts) || [],
      executedCode: (out && out.executedCode) || null,
      artifactsAllowed: true,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getTracker,
  uploadTrackerFile,
  getFlightData,
  deleteTrackerFile,
  getAgentHistory,
  postAgentThreadReset,
  postAgentChat,
  postAgentRun,
};
