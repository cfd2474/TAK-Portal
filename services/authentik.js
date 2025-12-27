const axios = require("axios");
const http = require("http");
const https = require("https");
const { getString } = require("./env");

const AUTHENTIK_URL = getString("AUTHENTIK_URL");
const AUTHENTIK_TOKEN = getString("AUTHENTIK_TOKEN");

if (!AUTHENTIK_URL) throw new Error("Missing AUTHENTIK_URL in settings.json");
if (!AUTHENTIK_TOKEN) throw new Error("Missing AUTHENTIK_TOKEN in settings.json");

const baseUrl = AUTHENTIK_URL.replace(/\/+$|\s+$/g, "");

const agentOptions = {
  keepAlive: true,
  maxSockets: 20,
};

module.exports = axios.create({
  baseURL: `${baseUrl}/api/v3`,
  headers: {
    Authorization: `Bearer ${AUTHENTIK_TOKEN}`,
    "Content-Type": "application/json",
  },
  timeout: 30000,
  httpAgent: new http.Agent(agentOptions),
  httpsAgent: new https.Agent(agentOptions),
});
