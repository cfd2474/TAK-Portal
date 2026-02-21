const { spawn } = require("child_process");
const path = require("path");
const EventEmitter = require("events");

/**
 * WebUI Updater
 *
 * Runs a self-update inside the running container/host process:
 *  - git pull
 *  - npm install --omit=dev
 *  - restart (process exit; supervisor/docker restarts)
 *
 * Notes:
 *  - This does NOT require docker socket access.
 *  - It expects the app folder to be a git checkout (the release zip includes .git).
 */
class Updater extends EventEmitter {
  constructor() {
    super();

    this.state = {
      running: false,
      startedAt: null,
      finishedAt: null,
      exitCode: null,
      error: null,
      logs: [],
    };

    this.maxLogs = 2500;
  }

  getStatus() {
    const { running, startedAt, finishedAt, exitCode, error } = this.state;
    return { running, startedAt, finishedAt, exitCode, error };
  }

  _pushLog(line) {
    const ts = new Date().toISOString();
    const entry = { ts, line: String(line).replace(/\r?\n$/, "") };
    this.state.logs.push(entry);
    if (this.state.logs.length > this.maxLogs) {
      this.state.logs.splice(0, this.state.logs.length - this.maxLogs);
    }
    this.emit("log", entry);
  }

  _setState(patch) {
    this.state = { ...this.state, ...patch };
    this.emit("status", this.getStatus());
  }

  async start() {
    if (this.state.running) {
      const err = new Error("Update already in progress");
      err.code = "UPDATE_IN_PROGRESS";
      throw err;
    }

    this._setState({
      running: true,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      exitCode: null,
      error: null,
      logs: [],
    });

    // Fire-and-forget async runner
    this._run().catch((err) => {
      this._pushLog(`ERROR: ${err?.message || err}`);
      this._setState({
        running: false,
        finishedAt: new Date().toISOString(),
        exitCode: 1,
        error: err?.message || String(err),
      });
    });
  }

  async _run() {
    const repoRoot = path.join(__dirname, "..");

    const steps = [
      {
        title: "Checking environment",
        cmd: "node -v && npm -v && (command -v git >/dev/null 2>&1 || (echo 'git not found; attempting to install...' && apk add --no-cache git openssh-client)) && git --version",
      },
      {
        title: "Fetching latest code",
        cmd: "git rev-parse --is-inside-work-tree >/dev/null 2>&1 && (git pull --rebase --autostash || git pull) || (echo 'No .git repo found; cannot auto-update.' && exit 2)",
      },
      {
        title: "Installing dependencies",
        cmd: "npm install --omit=dev",
      },
    ];

    for (const step of steps) {
      this._pushLog(`\n==> ${step.title}`);
      const code = await this._spawnStep(step.cmd, repoRoot);
      if (code !== 0) {
        throw new Error(`Step failed (${step.title}) with exit code ${code}`);
      }
    }

    this._pushLog("\n✅ Update complete. Restarting the service...");

    this._setState({
      running: false,
      finishedAt: new Date().toISOString(),
      exitCode: 0,
      error: null,
    });

    // Give the SSE stream a moment to flush before exiting.
    setTimeout(() => {
      // Exiting lets Docker/systemd/pm2 restart the service.
      process.exit(0);
    }, 1200);
  }

  _spawnStep(cmd, cwd) {
    return new Promise((resolve) => {
      const child = spawn("sh", ["-lc", cmd], {
        cwd,
        env: { ...process.env },
      });

      child.stdout.on("data", (buf) => {
        const text = buf.toString("utf8");
        text.split(/\r?\n/).forEach((line) => {
          if (line.trim().length) this._pushLog(line);
        });
      });

      child.stderr.on("data", (buf) => {
        const text = buf.toString("utf8");
        text.split(/\r?\n/).forEach((line) => {
          if (line.trim().length) this._pushLog(line);
        });
      });

      child.on("close", (code) => resolve(typeof code === "number" ? code : 1));
      child.on("error", () => resolve(1));
    });
  }
}

module.exports = new Updater();
