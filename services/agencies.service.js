const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "../data/agencies.json");

function load() {
  return fs.existsSync(FILE)
    ? JSON.parse(fs.readFileSync(FILE, "utf8"))
    : [];
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

module.exports = { load, save, FILE };
