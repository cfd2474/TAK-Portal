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
// Your template lives at the project root:
const TEMPLATE_PATH = path.join(__dirname, "..", "settings.example.json");

function ensureDirExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

let _settings = null;

function readJsonSafe(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (err) {
    // ignore, caller can handle empty
  }
  return {};
}

/**
 * Merge existing settings with the template:
 * - All keys from template are present
 * - Any user overrides in existing settings win
 */
function mergeWithTemplate(existing) {
  const template = fs.existsSync(TEMPLATE_PATH)
    ? readJsonSafe(TEMPLATE_PATH)
    : {};

  if (!template || Object.keys(template).length === 0) {
    return existing || {};
  }

  const current = existing || {};

  // template provides defaults, existing overrides them
  const merged = { ...template, ...current };

  // If merged and existing differ, we should save.
  const needsSave =
    Object.keys(template).some(
      key => !Object.prototype.hasOwnProperty.call(current, key)
    ) || Object.keys(current).some(key => template[key] !== current[key]);

  return { merged, needsSave };
}

function loadSettingsFromDisk() {
  let existing = {};

  if (fs.existsSync(SETTINGS_PATH)) {
    existing = readJsonSafe(SETTINGS_PATH);
  }

  const { merged, needsSave } = mergeWithTemplate(existing);

  if (!fs.existsSync(SETTINGS_PATH) || needsSave) {
    ensureDirExists(SETTINGS_PATH);
    try {
      fs.writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2));
    } catch (err) {
      console.warn(
        "[settings] Failed to write settings.json:",
        err.message || err
      );
    }
  }

  return merged;
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

/**
 * Make sure settings.json exists and has all keys from the template.
 * Safe to call multiple times.
 */
function ensureSettingsInitialized() {
  _settings = loadSettingsFromDisk();
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
  TEMPLATE_PATH,
  getSettings,
  saveSettings,
  updateSettings,
  ensureSettingsInitialized,
  get,
};
