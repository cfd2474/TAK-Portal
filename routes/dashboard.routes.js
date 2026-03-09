const router = require("express").Router();
const dashboardStatsCache = require("../services/dashboardStatsCache.service");
const mutualAidService = require("../services/mutualAid.service");
const bookmarksService = require("../services/bookmarks.service");
const { getTakMetricsSnapshot } = require("../services/takMetrics.service");
const userRequestsSvc = require("../services/userRequests.service");


router.get("/", async (req, res) => {
  try {
    const { stats, charts } = dashboardStatsCache.getDashboardStatsSnapshot();
    const bookmarks = bookmarksService.loadBookmarks();

    // --- TAK server health metrics (best-effort; dashboard still loads if TAK is down) ---
    const takMetrics = await getTakMetricsSnapshot().catch(() => null);

    // --- Mutual Aid active banners ---
    const pendingUserRequestsCount = userRequestsSvc.countRequestsForUser(req.authentikUser);
    let activeIncidentCount = 0;
    let activeEventCount = 0;
    try {
      const nowMs = Date.now();
      const items = mutualAidService.list();
      for (const it of items) {
        const t = String(it.type || "").trim().toUpperCase();
        const enabled = !!it.expireEnabled;
        const atMs = it.expireAt ? new Date(it.expireAt).getTime() : NaN;
        const expired = enabled && Number.isFinite(atMs) && atMs <= nowMs;
        if (expired) continue;
        if (t === "INCIDENT") activeIncidentCount += 1;
        if (t === "EVENT") activeEventCount += 1;
      }
    } catch (e) {
      console.error("[DASHBOARD] MutualAid stats failed:", e?.message || e);
    }

    const viewModel = {
      stats: {
        totalUsers: stats?.totalUsers ?? 0,
        totalGroups: stats?.totalGroups ?? 0,
        totalAgencies: stats?.totalAgencies ?? 0,
        totalIntegrations: stats?.totalIntegrations ?? 0,
      },
      mutualAid: {
        activeIncidents: activeIncidentCount,
        activeEvents: activeEventCount,
      },
      charts: charts || {
        usersByAgency: {},
        unknownAgency: 0,
        usersByType: {},
        unknownType: 0,
      },
      bookmarks,
      takMetrics,
      pendingUserRequestsCount, 
    };

    res.render("dashboard", viewModel);
  } catch (err) {
    console.error("[DASHBOARD] failed:", err?.message || err);

    const bookmarks = bookmarksService.loadBookmarks();
    const viewModel = {
      stats: {
        totalUsers: 0,
        totalGroups: 0,
        totalAgencies: 0,
        totalIntegrations: 0,
      },
      mutualAid: {
        activeIncidents: 0,
        activeEvents: 0,
      },
      charts: {
        usersByAgency: {},
        unknownAgency: 0,
        usersByType: {},
        unknownType: 0,
      },
      bookmarks,
      takMetrics: null,
      pendingUserRequestsCount: userRequestsSvc.countRequestsForUser(req.authentikUser), 
      error: err?.response?.data || err?.message || "Failed to load dashboard",
    };

    res.status(500).render("dashboard", viewModel);
  }
});

module.exports = router;
