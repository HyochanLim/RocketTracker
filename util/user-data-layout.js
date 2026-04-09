const path = require("path");
const fs = require("fs");

const PROJECT_ROOT = path.join(__dirname, "..");

function userRoot(userId) {
  const uid = String(userId || "").trim();
  if (!uid) throw new Error("userId required");
  return path.join(PROJECT_ROOT, "data", "users", uid);
}

function userRawDir(userId) {
  return path.join(userRoot(userId), "raw");
}

function userParsedDir(userId) {
  return path.join(userRoot(userId), "parsed");
}

function userChatDir(userId) {
  return path.join(userRoot(userId), "chat");
}

function userProfileDir(userId) {
  return path.join(userRoot(userId), "profile");
}

function ensureUserDirs(userId) {
  const base = userRoot(userId);
  fs.mkdirSync(path.join(base, "raw"), { recursive: true });
  fs.mkdirSync(path.join(base, "parsed"), { recursive: true });
  fs.mkdirSync(path.join(base, "chat"), { recursive: true });
  fs.mkdirSync(path.join(base, "profile"), { recursive: true });
}

function relativeFromProject(absPath) {
  return path.relative(PROJECT_ROOT, absPath).replace(/\\/g, "/");
}

function chatThreadBaseName(fileId) {
  let fid = String(fileId || "").trim();
  if (!fid) fid = "default";
  if (fid === "default") return "default";
  if (/^[a-f0-9]{24}$/i.test(fid)) return fid;
  return fid.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "thread";
}

function chatThreadFileName(fileId) {
  return `${chatThreadBaseName(fileId)}.json`;
}

function chatThreadAbsPath(userId, fileId) {
  return path.join(userChatDir(userId), chatThreadFileName(fileId));
}

function isUserStoragePathForUid(norm, uid) {
  const u = String(uid || "").trim();
  if (!u) return false;
  const prefix = `data/users/${u}/`;
  if (norm.startsWith(prefix + "parsed/") || norm.startsWith(prefix + "raw/")) return true;
  return (
    norm.startsWith(`data/storage/parsed_json/${u}/`) || norm.startsWith(`data/storage/raw_uploads/${u}/`)
  );
}

module.exports = {
  PROJECT_ROOT,
  userRoot,
  userRawDir,
  userParsedDir,
  userChatDir,
  userProfileDir,
  ensureUserDirs,
  relativeFromProject,
  chatThreadAbsPath,
  chatThreadFileName,
  isUserStoragePathForUid,
};
