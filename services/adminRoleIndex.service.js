const groupsSvc = require("./groups.service");
const agenciesSvc = require("./agencies.service");
const accessSvc = require("./access.service");
const { getString, getInt } = require("./env");

const REFRESH_MS = Math.max(
  60 * 1000,
  Number(getInt("ADMIN_ROLE_INDEX_REFRESH_SECONDS", 600) || 600) * 1000
);

let _snapshot = {
  loadedAt: 0,
  globalAdminUserIds: new Set(),
  agencyAdminUserIdsByAbbr: new Map(), // ABBR -> Set<userId>
};
let _syncInFlight = null;

function parseGroupNames(raw) {
  return String(raw || "")
    .split(",")
    .map((g) => String(g || "").trim().toLowerCase())
    .filter(Boolean);
}

function getUserAgencyAbbrUpper(user) {
  const attrs = user && user.attributes ? user.attributes : {};
  const raw =
    attrs.agency_abbreviation ||
    attrs.agencyAbbreviation ||
    attrs.agencyAbbr ||
    attrs.agencyabbr ||
    "";
  return String(raw || "").trim().toUpperCase();
}

function toIdSet(value) {
  const out = new Set();
  const arr = Array.isArray(value) ? value : [];
  for (const id of arr) {
    const s = String(id || "").trim();
    if (s) out.add(s);
  }
  return out;
}

async function rebuildSnapshot() {
  const groups = await groupsSvc.getAllGroups({ includeHidden: true });
  const list = Array.isArray(groups) ? groups : [];

  const byNameLower = new Map();
  for (const g of list) {
    const name = String(g?.name || "").trim().toLowerCase();
    if (!name) continue;
    byNameLower.set(name, g);
  }

  const globalAdminNames = parseGroupNames(getString("PORTAL_AUTH_REQUIRED_GROUP", ""));
  const globalAdminUserIds = new Set();

  for (const nameLower of globalAdminNames) {
    const group = byNameLower.get(nameLower);
    if (!group) continue;
    const ids = toIdSet(group?.users);
    for (const id of ids) globalAdminUserIds.add(id);
  }

  const agencies = agenciesSvc.load();
  const agencyAdminUserIdsByAbbr = new Map();
  for (const agency of Array.isArray(agencies) ? agencies : []) {
    const abbrUpper = String(agency?.groupPrefix || "").trim().toUpperCase();
    if (!abbrUpper) continue;

    // Support county-prefixed and legacy naming.
    const candidateNames = [
      String(accessSvc.getAgencyAdminGroupName(agency) || "").trim(),
      `authentik-${abbrUpper}-AgencyAdmin`,
    ]
      .map((n) => n.toLowerCase())
      .filter(Boolean);

    const userIdsForAbbr = new Set();
    for (const candidate of candidateNames) {
      const group = byNameLower.get(candidate);
      if (!group) continue;
      const ids = toIdSet(group?.users);
      for (const id of ids) userIdsForAbbr.add(id);
    }

    if (userIdsForAbbr.size > 0) {
      agencyAdminUserIdsByAbbr.set(abbrUpper, userIdsForAbbr);
    }
  }

  _snapshot = {
    loadedAt: Date.now(),
    globalAdminUserIds,
    agencyAdminUserIdsByAbbr,
  };
  return _snapshot;
}

async function refreshNow() {
  if (_syncInFlight) return _syncInFlight;
  _syncInFlight = rebuildSnapshot().finally(() => {
    _syncInFlight = null;
  });
  return _syncInFlight;
}

function getRoleForUser(user) {
  const id = String(user?.pk ?? user?.id ?? "").trim();
  if (!id) return "User";

  if (_snapshot.globalAdminUserIds.has(id)) return "Global Admin";

  const abbrUpper = getUserAgencyAbbrUpper(user);
  const agencySet = abbrUpper ? _snapshot.agencyAdminUserIdsByAbbr.get(abbrUpper) : null;
  if (agencySet && agencySet.has(id)) return "Agency Admin";

  return "User";
}

function attachRoles(users) {
  const arr = Array.isArray(users) ? users : [];
  return arr.map((u) => ({ ...u, __role: getRoleForUser(u) }));
}

function init() {
  refreshNow().catch((err) => {
    console.warn("[adminRoleIndex] initial sync failed:", err?.message || err);
  });

  const timer = setInterval(() => {
    refreshNow().catch((err) => {
      console.warn("[adminRoleIndex] periodic sync failed:", err?.message || err);
    });
  }, REFRESH_MS);
  timer.unref?.();
}

module.exports = {
  init,
  refreshNow,
  getRoleForUser,
  attachRoles,
};

