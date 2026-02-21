const express = require("express");
const updater = require("../services/updater.service");
const pkg = require("../package.json");

const router = express.Router();

// Status endpoint (polling-friendly)
router.get("/status", (req, res) => {
  res.json({
    currentVersion: pkg.version || "dev",
    latestVersion: req.app?.locals?.APP_LATEST_VERSION || pkg.version || "dev",
    updateAvailable: !!req.app?.locals?.APP_UPDATE_AVAILABLE,
    ...updater.getStatus(),
  });
});

// Start the update
router.post("/start", async (req, res) => {
  try {
    await updater.start();
    res.json({ ok: true, message: "Update started" });
  } catch (err) {
    const code = err?.code || "UPDATE_FAILED";
    const msg = err?.message || String(err);
    res.status(code === "UPDATE_IN_PROGRESS" ? 409 : 500).json({
      ok: false,
      code,
      error: msg,
    });
  }
});

// Server-Sent Events stream of updater logs + status
router.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Initial payload
  send("status", updater.getStatus());
  // Replay buffered logs so opening the modal mid-update still shows history
  (updater.state?.logs || []).forEach((entry) => send("log", entry));

  const onLog = (entry) => send("log", entry);
  const onStatus = (status) => send("status", status);

  updater.on("log", onLog);
  updater.on("status", onStatus);

  // Keepalive ping so proxies don't kill the stream
  const ping = setInterval(() => {
    res.write(`: ping ${Date.now()}\n\n`);
  }, 15000);

  req.on("close", () => {
    clearInterval(ping);
    updater.off("log", onLog);
    updater.off("status", onStatus);
  });
});

module.exports = router;
