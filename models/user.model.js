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
      proUntil: null,
      proUpdatedAt: null,
      proSource: "",
      proStatus: "free",
      paypalSubscriptionId: "",
      paypalOrderId: "",
      paypalPayerId: "",
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
      proUntil: userDoc.proUntil || null,
    };
  }

  static isPro(userDoc, now = new Date()) {
    if (!userDoc) return false;
    const until = userDoc.proUntil ? new Date(userDoc.proUntil) : null;
    if (!until || Number.isNaN(until.getTime())) return false;
    return until.getTime() > now.getTime();
  }

  static setProUntil(userId, proUntil, meta = {}) {
    const until = proUntil ? new Date(proUntil) : null;
    if (!until || Number.isNaN(until.getTime())) {
      return Promise.resolve({ matchedCount: 0, modifiedCount: 0 });
    }
    const update = {
      proUntil: until,
      proUpdatedAt: new Date(),
    };
    if (meta && typeof meta === "object") {
      if (typeof meta.source === "string") update.proSource = meta.source;
      if (typeof meta.paypalSubscriptionId === "string") update.paypalSubscriptionId = meta.paypalSubscriptionId;
      if (typeof meta.paypalOrderId === "string") update.paypalOrderId = meta.paypalOrderId;
      if (typeof meta.paypalPayerId === "string") update.paypalPayerId = meta.paypalPayerId;
      if (typeof meta.status === "string") update.proStatus = meta.status;
    }
    return db.getDb().collection("users").updateOne(
      { _id: new mongodb.ObjectId(userId) },
      { $set: update }
    );
  }

  static getByPayPalSubscriptionId(subscriptionId) {
    const id = String(subscriptionId || "").trim();
    if (!id) return Promise.resolve(null);
    return db.getDb().collection("users").findOne({ paypalSubscriptionId: id });
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
