'use strict';
// Isolated CFT instance (fresh temp profile, off-screen). Never touches the user's Chrome.
// Question: why does right-click work in a GPT/Qwen composer but open a new tab on
// Chrome's New Tab Page (Google box)? Measure the exact stage that fails per page type.
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const CFT = 'D:\\Softwares\\DailyWork\\BrowserPlugin\\.tooling\\chrome-win64\\chrome.exe';
const EXT = process.env.PC_EXT || path.resolve(__dirname, "..", "..");
const PROFILE = path.join(__dirname, '.pc-ntp-profile');
const PORT = 9336;
const HTTP_PORT = 8739;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGES = {
  plain: '<!doctype html><meta charset=utf-8><title>plain</title><p id=j>Remote Sensing of Environment</p>',
  textarea:
    '<!doctype html><meta charset=utf-8><title>textarea</title><textarea id=t rows=3 cols=40>Remote Sensing of Environment</textarea>',
  editable:
    '<!doctype html><meta charset=utf-8><title>editable</title><div id=e contenteditable=true style="border:1px solid #999;padding:8px">Remote Sensing of Environment</div>',
};

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
        }, 12000);
      });
    },
  };
}
async function findSW() {
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      for (const t of targets.filter((x) => x.type === 'service_worker')) {
        const c = client(await wsConnect(t.webSocketDebuggerUrl));
        try {
          const m = await c.send('Runtime.evaluate', { expression: 'chrome.runtime.getManifest().name', returnByValue: true });
          if (/PublicationChecker/.test(String(m.result.value))) return c;
        } catch {}
        c.ws.close();
      }
    } catch {}
  }
  throw new Error('SW not found');
}

async function main() {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const server = http.createServer((req, res) => {
    const key = (req.url || '').split('?')[1] || 'plain';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(PAGES[key] || PAGES.plain);
  });
  await new Promise((r) => server.listen(HTTP_PORT, '127.0.0.1', r));
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
  const out = {};
  try {
    const sw = await findSW();
    const open = async (url) => (await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json()).id;
    await open(`http://127.0.0.1:${HTTP_PORT}/?plain`);
    await open(`http://127.0.0.1:${HTTP_PORT}/?textarea`);
    await open(`http://127.0.0.1:${HTTP_PORT}/?editable`);
    await open('chrome://newtab/');
    await open('chrome://version/');
    await sleep(2500);

    // one probe per page type: send -> (inject -> resend), recording each stage's real error
    const expr = `(async () => {
      const out = [];
      const tabs = await chrome.tabs.query({});
      for (const t of tabs.filter((x) => !/results\\.html|extensions|devtools/.test(x.url || ''))) {
        const rec = { url: t.url.slice(0, 40) };
        const msg = { type: 'publication-checker:show', query: 'Remote Sensing of Environment' };
        try { rec.send = JSON.stringify(await chrome.tabs.sendMessage(t.id, msg)); }
        catch (e) { rec.sendErr = e.message;
          try { await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['lib/search-core.js', 'content.js'] }); rec.inject = 'ok';
            try { rec.retry = JSON.stringify(await chrome.tabs.sendMessage(t.id, msg)); } catch (e2) { rec.retryErr = e2.message; }
          } catch (e3) { rec.injectErr = e3.message; }
        }
        try {
          const dom = await chrome.scripting.executeScript({ target: { tabId: t.id }, func: () => { const h = document.getElementById('publication-checker-host'); const c = h && h.shadowRoot && h.shadowRoot.querySelector('.card'); return { on: c ? c.classList.contains('on') : null, txt: c ? (c.textContent || '').replace(/\\s+/g, ' ').slice(0, 40) : null }; } });
          rec.overlay = dom[0] && dom[0].result;
        } catch (e) { rec.overlayErr = e.message; }
        out.push(rec);
      }
      return JSON.stringify(out);
    })()`;
    const r = await sw.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    out.perTab = JSON.parse(r.result.value);
    const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    out.fallbackTabs = tabs.filter((x) => /results\.html/.test(x.url || '')).map((x) => x.url.slice(0, 80));
  } finally {
    console.log(JSON.stringify(out, null, 2));
    chrome.kill();
    server.close();
    setTimeout(() => {
      fs.rmSync(PROFILE, { recursive: true, force: true });
      process.exit(0);
    }, 1500);
  }
}
main().catch((e) => {
  console.error('FAILED', e);
  process.exit(1);
});
