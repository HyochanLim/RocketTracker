const mongodb = require("mongodb");
const FlightFile = require("../models/flight-file.model");

/**
 * For routes with `:fileId` — loads the saved flight belonging to the session user
 * and attaches a plain object to `req.selectedFlightFile`.
 *
 * Shape:
 *   { id, originalName, storedPath, rawStoredPath, recordCount, size, mimeType, sourceExt, fileHash, createdAt }
 */
async function resolveSelectedFlightFile(req, res, next) {
  try {
    const fileId = req.params.fileId;
    if (!fileId || !mongodb.ObjectId.isValid(fileId)) {
      return res.status(422).json({ ok: false, message: "Invalid file id." });
    }

    const uid = req.session && req.session.uid;
    if (!uid) {
      return res.status(401).json({ ok: false, message: "Unauthorized." });
    }

    const fileDoc = await FlightFile.findByIdForUser(uid, fileId);
    if (!fileDoc) {
      return res.status(404).json({ ok: false, message: "Saved file not found." });
    }

    req.selectedFlightFile = {
      id: fileDoc._id.toString(),
      originalName: fileDoc.originalName,
      storedPath: fileDoc.storedPath,
      rawStoredPath: fileDoc.rawStoredPath,
      recordCount: fileDoc.recordCount,
      size: fileDoc.size,
      mimeType: fileDoc.mimeType,
      sourceExt: fileDoc.sourceExt,
      fileHash: fileDoc.fileHash,
      createdAt: fileDoc.createdAt,
    };

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = resolveSelectedFlightFile;
