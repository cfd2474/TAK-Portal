const api = require("./authentik");

const TOKEN_DESCRIPTION = "TAK Portal Enrollment";
const IDENT_PREFIX = "tak-portal-enroll-";

// Enable/disable debug logging with env var:
//   AUTHENTIK_TOKENS_DEBUG=1
const DEBUG = String(process.env.AUTHENTIK_TOKENS_DEBUG || "").toLowerCase();
const DEBUG_ON = DEBUG === "1" || DEBUG === "true" || DEBUG === "yes";

function log(label, data) {
  if (!DEBUG_ON) return;
  try {
    console.log(`[authentikTokens] ${label}:`, JSON.stringify(data, null, 2));
  } catch (e) {
    console.log(`[authentikTokens] ${label}:`, data);
  }
}

function warn(label, data) {
  // Always warn (even if debug off) for important security/logic issues.
  try {
    console.warn(`[authentikTokens] ${label}:`, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn(`[authentikTokens] ${label}:`, data);
  }
}

// Mask secrets in logs
function maskSecret(s) {
  const str = String(s || "");
  if (!str) return str;
  if (str.length <= 8) return "***";
  return `${str.slice(0, 4)}…${str.slice(-4)}`;
}

function toIso(dt) {
  return dt instanceof Date ? dt.toISOString() : new Date(dt).toISOString();
}

function parseExpires(tokenObj) {
  const raw = tokenObj && tokenObj.expires;
  if (!raw) return null;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function extractPk(objOrPk) {
  if (!objOrPk) return null;
  if (typeof objOrPk === "object") return objOrPk.pk ?? objOrPk.id ?? null;
  return objOrPk;
}

function apiErrorSummary(err) {
  const status = err?.response?.status;
  const method = err?.config?.method?.toUpperCase?.() || err?.config?.method;
  const url = err?.config?.url;
  const data = err?.response?.data;
  return {
    status,
    method,
    url,
    responseData: data,
    message: err?.message,
  };
}

async function getUserIdByUsername(username) {
  const u = String(username || "").trim();
  if (!u) throw new Error("Missing username");

  // Authentik can vary here; be resilient:
  // 1) try exact-style filter
  // 2) fallback to search
  const tries = [
    { username: u, page_size: 100 },
    { search: u, page_size: 100 },
  ];

  for (const params of tries) {
    log("GET /core/users/ params", params);
    let res;
    try {
      res = await api.get("/core/users/", { params });
    } catch (err) {
      warn("GET /core/users/ failed", apiErrorSummary(err));
      throw err;
    }

    const results = Array.isArray(res?.data?.results) ? res.data.results : [];
    log("GET /core/users/ results count", { count: results.length });

    const exact = results.find((x) => String(x?.username || "") === u);
    if (exact) {
      const pk = exact.pk ?? exact.id;
      log("Resolved user PK from username", { username: u, pk });
      return pk;
    }
  }

  throw new Error(`Unable to resolve Authentik user id for "${u}"`);
}

async function listUserAppPasswordsByUserId(resolvedUserId) {
  const resUserId = String(resolvedUserId ?? "").trim();
  if (!resUserId) throw new Error("Missing resolvedUserId");

  const params = {
    intent: "app_password",
    user: resUserId,
    ordering: "-expires",
    page_size: 200,
  };

  log("GET /core/tokens/ params", params);

  let res;
  try {
    res = await api.get("/core/tokens/", { params });
  } catch (err) {
    warn("GET /core/tokens/ failed", apiErrorSummary(err));
    throw err;
  }

  const results = Array.isArray(res?.data?.results) ? res.data.results : [];
  log("GET /core/tokens/ raw results count", { count: results.length });

  // Some Authentik versions accept the `user=` filter but may still return
  // broader results depending on permissions. Always hard-filter client-side
  // to prevent leaking/reusing another user's token.
  const pk = String(resUserId);
  const filtered = results.filter((t) => {
    const tokenUserPk = extractPk(t?.user);
    return String(tokenUserPk ?? "") === pk;
  });

  log("GET /core/tokens/ filtered results count", { count: filtered.length });

  if (DEBUG_ON) {
    log(
      "GET /core/tokens/ filtered identifiers",
      filtered.map((t) => ({
        identifier: t?.identifier,
        description: t?.description,
        expires: t?.expires,
        user: extractPk(t?.user),
        intent: t?.intent,
      }))
    );
  }

  return filtered;
}

async function viewTokenKey(identifier) {
  const ident = String(identifier || "").trim();
  if (!ident) throw new Error("Missing token identifier");

  const path = `/core/tokens/${encodeURIComponent(ident)}/view_key/`;
  log("GET view_key", { path });

  let res;
  try {
    res = await api.get(path);
  } catch (err) {
    warn("GET view_key failed", apiErrorSummary(err));
    throw err;
  }

  const key = res?.data?.key || res?.data?.token || res?.data?.value;
  if (!key) {
    warn("view_key response missing key", { identifier: ident, data: res?.data });
    throw new Error("Authentik did not return a token key");
  }

  log("view_key success", { identifier: ident, key: maskSecret(key) });
  return key;
}

async function createAppPasswordForUserId(userId, expiresAt) {
  const uid = String(userId ?? "").trim();
  if (!uid) throw new Error("Missing userId");

  const identifier = `${IDENT_PREFIX}${Date.now()}-${Math.random()
    .toString(16)
    .slice(2, 10)}`;

  const payload = {
    identifier,
    intent: "app_password",
    user: uid,
    description: TOKEN_DESCRIPTION,
    expiring: true,
    expires: toIso(expiresAt),
  };

  log("POST /core/tokens/ payload", payload);

  let res;
  try {
    res = await api.post("/core/tokens/", payload);
  } catch (err) {
    warn("POST /core/tokens/ failed", apiErrorSummary(err));
    throw err;
  }

  const created = res?.data || {};
  const createdIdentifier = created.identifier || identifier;

  // 🔥 Key diagnostic for your current issue:
  // authentik may silently override the `user` field to request.user unless caller is privileged.
  const createdUserPk = extractPk(created.user);
  if (createdUserPk && String(createdUserPk) !== String(uid)) {
    warn("Token user mismatch (authentik likely overrode target user)", {
      requestedUser: uid,
      createdUser: createdUserPk,
      createdIdentifier,
      intent: created.intent,
      description: created.description,
      expires: created.expires,
    });
  } else {
    log("Token created for expected user", {
      user: createdUserPk ?? uid,
      identifier: createdIdentifier,
      expires: created.expires,
    });
  }

  return createdIdentifier;
}

/**
 * Return an existing (non-expired) enrollment token for this user, or create one.
 * Reuses within TTL window to avoid multiple active tokens per user.
 */
async function getOrCreateEnrollmentAppPassword(params, ttlMinutes = 15) {
  // Backwards-compatible signature:
  //   getOrCreateEnrollmentAppPassword(username, ttlMinutes)
  //   getOrCreateEnrollmentAppPassword({ username, userId, ttlMinutes })
  let username = params;
  let userId = null;

  if (params && typeof params === "object") {
    username = params.username;
    userId = params.userId || params.uid || null;
    if (typeof params.ttlMinutes === "number") ttlMinutes = params.ttlMinutes;
  }

  const u = String(username || "").trim();
  if (!u) throw new Error("Missing username");

  const now = new Date();
  const cleanedUserId = userId ? String(userId).trim() : "";

  const resolvedUserId = /^\d+$/.test(cleanedUserId)
    ? cleanedUserId
    : await getUserIdByUsername(u);

  log("Enrollment token request", {
    username: u,
    providedUserId: cleanedUserId || null,
    resolvedUserId,
    ttlMinutes,
    now: toIso(now),
  });

  const tokens = await listUserAppPasswordsByUserId(resolvedUserId);

  const candidate = tokens
    .filter((t) => {
      const d = String(t?.description || "");
      const ident = String(t?.identifier || "");
      return d === TOKEN_DESCRIPTION || ident.startsWith(IDENT_PREFIX);
    })
    .map((t) => ({ t, expires: parseExpires(t) }))
    .filter((x) => x.expires && x.expires.getTime() > now.getTime())
    .sort((a, b) => b.expires.getTime() - a.expires.getTime())[0];

  if (candidate) {
    log("Reusing existing enrollment token", {
      identifier: candidate.t?.identifier,
      expires: toIso(candidate.expires),
      tokenUser: extractPk(candidate.t?.user),
    });
  } else {
    log("No reusable token found; will create", { resolvedUserId });
  }

  const identifier = candidate
    ? String(candidate.t.identifier)
    : await createAppPasswordForUserId(
        resolvedUserId,
        new Date(now.getTime() + ttlMinutes * 60 * 1000)
      );

  // Refresh token details (expires may not be present in create response)
  const freshList = await listUserAppPasswordsByUserId(resolvedUserId);
  const tokenObj =
    freshList.find((t) => String(t?.identifier || "") === identifier) ||
    candidate?.t;

  if (!tokenObj) {
    warn("Token not found after create/reuse", { identifier, resolvedUserId });
  } else {
    const tokenUserPk = extractPk(tokenObj.user);
    if (tokenUserPk && String(tokenUserPk) !== String(resolvedUserId)) {
      warn("Final token user mismatch (will still proceed but this is wrong)", {
        resolvedUserId,
        tokenUser: tokenUserPk,
        identifier,
      });
    }
  }

  const expires =
    parseExpires(tokenObj) || new Date(now.getTime() + ttlMinutes * 60 * 1000);

  const key = await viewTokenKey(identifier);

  log("Enrollment token ready", {
    identifier,
    expiresAt: toIso(expires),
    key: maskSecret(key),
    tokenUser: extractPk(tokenObj?.user),
  });

  return {
    identifier,
    key,
    expiresAt: toIso(expires),
  };
}

module.exports = {
  getOrCreateEnrollmentAppPassword,
  TOKEN_DESCRIPTION,
  IDENT_PREFIX,
};
