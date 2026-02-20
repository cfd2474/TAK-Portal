const router = require("express").Router();
const userRequestsSvc = require("../services/userRequests.service");

function requireGlobalAdmin(req, res, next) {
  const user = req.authentikUser;
  if (!user || !user.isGlobalAdmin) {
    const username = user && user.username ? user.username : "";
    return res.status(403).render("access-denied", { username });
  }
  next();
}

// Public: create a new access request
router.post("/", (req, res) => {
  try {
    const created = userRequestsSvc.createRequest(req.body || {});
    return res.json({ success: true, request: created });
  } catch (err) {
    return res.status(400).json({ error: err?.message || "Invalid request" });
  }
});

// Admin: list all pending requests
router.get("/", requireGlobalAdmin, (req, res) => {
  const list = userRequestsSvc.listRequests();
  return res.json(list);
});

// Admin: delete a request (reject)
router.delete("/:id", requireGlobalAdmin, (req, res) => {
  const ok = userRequestsSvc.deleteRequest(req.params.id);
  if (!ok) return res.status(404).json({ error: "Not found" });
  return res.json({ success: true });
});

module.exports = router;
