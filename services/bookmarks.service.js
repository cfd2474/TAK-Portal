// services/bookmarks.service.js
//
// Bookmarks are now stored in data/settings.json as flat keys:
//   BOOKMARK1_TITLE, BOOKMARK1_URL, ..., BOOKMARK8_TITLE, BOOKMARK8_URL
//
// This service exposes a single loadBookmarks() helper that returns
// an array of { id, title, url } objects suitable for rendering.

const { getString } = require("./env");

// Keep bookmarks stored as flat keys in settings.json (BOOKMARKn_TITLE/URL).
// We support up to 20 entries.
const MAX_BOOKMARKS = 20;

function loadBookmarks() {
  const bookmarks = [];

  for (let i = 1; i <= MAX_BOOKMARKS; i += 1) {
    const titleKey = `BOOKMARK${i}_TITLE`;
    const urlKey = `BOOKMARK${i}_URL`;

    const title = getString(titleKey, "").trim();
    const url = getString(urlKey, "").trim();

    if (!title && !url) continue;

    bookmarks.push({
      id: i,
      title,
      url,
    });
  }

  return bookmarks;
}

module.exports = {
  loadBookmarks,
};
