const fs = require("fs/promises");
const path = require("path");

function disambiguateHeaders(rawHeaders) {
  const seen = {};
  return rawHeaders.map(function (name) {
    const key = String(name || "").trim();
    const count = seen[key] || 0;
    seen[key] = count + 1;
    return count === 0 ? key : `${key}.${count}`;
  });
}

function normalizeRow(headers, values) {
  const row = {};
  headers.forEach(function (header, index) {
    const raw = String(values[index] || "").trim();
    if (header === "current_time") {
      const asNumber = Number(raw);
      row.time = Number.isNaN(asNumber) ? raw : asNumber / 1000;
      return;
    }
    const asNumber = Number(raw);
    row[header] = Number.isNaN(asNumber) ? raw : asNumber;
  });
  return row;
}

async function parseAndSaveRaw(inputPath, outputPath) {
  const content = await fs.readFile(inputPath, "utf-8");
  const lines = content.split(/\r?\n/).filter(function (line) {
    return line.trim().length > 0;
  });
  if (lines.length === 0) {
    await fs.writeFile(outputPath, "[]", "utf-8");
    return;
  }

  const headers = disambiguateHeaders(lines[0].split(","));
  const parsedData = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = lines[i].split(",");
    if (values.length !== headers.length) continue;
    parsedData.push(normalizeRow(headers, values));
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(parsedData, null, 2), "utf-8");
}

module.exports = { parseAndSaveRaw };
