const express = require("express");
const router = express.Router();

const usersService = require("../services/users.service");
const bookmarksService = require("../services/bookmarks.service");
const agenciesStore = require("../stores/agencies.store");
const mutualAidService = require("../services/mutual-aid.service");
const { buildCharts } = require("../utils/dashboard-charts");

// Caching removed: dashboard always rebuilds on every request.
router.get("/", async (req, res) => {
  try {
    const [users, groups] = await Promise.all([
      usersService.getAllUsers(),
      usersService.getAllGroups(),
    ]);

    const agencies = agenciesStore.load();
    const bookmarks = bookmarksService.loadBookmarks();
    const charts = buildCharts(users, agencies);

    // --- Mutual Aid active banners ---
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
        totalUsers: Array.isArray(users) ? users.length : 0,
        totalGroups: Array.isArray(groups) ? groups.length : 0,
        totalAgencies: Array.isArray(agencies) ? agencies.length : 0,
      },
      mutualAid: {
        activeIncidents: activeIncidentCount,
        activeEvents: activeEventCount,
      },
      charts,
      bookmarks,
    };

    res.render("dashboard", viewModel);
  } catch (err) {
    console.error("[DASHBOARD] Failed to load:", err?.message || err);

    const bookmarks = bookmarksService.loadBookmarks();

    const viewModel = {
      stats: {
        totalUsers: 0,
        totalGroups: 0,
        totalAgencies: 0,
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
      error: err?.response?.data || err?.message || "Failed to load dashboard",
    };

    res.status(500).render("dashboard", viewModel);
  }
});

module.exports = router;
