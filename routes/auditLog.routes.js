app.get("/audit-log", requireOnlyGlobalAdmin, (req, res) => {
  const raw = req.query || {};

  const filters = {
    q: raw.q || "",
    actor: raw.actor || "",
    action: raw.action || "",
    targetType: raw.targetType || "",
    agencySuffix: raw.agencySuffix || "",
    from: raw.from || "",
    to: raw.to || "",
    page: raw.page || "1",
    pageSize: raw.pageSize || "50",
  };

  const result = auditSvc.queryLogs(filters);
  const agencies = agenciesStore.load();

  // Build agency lookup map by suffix
  const agencyMap = {};
  (Array.isArray(agencies) ? agencies : []).forEach(a => {
    const sfx = String(a?.suffix || "").trim().toLowerCase();
    if (sfx) agencyMap[sfx] = a;
  });

  const agencyOptions = (Array.isArray(agencies) ? agencies : [])
    .map((a) => ({
      value: String(a?.suffix || "").trim().toLowerCase(),
      label: `${String(a?.name || a?.groupPrefix || a?.suffix || "").trim()} (${String(a?.suffix || "").trim()})`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const actionOptions = auditSvc.listDistinctValues({ field: "actions" });
  const targetTypeOptions = auditSvc.listDistinctValues({ field: "targetTypes" });

  function buildLink(newPage) {
    const u = new URL(`${req.protocol}://${req.get("host")}${req.path}`);
    Object.entries(filters).forEach(([k, v]) => {
      if (k === "page") return;
      if (v != null && String(v).trim() !== "") {
        u.searchParams.set(k, String(v));
      }
    });
    u.searchParams.set("page", String(newPage));
    if (filters.pageSize) {
      u.searchParams.set("pageSize", String(filters.pageSize));
    }
    return u.pathname + u.search;
  }

  const pageLinks = {
    prev: buildLink(Math.max(1, result.page - 1)),
    next: buildLink(Math.min(result.pageCount, result.page + 1)),
  };

  return res.render("audit-log", {
    filters,
    result,
    pageLinks,
    agencyOptions,
    actionOptions,
    targetTypeOptions,
    agencyMap
  });
});