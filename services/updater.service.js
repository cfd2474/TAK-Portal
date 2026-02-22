const { spawn } = require("child_process");
const path = require("path");
const EventEmitter = require("events");

/**
 * Updater singleton used by routes/update.routes.js.
 * Expected interface:
 *   - start(): Promise<void>
 *   - getStatus(): object
 *   - EventEmitter events: 'log', 'status'
 *   - state.logs buffer for replay
 */
class UpdaterService extends EventEmitter {
  constructor() {
    super();
    this.state = {
      running: false,
      startedAt: null,
      finishedAt: null,
      exitCode: null,
      logs: [],
    };
    this._proc = null;
  }

  getStatus() {
    return {
      running: this.state.running,
      startedAt: this.state.startedAt,
      finishedAt: this.state.finishedAt,
      exitCode: this.state.exitCode,
    };
  }

  _emitStatus() {
    this.emit("status", this.getStatus());
  }

  _pushLog(line, stream = "stdout") {
    const entry = {
      ts: new Date().toISOString(),
      stream,
      line: String(line).replace(/\r?\n$/, ""),
    };

    this.state.logs.push(entry);
    // keep last ~2000 lines to prevent unbounded growth
    if (this.state.logs.length > 2000) {
      this.state.logs.splice(0, this.state.logs.length - 2000);
    }

    this.emit("log", entry);
  }

  async start() {
    if (this.state.running) {
      const err = new Error("Update already in progress");
      err.code = "UPDATE_IN_PROGRESS";
      throw err;
    }

    this.state.running = true;
    this.state.startedAt = new Date().toISOString();
    this.state.finishedAt = null;
    this.state.exitCode = null;
    this._emitStatus();
    this._pushLog("Starting update…", "system");

    const scriptPath = path.resolve(process.cwd(), "./takportal");

    // Run via bash so it works even if the takportal file lost its executable bit
    const child = spawn("sh", [scriptPath, "update"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      cwd: process.cwd(),
    });

    this._proc = child;

    child.stdout.on("data", (buf) => {
      buf
        .toString()
        .split(/\r?\n/)
        .forEach((l) => l && this._pushLog(l, "stdout"));
    });

    child.stderr.on("data", (buf) => {
      buf
        .toString()
        .split(/\r?\n/)
        .forEach((l) => l && this._pushLog(l, "stderr"));
    });

    child.on("error", (e) => {
      this._pushLog(`ERROR: ${e?.message || String(e)}`, "stderr");
    });

    child.on("close", (code) => {
      this.state.running = false;
      this.state.exitCode = typeof code === "number" ? code : null;
      this.state.finishedAt = new Date().toISOString();
      this._emitStatus();

      if (code === 0) {
        this._pushLog("Update completed successfully.", "system");
      } else {
        this._pushLog(`Update failed with exit code ${code}`, "system");
      }

      this._proc = null;
    });
  }
}

module.exports = new UpdaterService();