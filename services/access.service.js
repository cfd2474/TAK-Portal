// services/access.service.js
// Centralized helper for per-agency access rules.
// Agency admin rights are defined *only* on the Agencies page:
// each agency may declare one or more "admin groups". Any Authentik
// user who is a member of one of those groups is treated as an
// "agency admin" for that agency. Global admins still come from
// PORTAL_AUTH_REQUIRED_GROUP via portalAuth.middleware.
const agenciesStore = require("./agencies.service");

function normalizeSuffix(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeGroupList(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[;,]/)
    .map((g) => String(g || "").trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Compute all agency suffixes the given user-groups are admin for.
 * This uses only the `adminGroups` field attached to agencies.json.
 *
 * @param {string[]|null|undefined} userGroups - array of group names
 * @returns {string[]} unique, normalized agency suffixes
 */
function getAllowedAgencySuffixesForGroups(userGroups) {
  const groupsLower = Array.isArray(userGroups)
    ? userGroups.map((g) => String(g || "").trim().toLowerCase()).filter(Boolean)
    : [];

  if (!groupsLower.length) return [];

  const agencies = agenciesStore.load();
  const allowed = new Set();

  for (const agency of agencies) {
    const rawAdmin =
      agency.adminGroups != null ? agency.adminGroups : agency.adminGroup;
    const adminList = normalizeGroupList(rawAdmin);

    if (!adminList.length) continue;

    const hasAny = adminList.some((needed) => groupsLower.includes(needed));
    if (!hasAny) continue;

    const sfx = normalizeSuffix(agency.suffix);
    if (sfx) {
      allowed.add(sfx);
    }
  }

  return Array.from(allowed);
}

/**
 * Whether any agency declares agency-admin groups at all.
 */
function hasAnyAgencyAdminsConfigured() {
  const agencies = agenciesStore.load();
  return agencies.some((agency) => {
    const rawAdmin =
      agency.adminGroups != null ? agency.adminGroups : agency.adminGroup;
    const list = normalizeGroupList(rawAdmin);
    return list.length > 0;
  });
}

/**
 * Return a unified view of the current user's access.
 *
 * - Global admins (from portalAuth) can see all agencies.
 * - Agency admins can see only agencies whose suffix they are admin for.
 *
 * @param {object|null} authUser - req.authentikUser
 * @returns {{ isGlobalAdmin: boolean, isAgencyAdmin: boolean, allowedAgencySuffixes: string[]|null }}
 */
function getAgencyAccess(authUser) {
  const isGlobalAdmin = !!(authUser && authUser.isGlobalAdmin);

  if (isGlobalAdmin) {
    return {
      isGlobalAdmin: true,
      isAgencyAdmin: false,
      // null means "all agencies"
      allowedAgencySuffixes: null,
    };
  }

  const groups = authUser && Array.isArray(authUser.groups) ? authUser.groups : [];
  const allowedAgencySuffixes = getAllowedAgencySuffixesForGroups(groups);

  return {
    isGlobalAdmin: false,
    isAgencyAdmin: allowedAgencySuffixes.length > 0,
    allowedAgencySuffixes,
  };
}

/**
 * Filter a list of agencies down to those visible for the current user.
 */
function filterAgenciesForUser(authUser, agencies) {
  const access = getAgencyAccess(authUser);
  const list = Array.isArray(agencies) ? agencies : [];

  if (access.isGlobalAdmin) {
    return list;
  }

  const allowed = access.allowedAgencySuffixes || [];
  if (!allowed.length) return [];

  const allowedSet = new Set(allowed.map(normalizeSuffix));
  return list.filter((a) => allowedSet.has(normalizeSuffix(a.suffix)));
}

/**
 * Does the user have access to a given agency suffix?
 */
function isSuffixAllowed(authUser, suffix) {
  const access = getAgencyAccess(authUser);
  if (access.isGlobalAdmin) return true;
  const sfx = normalizeSuffix(suffix);
  if (!sfx) return false;
  const allowed = access.allowedAgencySuffixes || [];
  return allowed.map(normalizeSuffix).includes(sfx);
}

/**
 * Does a username belong to any agency the current user can manage?
 * We infer agency from the username suffix: badge + agencySuffix.
 */
function isUsernameInAllowedAgencies(authUser, username) {
  const access = getAgencyAccess(authUser);
  if (access.isGlobalAdmin) return true;

  const allowed = access.allowedAgencySuffixes || [];
  if (!allowed.length) return false;

  const un = String(username || "").toLowerCase();
  return allowed
    .map(normalizeSuffix)
    .some((sfx) => sfx && un.endsWith(sfx));
}

module.exports = {
  normalizeSuffix,
  normalizeGroupList,
  getAllowedAgencySuffixesForGroups,
  hasAnyAgencyAdminsConfigured,
  getAgencyAccess,
  filterAgenciesForUser,
  isSuffixAllowed,
  isUsernameInAllowedAgencies,
};
