const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "../data/agency-templates.json");

function load() {
  if (!fs.existsSync(FILE)) return [];
  return JSON.parse(fs.readFileSync(FILE, "utf8"));
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

module.exports = { load, save, FILE };
