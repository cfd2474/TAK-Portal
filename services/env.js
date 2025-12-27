/**
 * services/env.js
 *
 * Helpers for reading configuration values safely.
 *
 * All former .env values (except WEB_UI_PORT) now live in data/settings.json
 * and are read via services/settings.service.js. We still fall back to
 * process.env[...] so WEB_UI_PORT (and any future process-level vars)
 * continue to work.
 */

const settingsStore = require("./settings.service");

/**
 * Strip anything that looks like an inline comment (after "#" or ";")
 * and trim whitespace.
 */
function stripInlineComment(raw) {
  if (typeof raw !== "string") return "";
  const hashIndex = raw.indexOf("#");
  const semicolonIndex = raw.indexOf(";");
  let end = raw.length;
  if (hashIndex !== -1) end = Math.min(end, hashIndex);
  if (semicolonIndex !== -1) end = Math.min(end, semicolonIndex);
  return raw.slice(0, end).trim();
}

/**
 * Raw lookup:
 *   1) Try settings.json
 *   2) Fall back to process.env
 */
function rawEnv(name) {
  const fromSettings = settingsStore.get(name, undefined);
  if (fromSettings !== undefined) {
    return String(fromSettings ?? "");
  }

  if (!Object.prototype.hasOwnProperty.call(process.env, name)) return undefined;
  return String(process.env[name] ?? "");
}

function getString(name, fallback) {
  const raw = rawEnv(name);
  if (raw === undefined || raw === null) return fallback;
  const v = stripInlineComment(String(raw));
  return v === "" ? fallback : v;
}

function getBool(name, fallback) {
  const v = String(getString(name, "")).toLowerCase();
  if (!v) return fallback;
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return fallback;
}

function getInt(name, fallback) {
  const v = getString(name, "");
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

module.exports = {
  getString,
  getBool,
  getInt,
  stripInlineComment,
};
