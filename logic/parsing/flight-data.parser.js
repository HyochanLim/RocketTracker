const fs = require("fs/promises");
const path = require("path");
const xlsx = require("xlsx");

function tryToNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed === "") return value;
  const asNumber = Number(trimmed);
  return Number.isNaN(asNumber) ? value : asNumber;
}

function normalizeRow(row) {
  const normalized = {};
  Object.keys(row).forEach(function (key) {
    const value = row[key];
    if (key === "current_time") {
      const converted = tryToNumber(value);
      normalized.time = typeof converted === "number" ? converted / 1000 : converted;
      return;
    }
    normalized[key] = tryToNumber(value);
  });
  return normalized;
}

function disambiguateHeaders(rawHeaders) {
  const seen = {};
  return rawHeaders.map(function (name) {
    const safeName = String(name || "").trim();
    const count = seen[safeName] || 0;
    seen[safeName] = count + 1;
    return count === 0 ? safeName : `${safeName}.${count}`;
  });
}

function parseCsvContent(content) {
  const lines = content.split(/\r?\n/).filter(function (line) {
    return line.trim().length > 0;
  });
  if (lines.length === 0) return [];

  const headers = disambiguateHeaders(lines[0].split(","));
  const records = [];

  for (let i = 1; i < lines.length; i += 1) {
    const parts = lines[i].split(",");
    if (parts.length !== headers.length) continue;
    const row = {};
    headers.forEach(function (header, idx) {
      row[header] = parts[idx].trim();
    });
    records.push(normalizeRow(row));
  }

  return records;
}

function parseJsonContent(content) {
  const parsed = JSON.parse(content);
  if (Array.isArray(parsed)) {
    return parsed.map(function (row) {
      return normalizeRow(row || {});
    });
  }
  if (parsed && typeof parsed === "object") {
    if (Array.isArray(parsed.records)) {
      return parsed.records.map(function (row) {
        return normalizeRow(row || {});
      });
    }
    return [normalizeRow(parsed)];
  }
  return [];
}

function parseExcelFile(filePath) {
  const workbook = xlsx.readFile(filePath);
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });
  return rows.map(function (row) {
    return normalizeRow(row || {});
  });
}

async function parseFlightFileToJson(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".csv") {
    const content = await fs.readFile(filePath, "utf-8");
    return parseCsvContent(content);
  }

  if (ext === ".json") {
    const content = await fs.readFile(filePath, "utf-8");
    return parseJsonContent(content);
  }

  if (ext === ".xlsx" || ext === ".xls") {
    return parseExcelFile(filePath);
  }

  throw new Error("Unsupported file type for parsing.");
}

module.exports = { parseFlightFileToJson };
