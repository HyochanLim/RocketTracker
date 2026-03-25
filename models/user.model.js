const bcrypt = require("bcrypt");
const db = require("../data/database");
const mongodb = require("mongodb");

class User {
  constructor(email, password, displayName) {
    this.email = email;
    this.password = password;
    this.displayName = displayName;
  }

  getByEmail() {
    return db.getDb().collection("users").findOne({ email: this.email });
  }

  static getById(userId) {
    return db.getDb().collection("users").findOne({ _id: new mongodb.ObjectId(userId) });
  }

  static getByEmail(email) {
    return db.getDb().collection("users").findOne({ email });
  }

  async exists() {
    const user = await this.getByEmail();
    return !!user;
  }

  hasMatchingPassword(hashedPassword) {
    return bcrypt.compare(this.password, hashedPassword);
  }

  async create() {
    const hashedPassword = await bcrypt.hash(this.password, 12);
    await db.getDb().collection("users").insertOne({
      email: this.email,
      displayName: this.displayName,
      password: hashedPassword,
      isAdmin: false,
      imageUrl: "",
      bio: "",
      createdAt: new Date(),
      badges: [],
    });
  }

  static toProfileView(userDoc) {
    if (!userDoc) return null;
    return {
      id: userDoc._id.toString(),
      displayName: userDoc.displayName || "",
      email: userDoc.email || "",
      imageUrl: userDoc.imageUrl || "",
      bio: userDoc.bio || "",
      createdAt: userDoc.createdAt || null,
      badges: Array.isArray(userDoc.badges) ? userDoc.badges : [],
    };
  }

  static addBadge(userId, badgeId) {
    const id = String(badgeId || "").trim();
    if (!id) return Promise.resolve({ matchedCount: 0, modifiedCount: 0 });
    return db.getDb().collection("users").updateOne(
      { _id: new mongodb.ObjectId(userId) },
      { $addToSet: { badges: id } }
    );
  }

  static updateProfile(userId, profileData) {
    const update = {
      email: profileData.email,
      displayName: profileData.displayName,
      imageUrl: profileData.imageUrl,
    };
    if (typeof profileData.bio === "string") {
      update.bio = profileData.bio;
    }
    return db.getDb().collection("users").updateOne(
      { _id: new mongodb.ObjectId(userId) },
      {
        $set: {
          ...update,
        },
      }
    );
  }
}

module.exports = User;
