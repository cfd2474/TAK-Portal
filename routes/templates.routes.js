const router = require("express").Router();
const store = require("../services/templates.service");
const accessSvc = require("../services/access.service");

function normalizeTemplate(t) {
  return {
    name: String(t.name || "").trim(),
    agencySuffix: String(t.agencySuffix || "").trim().toLowerCase(), // must be an agency suffix (no global templates)
    groups: Array.isArray(t.groups) ? t.groups.map(g => String(g).trim()).filter(Boolean) : [],
    isDefault: !!t.isDefault
  };
}
router.get("/", (req, res) => {
  const templates = store.load();
  const authUser = req.authentikUser || null;
  const access = accessSvc.getAgencyAccess(authUser);

  if (access.isGlobalAdmin) {
    return res.json(templates);
  }

  const allowed = access.allowedAgencySuffixes || [];
  if (!allowed.length) {
    return res.json([]);
  }

  const allowedSet = new Set(allowed.map((s) => String(s || "").trim().toLowerCase()));
  const filtered = templates.filter((t) =>
    allowedSet.has(String(t.agencySuffix || "").trim().toLowerCase())
  );

  res.json(filtered);
});

router.post("/", (req, res) => {
  const templates = store.load();
  const t = normalizeTemplate(req.body || {});
  const authUser = req.authentikUser || null;

  if (t.agencySuffix && !accessSvc.isSuffixAllowed(authUser, t.agencySuffix)) {
    return res.status(403).json({ error: "You do not have access to that agency." });
  }

  if (!t.name) return res.status(400).json({ error: "Template name is required" });
  if (!t.groups.length) return res.status(400).json({ error: "At least one group is required" });

  // prevent duplicates by (name + agencySuffix)
  const exists = templates.some(x =>
    String(x.name).toLowerCase() === t.name.toLowerCase() &&
    String(x.agencySuffix || "").toLowerCase() === t.agencySuffix
  );
  if (exists) return res.status(400).json({ error: "Template already exists for the selected agency" });


// If this template is marked as default, clear default on other templates for same agency
if (t.isDefault) {
  const sfx = t.agencySuffix; // already normalized lower-case
  templates.forEach((existing, i) => {
    if (String(existing.agencySuffix || "").trim().toLowerCase() === sfx && existing !== t) {
      existing.isDefault = false;
    }
  });
}
  templates.push(t);
  store.save(templates);
  res.json({ success: true });
});

router.put("/:index", (req, res) => {
  const idx = Number(req.params.index);
  const templates = store.load();
  if (!Number.isInteger(idx) || !templates[idx]) return res.status(404).json({ error: "Not found" });

  const existing = templates[idx];
  const authUser = req.authentikUser || null;

  // User must be allowed to modify this template's agency
  if (existing && existing.agencySuffix && !accessSvc.isSuffixAllowed(authUser, existing.agencySuffix)) {
    return res.status(403).json({ error: "You do not have access to this template." });
  }

  const t = normalizeTemplate(req.body || {});

  if (t.agencySuffix && !accessSvc.isSuffixAllowed(authUser, t.agencySuffix)) {
    return res.status(403).json({ error: "You do not have access to that agency." });
  }
  if (!t.name) return res.status(400).json({ error: "Template name is required" });
  if (!t.groups.length) return res.status(400).json({ error: "At least one group is required" });

  // uniqueness check excluding itself
  const exists = templates.some((x, i) =>
    i !== idx &&
    String(x.name).toLowerCase() === t.name.toLowerCase() &&
    String(x.agencySuffix || "").toLowerCase() === t.agencySuffix
  );
  if (exists) return res.status(400).json({ error: "Template already exists for the selected agency" });


// If this template is marked as default, clear default on other templates for same agency
if (t.isDefault) {
  const sfx = t.agencySuffix; // already normalized lower-case
  templates.forEach((existing, i) => {
    if (String(existing.agencySuffix || "").trim().toLowerCase() === sfx && existing !== t) {
      existing.isDefault = false;
    }
  });
}
  templates[idx] = t;
  store.save(templates);
  res.json({ success: true });
});

router.delete("/:index", (req, res) => {
  const idx = Number(req.params.index);
  const templates = store.load();
  if (!Number.isInteger(idx) || !templates[idx]) return res.status(404).json({ error: "Not found" });

  const authUser = req.authentikUser || null;
  const existing = templates[idx];

  if (existing && existing.agencySuffix && !accessSvc.isSuffixAllowed(authUser, existing.agencySuffix)) {
    return res.status(403).json({ error: "You do not have access to this template." });
  }

  templates.splice(idx, 1);
  store.save(templates);
  res.json({ success: true });
});

module.exports = router;
