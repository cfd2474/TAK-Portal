/**
 * services/takSsh.service.js
 *
 * Run makeCert.sh on the TAK server via SSH when creating an integration user.
 * Used so that nodered-* integration users get a client cert on the TAK server.
 *
 * Settings (all optional; if not set, cert creation is skipped):
 *   TAK_SSH_HOST       SSH host (default: hostname from TAK_URL)
 *   TAK_SSH_PORT       SSH port (default: 22)
 *   TAK_SSH_USER       SSH username (must be able to sudo -u tak)
 *   TAK_SSH_PRIVATE_KEY_PATH   Path to PEM private key file
 *   TAK_SSH_PASSPHRASE Optional passphrase for encrypted key
 *
 * Command run on server: sudo -u tak bash -c 'cd /opt/tak/certs && ./makeCert.sh client <username>'
 */

const fs = require("fs");
const path = require("path");
const { Client } = require("ssh2");
const { getString, getInt, getBool } = require("./env");

function resolvePathMaybe(p) {
  if (!p || !String(p).trim()) return null;
  const raw = String(p).trim();
  return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
}

function getTakUrlHostname() {
  const raw = String(getString("TAK_URL", "")).trim();
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}

/**
 * @returns { { host, port, username, privateKey, passphrase? } | null }
 *   Config for SSH, or null if SSH is not configured (skip cert creation).
 */
function getTakSshConfig() {
  const keyPath = resolvePathMaybe(getString("TAK_SSH_PRIVATE_KEY_PATH", ""));
  if (!keyPath || !fs.existsSync(keyPath)) return null;

  let privateKey;
  try {
    privateKey = fs.readFileSync(keyPath, "utf8");
  } catch (err) {
    console.warn("[TAK SSH] Could not read private key:", err?.message || err);
    return null;
  }

  const username = String(getString("TAK_SSH_USER", "")).trim();
  if (!username) return null;

  let host = String(getString("TAK_SSH_HOST", "")).trim();
  if (!host) host = getTakUrlHostname();
  if (!host) return null;

  const port = getInt("TAK_SSH_PORT", 22) || 22;
  const passphrase = getString("TAK_SSH_PASSPHRASE", "").trim() || undefined;

  return { host, port, username, privateKey, passphrase };
}

/**
 * Run on TAK server: sudo -u tak bash -c 'cd /opt/tak/certs && ./makeCert.sh client <username>'
 * @param {string} username - Integration username (e.g. nodered-aircraft-all)
 * @returns { Promise<{ ok: boolean, skipped?: boolean, message?: string }> }
 */
function createTakClientCertForIntegration(username) {
  const TAK_DEBUG = getBool("TAK_DEBUG", false);
  const bypass = getBool("TAK_BYPASS_ENABLED", false);
  if (bypass) {
    return Promise.resolve({ ok: false, skipped: true, message: "TAK bypass enabled." });
  }

  const un = String(username || "").trim();
  if (!un) return Promise.resolve({ ok: false, message: "Username required." });

  const config = getTakSshConfig();
  if (!config) {
    return Promise.resolve({
      ok: false,
      skipped: true,
      message: "TAK SSH not configured (set TAK_SSH_USER and TAK_SSH_PRIVATE_KEY_PATH).",
    });
  }

  // Safe for shell: single-quote wrapped; username is alphanumeric + hyphens only for integrations
  const safeName = un.replace(/'/g, "'\"'\"'");
  const command = `sudo -u tak bash -c 'cd /opt/tak/certs && ./makeCert.sh client ${safeName}'`;

  if (TAK_DEBUG) console.log("[TAK SSH] Connecting to", config.host + ":" + config.port, "as", config.username);

  return new Promise((resolve) => {
    const conn = new Client();
    const timeout = 30000;
    const t = setTimeout(() => {
      conn.end();
      resolve({ ok: false, message: "SSH command timed out." });
    }, timeout);

    conn
      .on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(t);
            conn.end();
            resolve({ ok: false, message: err.message || String(err) });
            return;
          }
          let stdout = "";
          let stderr = "";
          stream.on("data", (data) => { stdout += data.toString(); });
          stream.stderr.on("data", (data) => { stderr += data.toString(); });
          stream.on("close", (code) => {
            clearTimeout(t);
            conn.end();
            if (code !== 0) {
              resolve({
                ok: false,
                message: stderr.trim() || stdout.trim() || `Exit code ${code}`,
              });
              return;
            }
            if (TAK_DEBUG) console.log("[TAK SSH] makeCert.sh succeeded for", un);
            resolve({ ok: true });
          });
        });
      })
      .on("error", (err) => {
        clearTimeout(t);
        resolve({ ok: false, message: err.message || String(err) });
      })
      .connect({
        host: config.host,
        port: config.port,
        username: config.username,
        privateKey: config.privateKey,
        passphrase: config.passphrase,
        readyTimeout: 15000,
      });
  });
}

module.exports = {
  getTakSshConfig,
  createTakClientCertForIntegration,
};
