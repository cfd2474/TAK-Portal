/**
 * services/settings.service.js
 *
 * Central settings store backed by data/settings.json.
 * All former .env and bookmarks.env values (except WEB_UI_PORT)
 * now live here as flat key/value pairs.
 *
 * The keys intentionally match the old env var names so existing
 * code can read them via services/env.js helpers.
 */

const fs = require("fs");
const path = require("path");

const SETTINGS_PATH = path.join(__dirname, "..", "data", "settings.json");

function ensureDirExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

let _settings = null;

function loadSettingsFromDisk() {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (err) {
    // Fall through to default empty object if missing or invalid.
    console.warn("[settings] Failed to read settings.json, using empty defaults:", err.message || err);
  }

  return {};
}

function getSettings() {
  if (_settings === null) {
    _settings = loadSettingsFromDisk();
  }
  return _settings;
}

function saveSettings(newSettings) {
  _settings = newSettings || {};
  ensureDirExists(SETTINGS_PATH);
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(_settings, null, 2));
}

function updateSettings(patch) {
  const merged = { ...getSettings(), ...(patch || {}) };
  saveSettings(merged);
}

function get(name, fallback) {
  const cfg = getSettings();
  if (Object.prototype.hasOwnProperty.call(cfg, name)) {
    return cfg[name];
  }
  return fallback;
}

module.exports = {
  SETTINGS_PATH,
  getSettings,
  saveSettings,
  updateSettings,
  get,
};
