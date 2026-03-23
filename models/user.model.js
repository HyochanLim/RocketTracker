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
    });
  }

  static updateProfile(userId, profileData) {
    return db.getDb().collection("users").updateOne(
      { _id: new mongodb.ObjectId(userId) },
      {
        $set: {
          email: profileData.email,
          displayName: profileData.displayName,
          imageUrl: profileData.imageUrl,
        },
      }
    );
  }
}

module.exports = User;
