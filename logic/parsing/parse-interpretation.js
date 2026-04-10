/**
 * Human-readable summary of how flight rows were mapped and normalized.
 * Used after upload so the user can confirm time/units/coordinates before trusting the map.
 */

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function guessTimeUnitFromRawSample(rawVal) {
  const n = toNum(rawVal);
  if (n == null) return { unit: "unknown", note: "no numeric sample" };
  const a = Math.abs(n);
  if (a > 1e12) return { unit: "likely_unix_ms", note: "large magnitude → treated as ms then seconds" };
  if (a > 1e9) return { unit: "likely_unix_s", note: "epoch-style seconds" };
  if (a < 1e6) return { unit: "likely_elapsed_s_or_index", note: "small values → seconds or row index" };
  return { unit: "ambiguous", note: "check column meaning" };
}

function guessAltitudeUnitFromColumnName(col) {
  const s = String(col || "").toLowerCase();
  if (!s) return { unit: "meters_assumed", note: "no altitude column name" };
  if (/\b(ft|feet|foot)\b/.test(s) || /_ft\b/.test(s)) return { unit: "feet_in_name", note: "name suggests feet (values not auto-converted yet)" };
  if (/\b(m|meter|metre|alt_m)\b/.test(s)) return { unit: "meters_in_name", note: "name suggests meters" };
  return { unit: "meters_assumed", note: "default meters unless you say otherwise" };
}

function confidenceFromMapping(m) {
  let score = 0.5;
  if (m && m.time) score += 0.15;
  if (m && m.latitude && m.longitude) score += 0.25;
  else if (m && m.x && m.y) score += 0.2;
  if (m && m.altitude) score += 0.1;
  return Math.min(0.95, Math.max(0.2, score));
}

/**
 * @param {object} aiParsed - output of parseRowsWithAiAgent (mapping, standardizedRecords, warnings, …)
 * @param {{ filename?: string }} [meta]
 */
function buildParseInterpretation(aiParsed, meta) {
  const m = (aiParsed && aiParsed.mapping) || {};
  const records = Array.isArray(aiParsed && aiParsed.standardizedRecords) ? aiParsed.standardizedRecords : [];
  const first = records[0] || {};
  const raw = first.raw && typeof first.raw === "object" ? first.raw : {};
  const timeCol = m.time || null;
  const rawTimeSample = timeCol != null ? raw[timeCol] : null;
  const timeGuess = guessTimeUnitFromRawSample(rawTimeSample);
  const altCol = m.altitude || null;
  const altGuess = guessAltitudeUnitFromColumnName(altCol);

  const lines = [];
  const fn = (meta && meta.filename) || "file";
  lines.push(`Parsed “${fn}” using column mapping below. Please confirm before trusting analysis.`);

  if (timeCol) {
    lines.push(
      `Time column: “${timeCol}”. Sample suggests: ${timeGuess.unit.replace(/_/g, " ")} (${timeGuess.note}).`,
    );
  } else {
    lines.push("Time column: not mapped — using row index as time where needed.");
  }

  if (m.latitude && m.longitude) {
    lines.push(`Position: latitude “${m.latitude}”, longitude “${m.longitude}” (assumed decimal degrees).`);
  } else if (m.x && m.y) {
    lines.push(`Position: x “${m.x}”, y “${m.y}” (coordinate frame not verified here).`);
  } else {
    lines.push("Position: incomplete mapping — trajectory may be missing or fallback to raw parser.");
  }

  if (altCol) {
    lines.push(`Altitude column: “${altCol}”. ${altGuess.unit.replace(/_/g, " ")} — ${altGuess.note}.`);
  } else {
    lines.push("Altitude: not mapped — altitude may default to 0 or come from raw parser.");
  }

  const warns = Array.isArray(aiParsed && aiParsed.warnings) ? aiParsed.warnings : [];
  if (warns.length) {
    lines.push(`Notes: ${warns.join(" ")}`);
  }

  lines.push(
    "If anything is wrong, tell the flight assistant (e.g. “time is in milliseconds” or “altitude is feet”) and ask to re-process or analyze with that assumption.",
  );

  return {
    confidence: confidenceFromMapping(m),
    fields: {
      time: { column: timeCol, unitGuess: timeGuess.unit, detail: timeGuess.note },
      altitude: { column: altCol, unitGuess: altGuess.unit, detail: altGuess.note },
      latitude: m.latitude || null,
      longitude: m.longitude || null,
    },
    lines,
    promptForUser: "Does this column and unit interpretation look correct?",
  };
}

module.exports = { buildParseInterpretation };
