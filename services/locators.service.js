/**
 * Persisted locators (missing-person share links) and ping history.
 * Storage: data/locators.json
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");
const axios = require("axios");
const { getString, getBool } = require("./env");
const settingsSvc = require("./settings.service");

function resolvePathMaybe(p) {
  if (!p || !String(p).trim()) return null;
  const raw = String(p).trim();
  return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
}

/**
 * HTTPS agent for outbound GETs to TAK /locate/api (same host as TAK_URL).
 * - Prefer TAK_CA_PATH (PEM) so Node trusts your TAK server chain.
 * - If the server uses self-signed TLS and you have no CA PEM, set
 *   TAK_LOCATE_RELAY_TLS_INSECURE=true in env or Server Settings (lab only).
 */
function getLocateRelayHttpsAgent() {
  const insecure = getBool("TAK_LOCATE_RELAY_TLS_INSECURE", false);
  if (insecure) {
    return new https.Agent({
      rejectUnauthorized: false,
      checkServerIdentity: () => undefined,
    });
  }

  const caPath = resolvePathMaybe(getString("TAK_CA_PATH", ""));
  const opts = {
    rejectUnauthorized: true,
    checkServerIdentity: () => undefined,
  };
  if (caPath && fs.existsSync(caPath)) {
    opts.ca = fs.readFileSync(caPath);
  }
  return new https.Agent(opts);
}

const FILE = path.join(__dirname, "..", "data", "locators.json");

function defaultStore() {
  return { locators: [], history: [] };
}

function load() {
  if (!fs.existsSync(FILE)) return defaultStore();
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return defaultStore();
    if (!Array.isArray(data.locators)) data.locators = [];
    if (!Array.isArray(data.history)) data.history = [];
    return data;
  } catch {
    return defaultStore();
  }
}

function save(data) {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), "utf8");
}

function titleToSlug(title) {
  const s = String(title || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return s || "locator";
}

function getTakLocateApiBase() {
  const raw = String(settingsSvc.getSettings()?.TAK_URL || getString("TAK_URL", "") || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    return `${u.origin}/locate/api`;
  } catch {
    return "";
  }
}

function getBySlug(slug) {
  const s = String(slug || "").trim().toLowerCase();
  return load().locators.find((l) => l.slug === s) || null;
}

function getById(id) {
  return load().locators.find((l) => l.id === id) || null;
}

function listLocatorsForAdmin() {
  const data = load();
  const locators = data.locators.slice().sort((a, b) => {
    const ua = String(a.updatedAt || a.createdAt || "");
    const ub = String(b.updatedAt || b.createdAt || "");
    return ub.localeCompare(ua);
  });
  return locators.map((l) => {
    const pings = data.history.filter((h) => h.locatorId === l.id);
    const last = pings.sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
    return {
      ...l,
      lastPingAt: last ? last.at : null,
    };
  });
}

function create({ title, pingIntervalSeconds }) {
  const titleStr = String(title || "").trim();
  if (!titleStr) throw new Error("Title is required.");
  const ping = Math.max(10, Math.min(86400, Number(pingIntervalSeconds) || 60));

  let slug = titleToSlug(titleStr);
  const data = load();
  let n = 0;
  while (data.locators.some((l) => l.slug === slug)) {
    n += 1;
    slug = `${titleToSlug(titleStr)}-${n}`;
  }

  const now = new Date().toISOString();
  const loc = {
    id: crypto.randomUUID(),
    slug,
    title: titleStr,
    pingIntervalSeconds: ping,
    active: true,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  data.locators.push(loc);
  save(data);
  return loc;
}

function update(id, patch) {
  const data = load();
  const idx = data.locators.findIndex((l) => l.id === id);
  if (idx < 0) throw new Error("Locator not found.");
  const l = { ...data.locators[idx] };

  if (patch.title !== undefined) {
    const t = String(patch.title || "").trim();
    if (t) l.title = t;
  }
  if (patch.pingIntervalSeconds !== undefined) {
    l.pingIntervalSeconds = Math.max(10, Math.min(86400, Number(patch.pingIntervalSeconds) || 60));
  }
  if (patch.active !== undefined) l.active = !!patch.active;

  l.updatedAt = new Date().toISOString();
  data.locators[idx] = l;
  save(data);
  return l;
}

function archive(id) {
  const data = load();
  const idx = data.locators.findIndex((l) => l.id === id);
  if (idx < 0) throw new Error("Locator not found.");
  data.locators[idx].archived = true;
  data.locators[idx].active = false;
  data.locators[idx].updatedAt = new Date().toISOString();
  save(data);
  return data.locators[idx];
}

function addHistoryEntry({ locatorId, latitude, longitude, name, remarks, kind }) {
  const data = load();
  const entry = {
    id: crypto.randomUUID(),
    locatorId,
    at: new Date().toISOString(),
    latitude: latitude == null ? null : Number(latitude),
    longitude: longitude == null ? null : Number(longitude),
    name: String(name || "").trim(),
    remarks: String(remarks || "").trim(),
    kind: kind === "manual" ? "manual" : "interval",
  };
  data.history.push(entry);

  const li = data.locators.findIndex((l) => l.id === locatorId);
  if (li >= 0) {
    data.locators[li].updatedAt = entry.at;
  }

  const forLoc = data.history.filter((h) => h.locatorId === locatorId);
  if (forLoc.length > 5000) {
    const sorted = forLoc.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const drop = sorted.slice(0, forLoc.length - 5000).map((h) => h.id);
    data.history = data.history.filter((h) => !drop.includes(h.id));
  }
  save(data);
  return entry;
}

function listHistory(locatorId, { limit = 200 } = {}) {
  const data = load();
  return data.history
    .filter((h) => h.locatorId === locatorId)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, limit);
}

function addManualOperatorPing(locatorId) {
  return addHistoryEntry({
    locatorId,
    latitude: null,
    longitude: null,
    name: "(operator)",
    remarks: "Manual ping recorded from portal (no coordinates).",
    kind: "manual",
  });
}

/**
 * Relay a position ping to the TAK Server locate API (server-side; avoids browser CORS).
 */
async function relayPingToTak({ latitude, longitude, name, remarks }) {
  const base = getTakLocateApiBase();
  if (!base) {
    throw new Error("TAK_URL is not configured in Server Settings; cannot reach the TAK locate API.");
  }
  const u = new URL(base);
  u.searchParams.set("latitude", String(latitude));
  u.searchParams.set("longitude", String(longitude));
  u.searchParams.set("name", name);
  u.searchParams.set("remarks", remarks || "");
  try {
    const resp = await axios.get(u.toString(), {
      timeout: 25000,
      httpsAgent: getLocateRelayHttpsAgent(),
      validateStatus: (s) => s >= 200 && s < 600,
    });
    if (resp.status < 200 || resp.status >= 300) {
      throw new Error(`TAK locate API returned HTTP ${resp.status}. Check TAK_URL and that locate is enabled on the server.`);
    }
  } catch (err) {
    const msg = err?.message || String(err);
    const code = err?.code || "";
    if (
      code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
      code === "CERT_HAS_EXPIRED" ||
      code === "SELF_SIGNED_CERT_IN_CHAIN" ||
      /self-signed certificate/i.test(msg) ||
      /unable to verify the first certificate/i.test(msg)
    ) {
      throw new Error(
        "TLS verification failed when calling the TAK locate API. " +
          "Upload your TAK CA to TAK_CA_PATH in Server Settings, or for lab systems only set TAK_LOCATE_RELAY_TLS_INSECURE=true."
      );
    }
    throw err;
  }
}

module.exports = {
  FILE,
  titleToSlug,
  getTakLocateApiBase,
  getBySlug,
  getById,
  listLocatorsForAdmin,
  create,
  update,
  archive,
  addHistoryEntry,
  listHistory,
  addManualOperatorPing,
  relayPingToTak,
};
