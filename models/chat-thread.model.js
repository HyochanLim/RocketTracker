const mongodb = require("mongodb");
const db = require("../data/database");

function normalizeFileId(fileId) {
  const t = String(fileId || "").trim();
  return t || "default";
}

function clampMessages(list, max) {
  const arr = Array.isArray(list) ? list : [];
  if (arr.length <= max) return arr;
  return arr.slice(arr.length - max);
}

class ChatThread {
  static async getByUserAndFile(userId, fileId) {
    const uid = String(userId || "").trim();
    if (!uid) return null;
    const fid = normalizeFileId(fileId);
    return db.getDb().collection("chat_threads").findOne({
      userId: new mongodb.ObjectId(uid),
      fileId: fid,
    });
  }

  static async upsertMessages(userId, fileId, messages, opts = {}) {
    const uid = String(userId || "").trim();
    if (!uid) return { ok: false };
    const fid = normalizeFileId(fileId);
    const max = typeof opts.maxMessages === "number" && opts.maxMessages > 0 ? opts.maxMessages : 120;
    const safeMsgs = clampMessages(
      (Array.isArray(messages) ? messages : [])
        .map((m) => {
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

    await db.getDb().collection("chat_threads").updateOne(
      { userId: new mongodb.ObjectId(uid), fileId: fid },
      {
        $setOnInsert: { createdAt: new Date() },
        $set: { updatedAt: new Date(), messages: safeMsgs },
      },
      { upsert: true }
    );
    return { ok: true, count: safeMsgs.length };
  }
}

module.exports = ChatThread;

