const api = require("./authentik");

const TOKEN_DESCRIPTION = "TAK Portal Enrollment";
const IDENT_PREFIX = "tak-portal-enroll-";

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

async function getUserIdByUsername(username) {
  const u = String(username || "").trim();
  if (!u) throw new Error("Missing username");

  // Be resilient: try username filter then search fallback
  const tries = [
    { username: u, page_size: 100 },
    { search: u, page_size: 100 },
  ];

  for (const params of tries) {
    const res = await api.get("/core/users/", { params });
    const results = Array.isArray(res?.data?.results) ? res.data.results : [];
    const exact = results.find((x) => String(x?.username || "") === u);
    if (exact) return exact.pk ?? exact.id;
  }

  throw new Error(`Unable to resolve Authentik user id for "${u}"`);
}

async function listUserAppPasswordsByUserId(userId) {
  const res = await api.get("/core/tokens/", {
    params: {
      intent: "app_password",
      user: userId,          // <-- stable filter
      ordering: "-expires",
      page_size: 200,
    },
  });

  return Array.isArray(res?.data?.results) ? res.data.results : [];
}

async function viewTokenKey(identifier) {
  const ident = String(identifier || "").trim();
  if (!ident) throw new Error("Missing token identifier");

  const res = await api.get(`/core/tokens/${encodeURIComponent(ident)}/view_key/`);
  const key = res?.data?.key || res?.data?.token || res?.data?.value;
  if (!key) throw new Error("Authentik did not return a token key");
  return key;
}

async function createAppPasswordForUserId(userId, expiresAt) {
  const identifier = `${IDENT_PREFIX}${Date.now()}-${Math.random()
    .toString(16)
    .slice(2, 10)}`;

  const payload = {
    identifier,
    intent: "app_password",
    user: userId,
    description: TOKEN_DESCRIPTION,
    expiring: true,
    expires: toIso(expiresAt),
  };

  const res = await api.post("/core/tokens/", payload);
  const created = res?.data || {};
  return created.identifier || identifier;
}

/**
 * Prefer userId (uid from headers) if provided; fallback to lookup by username.
 */
async function getOrCreateEnrollmentAppPassword({ username, userId, ttlMinutes = 30 }) {
  const u = String(username || "").trim();
  const now = new Date();

  const resolvedUserId = userId
    ? String(userId).trim()
    : await getUserIdByUsername(u);

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

  const identifier = candidate
    ? String(candidate.t.identifier)
    : await createAppPasswordForUserId(
        resolvedUserId,
        new Date(now.getTime() + ttlMinutes * 60 * 1000)
      );

  // Refresh token info and view key
  const freshList = await listUserAppPasswordsByUserId(resolvedUserId);
  const tokenObj =
    freshList.find((t) => String(t?.identifier || "") === identifier) || candidate?.t;

  const expires = parseExpires(tokenObj) || new Date(now.getTime() + ttlMinutes * 60 * 1000);
  const key = await viewTokenKey(identifier);

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
