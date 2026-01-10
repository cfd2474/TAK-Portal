const settingsSvc = require("./settings.service");
const usersService = require("./users.service");
const agenciesStore = require("./agencies.service");

/**
 * Dashboard Authentik Stats Cache
 *
 * Purpose:
 * - Keep the Dashboard fast even with many users/groups.
 * - Refresh Authentik-derived stats in the background on a fixed interval.
 *
 * Scope:
 * - ONLY used by the dashboard route. Other routes remain live/uncached.
 *
 * Note:
 * - Refresh interval is read at startup from settings.json:
 *   DASHBOARD_AUTHENTIK_STATS_REFRESH_SECONDS (default 300).
 * - Changing the setting requires a server restart to take effect.
 */

let _timer = null;

const _state = {
  refreshedAt: null,
  lastError: null,
  // Computed dashboard payload (Authentik-derived + agency metadata)
  snapshot: {
    stats: {
      totalUsers: 0,
      totalGroups: 0,
      totalAgencies: 0,
    },
    charts: {
      usersByAgency: {},
      unknownAgency: 0,
      usersByType: {},
      unknownType: 0,
    },
  },
};

function parseRefreshSeconds(v, fallback) {
  const n = parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  // Protect from accidental tiny values
  return Math.max(n, 15);
}

function buildCharts(users, agencies) {
  const agenciesNorm = (agencies || [])
    .map((a) => ({
      name: String(a.name || "").trim(),
      type: String(a.type || "").trim(), // Fire, EMS, Law, etc
      suffix: String(a.suffix || "").trim().toLowerCase(),
    }))
    .filter((a) => a.name && a.suffix);

  const bySuffix = new Map();
  for (const a of agenciesNorm) bySuffix.set(a.suffix, a);

  const usersByAgency = {};
  const usersByType = {};
  let unknownAgency = 0;
  let unknownType = 0;

  for (const u of users || []) {
    const username = String(u.username || "").trim().toLowerCase();

    // detect agency suffix from username convention: "name.suffix"
    const parts = username.split(".");
    const suffix = parts.length > 1 ? parts[parts.length - 1] : "";

    const agency = suffix ? bySuffix.get(suffix) : null;

    if (!agency) {
      unknownAgency += 1;
      unknownType += 1;
      continue;
    }

    const agencyName = agency.name || suffix.toUpperCase();
    const agencyType = agency.type || "Unknown";

    usersByAgency[agencyName] = (usersByAgency[agencyName] || 0) + 1;
    usersByType[agencyType] = (usersByType[agencyType] || 0) + 1;
  }

  return { usersByAgency, unknownAgency, usersByType, unknownType };
}

async function refreshNow() {
  try {
    const [users, groups] = await Promise.all([
      usersService.getAllUsers(),
      usersService.getAllGroups(),
    ]);

    const agencies = agenciesStore.load();
    const charts = buildCharts(users, agencies);

    _state.snapshot = {
      stats: {
        totalUsers: Array.isArray(users) ? users.length : 0,
        totalGroups: Array.isArray(groups) ? groups.length : 0,
        totalAgencies: Array.isArray(agencies) ? agencies.length : 0,
      },
      charts,
    };

    _state.refreshedAt = new Date();
    _state.lastError = null;
  } catch (err) {
    _state.lastError = err?.response?.data || err?.message || String(err);
    // Keep prior snapshot to avoid breaking dashboard entirely
    console.error("[DASHBOARD] Authentik stats refresh failed:", _state.lastError);
  }
}

function startDashboardStatsRefresher() {
  if (_timer) return; // idempotent

  const seconds = parseRefreshSeconds(
    settingsSvc.get("DASHBOARD_AUTHENTIK_STATS_REFRESH_SECONDS", 300),
    300
  );

  // Initial prime
  refreshNow();

  _timer = setInterval(refreshNow, seconds * 1000);
  // don't keep process alive purely because of this interval
  if (typeof _timer.unref === "function") _timer.unref();

  console.log(
    `[DASHBOARD] Authentik stats cache enabled: refresh every ${seconds}s`
  );
}

function getDashboardStatsSnapshot() {
  const refreshedAt = _state.refreshedAt;
  const ageMs = refreshedAt ? Date.now() - refreshedAt.getTime() : null;

  return {
    ..._state.snapshot,
    refreshedAt,
    ageMs,
    error: _state.lastError,
  };
}

module.exports = {
  startDashboardStatsRefresher,
  refreshNow,
  getDashboardStatsSnapshot,
};
