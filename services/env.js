/**
 * services/env.js
 *
 * Helpers for reading env vars safely.
 *
 * Why: dotenv does not reliably support inline comments. If your .env has:
 *   FOO=false  # comment
 * many dotenv versions will treat the whole right-hand side as the value.
 * These helpers strip inline comments and whitespace so the app behaves
 * as intended.
 */

function rawEnv(name) {
  if (!Object.prototype.hasOwnProperty.call(process.env, name)) return undefined;
  return String(process.env[name] ?? "");
}

function stripInlineComment(value) {
  // Remove everything after an unquoted #
  // We keep it simple: split at first #.
  const s = String(value ?? "");
  const idx = s.indexOf("#");
  const noComment = idx >= 0 ? s.slice(0, idx) : s;
  return noComment.trim();
}

function getString(name, fallback = "") {
  const v = rawEnv(name);
  if (v === undefined) return fallback;
  return stripInlineComment(v);
}

function getBool(name, fallback = false) {
  const v = getString(name, "");
  if (!v) return fallback;
  const token = v.split(/\s+/)[0].trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(token)) return true;
  if (["0", "false", "no", "n", "off"].includes(token)) return false;
  return fallback;
}

function getInt(name, fallback) {
  const v = getString(name, "");
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

module.exports = {
  getString,
  getBool,
  getInt,
  stripInlineComment,
};
