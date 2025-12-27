const router = require("express").Router();
const store = require("../services/agencies.service");
const usersService = require("../services/users.service");

function normalizeAgency(a) {
  return {
    name: String(a.name || "").trim(),
    type: String(a.type || "").trim(),            // Fire, EMS, Law, etc
    county: String(a.county || "").trim(),
    suffix: String(a.suffix || "").trim().toLowerCase(),
    groupPrefix: String(a.groupPrefix || "").trim().toUpperCase()
  };
}

function validateAgency(a) {
  if (!a.name) return "Name is required";
  if (!a.suffix) return "Username suffix is required";
  if (!a.groupPrefix) return "Group prefix is required";
  return null;
}

// Basic agencies list (raw)
router.get("/", (req, res) => res.json(store.load()));

// Agencies + user counts (based on agency attribute or username suffix)
router.get("/with-counts", async (req, res) => {
  try {
    const agencies = store.load();

    // Build a fast lookup of agencies by suffix (lowercased)
    const suffixList = agencies
      .map((a, index) => ({
        index,
        suffix: String(a.suffix || "").trim().toLowerCase(),
      }))
      .filter(x => x.suffix);

    const suffixSet = new Set(suffixList.map(x => x.suffix));

    // Get all users (already filtered by AUTHENTIK_USER_PATH inside users.service.js)
    // This uses an in-memory cache in users.service.js so repeated calls don't
    // hammer Authentik for every /with-counts request.
    const allUsers = await usersService.getAllUsers();

    // First pass: count by agency suffix using the explicit Authentik attribute.
    const countsBySuffix = new Map();

    for (const u of allUsers) {
      if (!u) continue;

      const attrs = u && u.attributes ? u.attributes : {};
      let agencySuffix = String(attrs.agency || "").trim().toLowerCase();

      // Fallback for any older users that might not have the attribute set:
      // infer from username suffix if it matches a known agency suffix.
      if (!agencySuffix && u && u.username) {
        const uname = String(u.username).toLowerCase();
        for (const sfx of suffixSet) {
          if (uname.endsWith(sfx)) {
            agencySuffix = sfx;
            break;
          }
        }
      }

      if (!agencySuffix) continue;
      if (!suffixSet.has(agencySuffix)) continue;

      const prev = countsBySuffix.get(agencySuffix) || 0;
      countsBySuffix.set(agencySuffix, prev + 1);
    }

    const withCounts = agencies.map((a, index) => {
      const suffix = String(a.suffix || "").trim().toLowerCase();
      const count = suffix ? (countsBySuffix.get(suffix) || 0) : 0;
      const id = index;
      return { ...a, userCount: count, id, _id: id };
    });

    res.json(withCounts);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

router.post("/", (req, res) => {
  const agencies = store.load();
  const a = normalizeAgency(req.body || {});

  const err = validateAgency(a);
  if (err) return res.status(400).json({ error: err });

  if (agencies.some(x => String(x.suffix || "").toLowerCase() === a.suffix)) {
    return res.status(400).json({ error: "Suffix already exists" });
  }

  agencies.push(a);
  store.save(agencies);
  res.json({ success: true });
});

router.put("/:index", (req, res) => {
  const idx = Number(req.params.index);
  const agencies = store.load();
  if (!Number.isInteger(idx) || !agencies[idx]) return res.status(404).json({ error: "Not found" });

  const a = normalizeAgency(req.body || {});
  const err = validateAgency(a);
  if (err) return res.status(400).json({ error: err });

  // uniqueness check excluding itself
  if (agencies.some((x, i) => i !== idx && String(x.suffix || "").toLowerCase() === a.suffix)) {
    return res.status(400).json({ error: "Suffix already exists" });
  }

  agencies[idx] = a;
  store.save(agencies);
  res.json({ success: true });
});

router.delete("/:index", (req, res) => {
  const idx = Number(req.params.index);
  const agencies = store.load();
  if (!Number.isInteger(idx) || !agencies[idx]) return res.status(404).json({ error: "Not found" });

  agencies.splice(idx, 1);
  store.save(agencies);
  res.json({ success: true });
});

module.exports = router;
