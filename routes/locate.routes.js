const router = require("express").Router();
const locateConfig = require("../services/locateConfig.service");
const { toSafeApiError } = require("../services/apiErrorPayload.service");

router.get("/config", async (req, res) => {
  try {
    const ssh = locateConfig.isSshConfigured();
    if (!ssh.configured) {
      return res.json({
        ok: true,
        sshConfigured: false,
        enabled: false,
        group: "",
      });
    }
    const xml = await locateConfig.readRemoteCoreConfigXml();
    const parsed = locateConfig.parseLocateFromXml(xml);
    res.json({
      ok: true,
      sshConfigured: true,
      enabled: parsed.enabled,
      group: parsed.group || "",
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: toSafeApiError(err) });
  }
});

router.post("/apply", async (req, res) => {
  try {
    const enabled = !!req.body?.enabled;
    const group = String(req.body?.group || "").trim();
    if (enabled && !group) {
      return res.status(400).json({
        ok: false,
        error: "Select a TAK group when locate is enabled.",
      });
    }
    const out = await locateConfig.applyLocateConfiguration({
      enabled,
      groupDisplayName: group,
    });
    res.json({ ok: true, ...out });
  } catch (err) {
    res.status(500).json({ ok: false, error: toSafeApiError(err) });
  }
});

module.exports = router;
