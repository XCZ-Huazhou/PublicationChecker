'use strict';
// Measure popup page-side open cost. Run once per extension directory to compare
// the bloated source dir (29.8 MB, has .git/raw/docs) with the lean build dir (2.3 MB).
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const CFT = 'D:\\Softwares\\DailyWork\\BrowserPlugin\\.tooling\\chrome-win64\\chrome.exe';
const EXT = process.argv[2] || path.resolve(__dirname, "..", "..");
const PROFILE = path.join(__dirname, '.pc-time-profile');
const PORT = Number(process.env.PC_PORT || 9341);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function wsConnect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => resolve(ws);
    ws.onerror = reject;
  });
}
let nextId = 1;
function client(ws) {
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
    }
  };
  return {
    ws,
    send(method, params = {}) {
      const id = nextId++;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            reject(new Error('timeout ' + method));
          }
        }, 25000);
      });
    },
  };
}

async function main() {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const chrome = spawn(
    CFT,
    [
      '--user-data-dir=' + PROFILE,
      '--load-extension=' + EXT,
      '--disable-extensions-except=' + EXT,
      `--remote-debugging-port=${PORT}`,
      '--window-position=-32000,-32000',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=CalculateNativeWinOcclusion',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );
  const out = { ext: EXT };
  try {
    let id = null;
    for (let i = 0; i < 60 && !id; i++) {
      await sleep(500);
      const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      for (const x of l.filter((y) => y.type === 'service_worker')) {
        const p = client(await wsConnect(x.webSocketDebuggerUrl));
        try {
          const m = await p.send('Runtime.evaluate', { expression: 'JSON.stringify([chrome.runtime.getManifest().name, chrome.runtime.id])', returnByValue: true });
          const [n, i2] = JSON.parse(m.result.value || '[]');
          if (/PublicationChecker/.test(n || '')) { id = i2; break; }
        } catch {}
        p.ws.close();
      }
    }
    if (!id) throw new Error('extension not found');
    out.extId = id;

    // time 3 cold loads of the popup document
    if (process.env.PC_IDLE_MS) {
      out.idleBeforeFirst = Number(process.env.PC_IDLE_MS);
      await sleep(Number(process.env.PC_IDLE_MS)); // let the MV3 service worker die
    }
    out.loads = [];
    for (let k = 0; k < 3; k++) {
      const t0 = Date.now();
      const page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(`chrome-extension://${id}/popup.html`)}`, { method: 'PUT' })).json();
      const c = client(await wsConnect(page.webSocketDebuggerUrl));
      await c.send('Runtime.enable');
      let ready = null;
      for (let i = 0; i < 40; i++) {
        await sleep(150);
        const r = await c.send('Runtime.evaluate', {
          expression: `(() => {
            const nav = performance.getEntriesByType('navigation')[0];
            const paint = performance.getEntriesByType('paint');
            const fcp = paint.find(p => p.name === 'first-contentful-paint');
            if (!nav) return null;
            return JSON.stringify({ dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), navDur: Math.round(nav.duration), fcp: fcp ? Math.round(fcp.startTime) : null, domNodes: document.getElementsByTagName('*').length });
          })()`,
          returnByValue: true,
        });
        if (r.result.value) { ready = JSON.parse(r.result.value); break; }
      }
      ready = ready || {};
      ready.wallMs = Date.now() - t0;
      out.loads.push(ready);
      // first query cost (DB decompress) and a warm query cost
      const q = await c.send('Runtime.evaluate', {
        expression: `(async () => {
          const t1 = performance.now();
          const a = await PublicationChecker.searchJournals('Environment', 8);
          const t2 = performance.now();
          const b = await PublicationChecker.searchJournals('Environment', 8);
          const t3 = performance.now();
          return JSON.stringify({ firstMs: Math.round(t2 - t1), warmMs: Math.round(t3 - t2), total: a.total });
        })()`,
        awaitPromise: true,
        returnByValue: true,
      });
      out.firstQuery = JSON.parse(q.result.value);
      c.ws.close();
      await (await fetch(`http://127.0.0.1:${PORT}/json/close/${page.id}`)).text();
    }
  } finally {
    console.log(JSON.stringify(out, null, 2));
    chrome.kill();
    setTimeout(() => {
      fs.rmSync(PROFILE, { recursive: true, force: true });
      process.exit(0);
    }, 1200);
  }
}
main().catch((e) => {
  console.error('FAILED', e);
  process.exit(1);
});
