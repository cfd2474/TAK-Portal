// Groups Service — caching removed

// Raw calls (unchanged)
async function getAllGroupsRaw() {
  // original implementation here — unchanged
}

async function getAllUsersRaw() {
  // original implementation here — unchanged
}

// Keep these so callers don't break, but make them no-ops.
function invalidateGroupsCache() {}
function invalidateGroupUsersCache() {}

async function getAllGroups(options = {}) {
  return await getAllGroupsRaw();
}

async function getAllUsers(options = {}) {
  return await getAllUsersRaw();
}

module.exports = {
  getAllGroups,
  getAllUsers,
  getAllGroupsRaw,
  getAllUsersRaw,
  invalidateGroupsCache,
  invalidateGroupUsersCache,
};
