const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "../data/user-requests.json");

function ensureDir() {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function load() {
  ensureDir();
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
  ensureDir();
  const arr = Array.isArray(items) ? items : [];
  fs.writeFileSync(FILE, JSON.stringify(arr, null, 2));
}

module.exports = { FILE, load, save };
