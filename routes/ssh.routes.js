const router = require("express").Router();
const takSshSvc = require("../services/takSsh.service");
const settingsSvc = require("../services/settings.service");

router.get("/status", (req, res) => {
  try {
    const cfg = settingsSvc.getSettings() || {};
    const keyStatus = takSshSvc.getLocalKeyStatus();
    const host = String(cfg.TAK_SSH_HOST || "").trim();
    const username = String(cfg.TAK_SSH_USER || "").trim();
    const port = String(cfg.TAK_SSH_PORT || "22").trim() || "22";
    const onboarded = String(cfg.TAK_SSH_ONBOARDED || "").toLowerCase() === "true";
    res.json({
      ok: true,
      status: {
        host,
        username,
        port,
        onboarded,
        lastHandshakeAt: cfg.TAK_SSH_LAST_HANDSHAKE_AT || "",
        ...keyStatus,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

router.post("/generate-key", (req, res) => {
  try {
    const keyStatus = takSshSvc.ensureLocalSshKeyPair();
    res.json({ ok: true, keyStatus });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

router.post("/handshake", async (req, res) => {
  try {
    const body = req.body || {};
    const result = await takSshSvc.onboardTakSshWithPassword({
      host: body.host,
      port: body.port,
      username: body.username,
      password: body.password,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ ok: false, error: err?.message || String(err) });
  }
});

router.post("/run-command", async (req, res) => {
  try {
    const body = req.body || {};
    const result = await takSshSvc.runRemoteSshCommand(body.command);
    if (!result.ok) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

router.post("/test-connection", async (req, res) => {
  try {
    const result = await takSshSvc.runRemoteSshCommand("whoami");
    if (!result.ok) {
      return res.status(400).json(result);
    }
    res.json({
      ok: true,
      message: "SSH connection successful.",
      remoteUser: String(result.stdout || "").trim(),
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      exitCode: result.exitCode,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

module.exports = router;
