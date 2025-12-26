const axios = require("axios");
const http = require("http");
const https = require("https");

if (!process.env.AUTHENTIK_URL) throw new Error("Missing AUTHENTIK_URL in .env");
if (!process.env.AUTHENTIK_TOKEN) throw new Error("Missing AUTHENTIK_TOKEN in .env");

const agentOptions = {
  keepAlive: true,
  maxSockets: 20,
};

module.exports = axios.create({
  baseURL: `${process.env.AUTHENTIK_URL}/api/v3`,
  headers: {
    Authorization: `Bearer ${process.env.AUTHENTIK_TOKEN}`,
    "Content-Type": "application/json",
  },
  timeout: 30000,
  httpAgent: new http.Agent(agentOptions),
  httpsAgent: new https.Agent(agentOptions),
});

