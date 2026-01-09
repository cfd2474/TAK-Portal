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
  // Debug: what do we actually get from forward_auth?
  console.log("[enroll-qr] headers:", {
    "x-authentik-username": req.headers["x-authentik-username"],
    "x-authentik-uid": req.headers["x-authentik-uid"],
    "x-authentik-user-id": req.headers["x-authentik-user-id"],
    "x-authentik-email": req.headers["x-authentik-email"],
    "x-authentik-groups": req.headers["x-authentik-groups"],
  });
  console.log("[enroll-qr] req.authentikUser:", req.authentikUser);

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
      await tokensSvc.getOrCreateEnrollmentAppPassword({
        username: user.username,
        userId: user.uid || null,
        ttlMinutes: 30,
      });

    const enrollUrl = qrSvc.buildEnrollUrl({
      username: user.username,
      token: key,
    });

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
    // Show upstream authentik status in logs so we can diagnose 400s/403s
    const upstreamStatus = err?.response?.status;
    const upstreamData = err?.response?.data;

    console.error("[setup-device] Failed to create enrollment QR:", {
      message: err?.message,
      upstreamStatus,
      upstreamData,
    });

    return res.status(500).json({
      ok: false,
      error:
        upstreamStatus
          ? `Authentik API error (HTTP ${upstreamStatus})`
          : (err?.message || "Failed to generate enrollment QR"),
      // optional: include upstreamData for debugging; remove later if you don't want it exposed
      details: upstreamData || null,
    });
  }
});

module.exports = router;
