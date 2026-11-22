/* Headless Chrome over the DevTools protocol, with nothing to install: one browser, one page at a time.
   Used by engines/screen/record.mjs. CHROME_PATH overrides the binary. */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export const CHROME = process.env.CHROME_PATH || [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome", "/usr/bin/chromium"].find(existsSync);

export async function withChrome(opts, fn) {
  if (!CHROME) throw new Error("no Chrome or Chromium found (set CHROME_PATH)");
  const { width = 1440, height = 900, scale = 1, flags = [] } = opts;
  const tmp = mkdtempSync(join(tmpdir(), "kit-chrome-"));
  const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check",
    "--force-color-profile=srgb", "--remote-debugging-port=0", `--user-data-dir=${join(tmp, "profile")}`, ...flags, "about:blank"],
    { stdio: ["ignore", "ignore", "pipe"], detached: true });
  try {
    const wsUrl = await new Promise((ok, bad) => {
      const to = setTimeout(() => bad(new Error("no DevTools endpoint")), 30000); let buf = "";
      chrome.stderr.on("data", (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(to); ok(m[1]); } });
    });
    const ws = new WebSocket(wsUrl);
    await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
    let id = 0; const wait = new Map(); const listeners = [];
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && wait.has(d.id)) { const { ok, bad } = wait.get(d.id); wait.delete(d.id); d.error ? bad(new Error(d.error.message)) : ok(d.result); }
      else if (d.method) listeners.forEach((l) => l(d));
    };
    const send = (method, params = {}, sessionId) => new Promise((ok, bad) => { const n = ++id; wait.set(n, { ok, bad }); ws.send(JSON.stringify({ id: n, method, params, sessionId })); });
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const s = (m, p) => send(m, p, sessionId);
    await s("Page.enable");
    await s("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false });
    const ev = async (expression) => {
      const r = await s("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const shot = async (clip = { x: 0, y: 0, width, height }) => Buffer.from((await s("Page.captureScreenshot", { format: "png", optimizeForSpeed: true, clip: { ...clip, scale: 1 } })).data, "base64");
    const goto = async (url, timeoutMs = 25000) => {
      let loaded = false; const l = (d) => { if (d.method === "Page.loadEventFired") loaded = true; }; listeners.push(l);
      await s("Page.navigate", { url });
      const t0 = Date.now(); while (!loaded && Date.now() - t0 < timeoutMs) await new Promise((r) => setTimeout(r, 100));
      listeners.splice(listeners.indexOf(l), 1);
      return loaded;
    };
    return await fn({ s, ev, shot, goto, width, height });
  } finally { try { process.kill(-chrome.pid, "SIGKILL"); } catch {} rmSync(tmp, { recursive: true, force: true }); }
}
