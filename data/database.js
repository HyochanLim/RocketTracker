const mongodb = require("mongodb");
const { mongoUri, mongoDbName } = require("../util/env-config");

const MongoClient = mongodb.MongoClient;
let database;

function mongoUri() {
  return String(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017").trim();
}

function mongoDbName() {
  return String(process.env.MONGODB_DB_NAME || "orbit").trim();
}

async function connectToDatabase() {
  const client = await MongoClient.connect(mongoUri());
  database = client.db(mongoDbName());
}

function getDb() {
  if (!database) throw new Error("Database not connected");
  return database;
}

module.exports = { connectToDatabase, getDb };
