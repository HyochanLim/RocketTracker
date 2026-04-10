const fsp = require("fs/promises");
const path = require("path");
const mongodb = require("mongodb");
const db = require("../data/database");
const layout = require("../util/user-data-layout");

function normalizeFileId(fileId) {
  const t = String(fileId || "").trim();
  return t || "default";
}

function clampMessages(list, max) {
  const arr = Array.isArray(list) ? list : [];
  if (arr.length <= max) return arr;
  return arr.slice(arr.length - max);
}

async function readThreadFile(userId, fileId) {
  const abs = layout.chatThreadAbsPath(userId, fileId);
  try {
    const text = await fsp.readFile(abs, "utf-8");
    const data = JSON.parse(text);
    return {
      messages: Array.isArray(data.messages) ? data.messages : [],
      createdAt: data.createdAt || null,
    };
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
}

class ChatThread {
  static async getByUserAndFile(userId, fileId) {
    const uid = String(userId || "").trim();
    if (!uid) return null;
    const fid = normalizeFileId(fileId);

    let fromFile = await readThreadFile(uid, fid);
    if (fromFile) {
      return {
        userId: new mongodb.ObjectId(uid),
        fileId: fid,
        messages: fromFile.messages,
      };
    }

    const doc = await db.getDb().collection("chat_threads").findOne({
      userId: new mongodb.ObjectId(uid),
      fileId: fid,
    });
    if (!doc || !Array.isArray(doc.messages)) return null;

    layout.ensureUserDirs(uid);
    const abs = layout.chatThreadAbsPath(uid, fid);
    const payload = {
      fileId: fid,
      createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : new Date().toISOString(),
      messages: doc.messages,
      migratedFromMongoAt: new Date().toISOString(),
    };
    await fsp.writeFile(abs, JSON.stringify(payload, null, 2), "utf-8");

    return {
      userId: new mongodb.ObjectId(uid),
      fileId: fid,
      messages: doc.messages,
    };
  }

  static async upsertMessages(userId, fileId, messages, opts = {}) {
    const uid = String(userId || "").trim();
    if (!uid) return { ok: false };
    const fid = normalizeFileId(fileId);
    const max = typeof opts.maxMessages === "number" && opts.maxMessages > 0 ? opts.maxMessages : 120;
    const safeMsgs = clampMessages(
      (Array.isArray(messages) ? messages : [])
        .map(function (m) {
          if (!m || typeof m !== "object") return null;
          const role = String(m.role || "").trim();
          const content = String(m.content || "").trim();
          if (!role || !content) return null;
          if (role !== "user" && role !== "assistant") return null;
          return { role, content };
        })
        .filter(Boolean),
      max
    );

    layout.ensureUserDirs(uid);
    const abs = layout.chatThreadAbsPath(uid, fid);
    let createdAt = new Date().toISOString();
    try {
      const prev = JSON.parse(await fsp.readFile(abs, "utf-8"));
      if (prev && prev.createdAt) createdAt = prev.createdAt;
    } catch (_) {
      /* new file */
    }

    const payload = {
      fileId: fid,
      createdAt,
      updatedAt: new Date().toISOString(),
      messages: safeMsgs,
    };
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, JSON.stringify(payload, null, 2), "utf-8");

    return { ok: true, count: safeMsgs.length };
  }

  /** Empty messages and start a fresh conversation for this file (same JSON file, new createdAt). */
  static async clearForUserAndFile(userId, fileId) {
    const uid = String(userId || "").trim();
    if (!uid) return { ok: false, reason: "no_user" };
    const fid = normalizeFileId(fileId);
    layout.ensureUserDirs(uid);
    const abs = layout.chatThreadAbsPath(uid, fid);
    const now = new Date().toISOString();
    const payload = {
      fileId: fid,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, JSON.stringify(payload, null, 2), "utf-8");
    return { ok: true };
  }
}

module.exports = ChatThread;
