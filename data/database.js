const mongodb = require("mongodb");
const { mongoUri, mongoDbName } = require("../util/env-config");

const MongoClient = mongodb.MongoClient;
let database;

async function connectToDatabase() {
  const client = await MongoClient.connect(mongoUri());
  database = client.db(mongoDbName());
}

function getDb() {
  if (!database) throw new Error("Database not connected");
  return database;
}

module.exports = { connectToDatabase, getDb };
