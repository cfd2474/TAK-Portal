const api = require("./authentik");

const TOKEN_DESCRIPTION = "TAK Portal Enrollment";
const IDENT_PREFIX = "tak-portal-enroll-";

function toIso(dt) {
  return dt instanceof Date ? dt.toISOString() : new Date(dt).toISOString();
}

async function getUserIdByUsername(username) {
  const u = String(username || "").trim();
  if (!u) throw new Error("Missing username");

  const res = await api.get("/core/users/", {
    params: { username: u, page_size: 50 },
  });

  const results = res?.data?.results || [];
  const user = results.find((x) => String(x?.username || "") === u) || results[0];
  const pk = user && (user.pk ?? user.id);
  if (!pk) throw new Error(`Unable to resolve Authentik user id for ${u}`);
  return pk;
}

function parseExpires(tokenObj) {
  const raw = tokenObj && tokenObj.expires;
  if (!raw) return null;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

async function listUserAppPasswords(username) {
  const u = String(username || "").trim();
  const res = await api.get("/core/tokens/", {
    params: {
      intent: "app_password",
      "user__username": u,
      ordering: "-expires",
      page_size: 100,
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

async function createAppPasswordForUser(username, expiresAt) {
  const userId = await getUserIdByUsername(username);

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
  const ident = created.identifier || identifier;

  return ident;
}

/**
 * Return an existing (non-expired) enrollment token for this user, or create one.
 *
 * Guarantees a stable token (no duplicates) within the validity window by:
 *  1) listing existing app_password tokens for the user
 *  2) selecting the most recent one created by this portal (description/prefix)
 *  3) reusing it if it has not expired
 */
async function getOrCreateEnrollmentAppPassword(username, ttlMinutes = 30) {
  const u = String(username || "").trim();
  if (!u) throw new Error("Missing username");

  const now = new Date();
  const tokens = await listUserAppPasswords(u);

  const candidate = tokens
    .filter((t) => {
      const d = String(t?.description || "");
      const ident = String(t?.identifier || "");
      const isOurs = d === TOKEN_DESCRIPTION || ident.startsWith(IDENT_PREFIX);
      return isOurs;
    })
    .map((t) => ({ t, expires: parseExpires(t) }))
    .filter((x) => x.expires && x.expires.getTime() > now.getTime())
    .sort((a, b) => b.expires.getTime() - a.expires.getTime())[0];

  const identifier = candidate
    ? String(candidate.t.identifier)
    : await createAppPasswordForUser(u, new Date(now.getTime() + ttlMinutes * 60 * 1000));

  // Fetch fresh details for expires (create returns may omit)
  const freshList = await listUserAppPasswords(u);
  const tokenObj =
    freshList.find((t) => String(t?.identifier || "") === identifier) ||
    candidate?.t;
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
