const fs = require("fs");
const path = require("path");

const rawFlightDataPath = path.join(__dirname, "rawFlightData.json");

module.exports = {};
Object.defineProperty(module.exports, "rawFlightData", {
  enumerable: true,
  get() {
    try {
      return JSON.parse(fs.readFileSync(rawFlightDataPath, "utf8"));
    } catch {
      return null;
    }
  },
});
