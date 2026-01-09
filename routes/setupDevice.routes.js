const express = require("express");
const router = express.Router();

const qrSvc = require("../services/qr.service");
const tokensSvc = require("../services/authentikTokens.service");

function requireLoggedIn(req, res) {
  const u = req.authentikUser;
  if (!u || !u.username) {
    res.status(401).json({ ok: false, error: "Authentication required" });
    return null;
  }
  return u;
}

router.post("/enroll-qr", async (req, res) => {
  try {
    const user = requireLoggedIn(req, res);
    if (!user) return;

    const takUrl = qrSvc.getTakUrl();
    if (!takUrl) {
      return res.status(500).json({
        ok: false,
        error:
          "TAK_URL is not configured. Set it in Settings (TAK URL) or via the TAK_URL environment variable.",
      });
    }

    const { identifier, key, expiresAt } =
      await tokensSvc.getOrCreateEnrollmentAppPassword({ username: user.username, userId: user.uid, ttlMinutes: 30 });

    const enrollUrl = qrSvc.buildEnrollUrl({ username: user.username, token: key });
    if (!enrollUrl) {
      return res.status(500).json({ ok: false, error: "Failed to build enrollment URL" });
    }

    const qrCode = await qrSvc.generateDisplayQrDataUrl(enrollUrl);

    return res.json({
      ok: true,
      username: user.username,
      tokenIdentifier: identifier,
      token: key,
      expiresAt,
      enrollUrl,
      qrCode,
    });
  } catch (err) {
    console.error("[setup-device] Failed to create enrollment QR:", err);
        // Surface useful upstream error details (e.g., Authentik 403/404)
    const status = err?.response?.status;
    const data = err?.response?.data;
    const upstream = status ? ` (upstream HTTP ${status})` : "";
    const detail = data && (data.detail || data.error || data.message) ? `: ${data.detail || data.error || data.message}` : "";
    return res.status(500).json({
      ok: false,
      error: (err?.message || "Failed to generate enrollment QR") + upstream + detail,
    });
  }
});

module.exports = router;
