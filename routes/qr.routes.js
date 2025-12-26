const express = require("express");
const router = express.Router();
const QRCode = require("qrcode");

/**
 * Generate QR for on-page display (medium resolution)
 * POST /api/qr
 */
router.post("/", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Missing username or password" });
    }

    const takUrl = process.env.TAK_URL;
    if (!takUrl) {
      return res.status(500).json({ error: "TAK_URL not set in .env" });
    }

    const host = new URL(takUrl).hostname;

    const enrollUrl =
      `tak://com.atakmap.app/enroll?` +
      `host=${host}` +
      `&username=${encodeURIComponent(username)}` +
      `&token=${encodeURIComponent(password)}`;

    const qrCode = await QRCode.toDataURL(enrollUrl, {
      errorCorrectionLevel: "H",
      type: "image/png",
      width: 512,     // Display size
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF"
      }
    });

    return res.json({
      qrCode,
      enrollUrl
    });
  } catch (err) {
    console.error("QR generation error:", err);
    return res.status(500).json({ error: "Failed to generate QR code" });
  }
});

/**
 * Download high-resolution QR (print-quality)
 * GET /api/qr/download?username=...&token=...
 */
router.get("/download", async (req, res) => {
  try {
    const username = String(req.query.username || "").trim();
    const token = String(req.query.token || "").trim();

    if (!username || !token) {
      return res.status(400).send("Missing username or token");
    }

    const takUrl = process.env.TAK_URL;
    if (!takUrl) {
      return res.status(500).send("TAK_URL not set in .env");
    }

    const host = new URL(takUrl).hostname;

    const enrollUrl =
      `tak://com.atakmap.app/enroll?` +
      `host=${host}` +
      `&username=${encodeURIComponent(username)}` +
      `&token=${encodeURIComponent(token)}`;

    // 🔥 High-resolution QR for download
    const pngBuffer = await QRCode.toBuffer(enrollUrl, {
      errorCorrectionLevel: "H",
      type: "png",
      width: 1200,   // Much higher than display
      margin: 3
    });

    const safeUser =
      username.toLowerCase().replace(/[^a-z0-9_-]/g, "") || "user";

    const filename = `tak-${safeUser}-enrollment-qr.png`;

    res.setHeader("Content-Type", "image/png");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );

    return res.send(pngBuffer);
  } catch (err) {
    console.error("QR download error:", err);
    return res.status(500).send("Failed to generate download QR");
  }
});

module.exports = router;
