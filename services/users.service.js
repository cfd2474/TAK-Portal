// Users Service — caching removed

const axios = require("axios");

// Raw calls stay unchanged
async function getAllUsersRaw() {
  // original implementation here — unchanged
}

async function getAllGroupsRaw() {
  // original implementation here — unchanged
}

// Caching disabled: keep API stable, but always fetch fresh
function invalidateUsersCache() {}
function invalidateGroupsCache() {}

async function getAllUsers(options = {}) {
  return await getAllUsersRaw();
}

async function getAllGroups(options = {}) {
  return await getAllGroupsRaw();
}

module.exports = {
  getAllUsers,
  getAllGroups,
  getAllUsersRaw,
  getAllGroupsRaw,
  invalidateUsersCache,
  invalidateGroupsCache,
};
