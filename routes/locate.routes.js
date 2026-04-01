const router = require("express").Router();
const locateConfig = require("../services/locateConfig.service");
const locatorsSvc = require("../services/locators.service");
const emailSvc = require("../services/email.service");
const auditSvc = require("../services/auditLog.service");
const { renderTemplate, htmlToText } = require("../services/emailTemplates.service");
const { toSafeApiError } = require("../services/apiErrorPayload.service");
const smsSvc = require("../services/sms.service");

const EMAIL_RE = /^\S+@\S+\.[A-Za-z]{2,}$/;

function auditRequest(req) {
  return {
    method: req.method,
    path: req.originalUrl || req.path,
    ip: req.ip,
  };
}

function parseRecipientEmails(raw) {
  const s = String(raw || "").trim();
  if (!s) return { error: "Enter at least one email address." };
  const parts = s
    .split(/[;,]/g)
    .map((x) => String(x).trim())
    .filter(Boolean);
  if (!parts.length) return { error: "Enter at least one email address." };
  const seen = new Set();
  const emails = [];
  for (const e of parts) {
    if (!EMAIL_RE.test(e)) {
      return { error: `Invalid email address: ${e}` };
    }
    const lower = e.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    emails.push(e);
  }
  if (!emails.length) return { error: "Enter at least one email address." };
  return { emails };
}

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
    const authUser = req.authentikUser || null;
    auditSvc.logEvent({
      actor: authUser,
      request: auditRequest(req),
      action: "LOCATE_TAK_CORE_CONFIG_APPLIED",
      targetType: "locate_config",
      targetId: "tak-coreconfig-locate",
      details: {
        locateEnabled: enabled,
        takNotifyGroup: enabled ? group : null,
        takServerRestartInitiated: true,
        summary: enabled
          ? `Locate was enabled on the TAK Server for notifications to group "${group}". CoreConfig.xml was updated over SSH and a TAK Server restart was started.`
          : `Locate was disabled on the TAK Server: the locate block was removed from CoreConfig.xml over SSH and a TAK Server restart was started.`,
      },
    });
    res.json({ ok: true, ...out });
  } catch (err) {
    res.status(500).json({ ok: false, error: toSafeApiError(err) });
  }
});

// ---- Missing-person locators (admin) ----

router.get("/locators", async (req, res) => {
  try {
    const locators = locatorsSvc.listLocatorsForAdmin();
    res.json({ ok: true, locators });
  } catch (err) {
    res.status(500).json({ ok: false, error: toSafeApiError(err) });
  }
});

router.post("/locators", async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    const pingIntervalSeconds = req.body?.pingIntervalSeconds;
    const loc = locatorsSvc.create({ title, pingIntervalSeconds });
    auditSvc.logEvent({
      actor: req.authentikUser || null,
      request: auditRequest(req),
      action: "LOCATE_LOCATOR_CREATED",
      targetType: "locator",
      targetId: loc.id,
      details: {
        title: loc.title,
        slug: loc.slug,
        pingIntervalSeconds: loc.pingIntervalSeconds,
        summary: `Created missing-person locator "${loc.title}" (public slug "${loc.slug}", ping every ${loc.pingIntervalSeconds}s).`,
      },
    });
    res.json({ ok: true, locator: loc });
  } catch (err) {
    res.status(400).json({ ok: false, error: toSafeApiError(err) });
  }
});

router.patch("/locators/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const before = locatorsSvc.getById(id);
    const loc = locatorsSvc.update(id, {
      title: req.body?.title,
      pingIntervalSeconds: req.body?.pingIntervalSeconds,
      active: req.body?.active,
    });
    const changes = [];
    if (before && before.title !== loc.title) {
      changes.push(`title "${before.title}" → "${loc.title}"`);
    }
    if (
      before &&
      Number(before.pingIntervalSeconds) !== Number(loc.pingIntervalSeconds)
    ) {
      changes.push(
        `ping interval ${before.pingIntervalSeconds}s → ${loc.pingIntervalSeconds}s`
      );
    }
    if (before && !!before.active !== !!loc.active) {
      changes.push(`active ${before.active} → ${loc.active}`);
    }
    auditSvc.logEvent({
      actor: req.authentikUser || null,
      request: auditRequest(req),
      action: "LOCATE_LOCATOR_UPDATED",
      targetType: "locator",
      targetId: id,
      details: {
        slug: loc.slug,
        title: loc.title,
        pingIntervalSeconds: loc.pingIntervalSeconds,
        active: loc.active,
        previousTitle: before?.title,
        previousPingIntervalSeconds: before?.pingIntervalSeconds,
        previousActive: before?.active,
        summary:
          changes.length > 0
            ? `Updated locator "${loc.title}" (${loc.slug}): ${changes.join("; ")}.`
            : `Saved locator "${loc.title}" (${loc.slug}) with no effective field changes.`,
      },
    });
    res.json({ ok: true, locator: loc });
  } catch (err) {
    res.status(400).json({ ok: false, error: toSafeApiError(err) });
  }
});

router.post("/locators/:id/archive", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const loc = locatorsSvc.archive(id);
    auditSvc.logEvent({
      actor: req.authentikUser || null,
      request: auditRequest(req),
      action: "LOCATE_LOCATOR_ARCHIVED",
      targetType: "locator",
      targetId: id,
      details: {
        title: loc.title,
        slug: loc.slug,
        summary: `Archived locator "${loc.title}" (slug "${loc.slug}"). The public link is treated as inactive/archived.`,
      },
    });
    res.json({ ok: true, locator: loc });
  } catch (err) {
    res.status(400).json({ ok: false, error: toSafeApiError(err) });
  }
});

router.post("/locators/:id/reactivate", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const loc = locatorsSvc.reactivate(id);
    auditSvc.logEvent({
      actor: req.authentikUser || null,
      request: auditRequest(req),
      action: "LOCATE_LOCATOR_REACTIVATED",
      targetType: "locator",
      targetId: id,
      details: {
        title: loc.title,
        slug: loc.slug,
        summary: `Reactivated locator "${loc.title}" (slug "${loc.slug}") from archived state.`,
      },
    });
    res.json({ ok: true, locator: loc });
  } catch (err) {
    res.status(400).json({ ok: false, error: toSafeApiError(err) });
  }
});

router.delete("/locators/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const before = locatorsSvc.getById(id);
    locatorsSvc.permanentDelete(id);
    auditSvc.logEvent({
      actor: req.authentikUser || null,
      request: auditRequest(req),
      action: "LOCATE_LOCATOR_DELETED",
      targetType: "locator",
      targetId: id,
      details: {
        title: before?.title,
        slug: before?.slug,
        summary: before
          ? `Permanently deleted locator "${before.title}" (slug "${before.slug}") and its stored ping history.`
          : `Permanently deleted locator id ${id} and its stored ping history.`,
      },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: toSafeApiError(err) });
  }
});

router.post("/locators/:id/manual-ping", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const loc = locatorsSvc.getById(id);
    if (!loc || loc.archived) {
      return res.status(404).json({ ok: false, error: "Locator not found." });
    }
    locatorsSvc.addManualOperatorPing(id);
    auditSvc.logEvent({
      actor: req.authentikUser || null,
      request: auditRequest(req),
      action: "LOCATE_MANUAL_PING_REQUESTED",
      targetType: "locator",
      targetId: id,
      details: {
        title: loc.title,
        slug: loc.slug,
        summary: `Requested a manual ping for locator "${loc.title}" (slug "${loc.slug}"); devices with the page open should send a location update soon.`,
      },
    });
    res.json({ ok: true, message: "Devices with this link open will send a location update soon." });
  } catch (err) {
    res.status(500).json({ ok: false, error: toSafeApiError(err) });
  }
});

router.get("/locators/:id/history", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const loc = locatorsSvc.getById(id);
    if (!loc) {
      return res.status(404).json({ ok: false, error: "Locator not found." });
    }
    const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || "200"), 10) || 200));
    const history = locatorsSvc.listHistory(id, { limit });
    res.json({ ok: true, history });
  } catch (err) {
    res.status(500).json({ ok: false, error: toSafeApiError(err) });
  }
});

router.post("/locators/:id/send-link-email", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const loc = locatorsSvc.getById(id);
    if (!loc || loc.archived) {
      return res.status(404).json({ ok: false, error: "Locator not found." });
    }

    const parsed = parseRecipientEmails(req.body?.recipients ?? req.body?.to ?? "");
    if (parsed.error) {
      return res.status(400).json({ ok: false, error: parsed.error });
    }
    const emails = parsed.emails;

    const emailCfg = emailSvc.getSmtpConfig();
    if (!emailSvc.isEmailEnabled() || !emailCfg.host || !emailCfg.from) {
      return res.status(400).json({
        ok: false,
        error: "Email is disabled or SMTP is not configured.",
      });
    }

    const proto = String(req.get("x-forwarded-proto") || req.protocol || "https")
      .split(",")[0]
      .trim() || "https";
    const host = req.get("host") || "";
    const url = `${proto}://${host}/locate/${encodeURIComponent(loc.slug)}`;

    const subject = "Share your location";
    const message = `Please open this link on your phone to share your location with responders:\n\n${url}\n`;

    const escapeHtml = (s) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    const messageBody = escapeHtml(message).replace(/\n/g, "<br>");
    const html = renderTemplate("bulk_email.html", { subject, messageBody });
    const text = htmlToText(html);

    const result = await emailSvc.sendMail({
      to: emails.join(","),
      subject,
      text,
      html,
    });

    if (!result.sent) {
      if (result.skipped) {
        return res.status(400).json({
          ok: false,
          error: "Email is disabled (EMAIL_ENABLED=false)",
        });
      }
      return res.status(500).json({
        ok: false,
        error: result.error || "Email send failed",
      });
    }

    auditSvc.logEvent({
      actor: req.authentikUser || null,
      request: auditRequest(req),
      action: "LOCATE_LINK_EMAIL_SENT",
      targetType: "locator",
      targetId: id,
      details: {
        locatorTitle: loc.title,
        slug: loc.slug,
        recipientCount: emails.length,
        summary: `Emailed the public locate link to ${emails.length} recipient(s) for locator "${loc.title}" (slug "${loc.slug}").`,
      },
    });

    res.json({ ok: true, count: emails.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: toSafeApiError(err) });
  }
});

router.post("/locators/:id/send-link-sms", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const loc = locatorsSvc.getById(id);
    if (!loc || loc.archived) {
      return res.status(404).json({ ok: false, error: "Locator not found." });
    }

    const parsed = smsSvc.parsePhoneList(req.body?.phones ?? req.body?.numbers ?? "");
    if (parsed.error) {
      return res.status(400).json({ ok: false, error: parsed.error });
    }

    if (!smsSvc.isSmsConfigured()) {
      return res.status(503).json({
        ok: false,
        error:
          "SMS is not configured. Choose Twilio or Brevo and add credentials under Server Settings → SMS.",
      });
    }

    const proto = String(req.get("x-forwarded-proto") || req.protocol || "https")
      .split(",")[0]
      .trim() || "https";
    const host = req.get("host") || "";
    const url = `${proto}://${host}/locate/${encodeURIComponent(loc.slug)}`;
    const text = `Please open this link on your phone to share your location with responders:\n\n${url}`;

    for (const phone of parsed.phones) {
      const out = await smsSvc.sendSmsFromSettings(phone, text);
      if (!out.ok) {
        return res.status(500).json({
          ok: false,
          error: out.error || "SMS send failed",
        });
      }
    }

    auditSvc.logEvent({
      actor: req.authentikUser || null,
      request: auditRequest(req),
      action: "LOCATE_LINK_SMS_SENT",
      targetType: "locator",
      targetId: id,
      details: {
        locatorTitle: loc.title,
        slug: loc.slug,
        recipientCount: parsed.phones.length,
        summary: `Sent the public locate link by SMS to ${parsed.phones.length} phone number(s) for locator "${loc.title}" (slug "${loc.slug}").`,
      },
    });

    res.json({ ok: true, count: parsed.phones.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: toSafeApiError(err) });
  }
});

module.exports = router;
