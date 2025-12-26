const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "../data/mutual-aid.json");

function load() {
  if (!fs.existsSync(FILE)) return [];
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function save(items) {
  const arr = Array.isArray(items) ? items : [];
  fs.writeFileSync(FILE, JSON.stringify(arr, null, 2));
}

module.exports = { FILE, load, save };
