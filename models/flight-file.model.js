const mongodb = require("mongodb");
const db = require("../data/database");

class FlightFile {
  static create(doc) {
    return db.getDb().collection("flight_files").insertOne(doc);
  }

  static findByUser(userId) {
    return db
      .getDb()
      .collection("flight_files")
      .find({ userId: new mongodb.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .toArray();
  }

  static findByUserAndHash(userId, fileHash) {
    return db.getDb().collection("flight_files").findOne({
      userId: new mongodb.ObjectId(userId),
      fileHash,
    });
  }

  static findByIdForUser(userId, fileId) {
    return db.getDb().collection("flight_files").findOne({
      _id: new mongodb.ObjectId(fileId),
      userId: new mongodb.ObjectId(userId),
    });
  }

}

module.exports = FlightFile;
