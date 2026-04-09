"use strict";

const fs = require("fs");
const http = require("http");
const layout = require("../util/user-data-layout");
const ChatThread = require("../models/chat-thread.model");

const TEST_UID = "507f1f77bcf86cd799439011";

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

async function smokeLayoutAndChat() {
  layout.ensureUserDirs(TEST_UID);

  assert(layout.isUserStoragePathForUid(`data/users/${TEST_UID}/parsed/flight.json`, TEST_UID), "parsed path should belong");
  assert(layout.isUserStoragePathForUid(`data/users/${TEST_UID}/raw/a.csv`, TEST_UID), "raw path should belong");
  assert(!layout.isUserStoragePathForUid(`data/users/otheruserid/parsed/x.json`, TEST_UID), "other user deny");
  assert(layout.isUserStoragePathForUid(`data/storage/parsed_json/${TEST_UID}/legacy.json`, TEST_UID), "legacy parsed allow");
  assert(layout.isUserStoragePathForUid(`data/storage/raw_uploads/${TEST_UID}/legacy.csv`, TEST_UID), "legacy raw allow");

  await ChatThread.upsertMessages(TEST_UID, "default", [{ role: "user", content: "smoke-test" }]);
  const t = await ChatThread.getByUserAndFile(TEST_UID, "default");
  assert(t && Array.isArray(t.messages) && t.messages.length === 1, "chat round-trip");
  assert(t.messages[0].content === "smoke-test", "chat content");

  const chatAbs = layout.chatThreadAbsPath(TEST_UID, "default");
  fs.unlinkSync(chatAbs);
}

function httpGet(url) {
  return new Promise(function (resolve, reject) {
    http
      .get(url, function (res) {
        res.resume();
        resolve(res.statusCode);
      })
      .on("error", reject);
  });
}

async function smokeHttp() {
  const products = await httpGet("http://127.0.0.1:3000/products");
  assert(products === 200, "GET /products expected 200, got " + products);

  const badMedia = await httpGet("http://127.0.0.1:3000/profile-media/not-an-objectid/foo.png");
  assert(badMedia === 404, "invalid profile-media expected 404, got " + badMedia);
}

async function main() {
  await smokeLayoutAndChat();
  await smokeHttp();
  console.log("smoke-user-data-layout: OK");
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
