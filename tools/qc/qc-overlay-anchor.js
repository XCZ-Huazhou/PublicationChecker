'use strict';
// Isolated CFT instance only. Question: why does the overlay land bottom-right on
// google.com instead of next to the selection?
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const CFT = 'D:\\Softwares\\DailyWork\\BrowserPlugin\\.tooling\\chrome-win64\\chrome.exe';
const EXT = process.env.PC_EXT || path.resolve(__dirname, "..", "..");
const PROFILE = path.join(__dirname, '.pc-pos-profile');
const PORT = 9338;
const HTTP_PORT = 8740;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SYNTH = `<!doctype html><meta charset=utf-8><title>synth</title>
<style>body{margin:0}#wrap{transform:translateZ(0)}#box{margin:24px}</style>
<div id=wrap><textarea id=box rows=2 cols=30>Remote Sensing of Environment</textarea></div>`;

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
        }, 15000);
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

// runs in the content-script world: report what the overlay thinks where it is
const MEASURE = `(() => {
  const h = document.getElementById('publication-checker-host');
  const card = h && h.shadowRoot && h.shadowRoot.querySelector('.card');
  const box = document.querySelector('textarea,[contenteditable=true]');
  let selRect = null;
  const s = getSelection();
  if (s && s.rangeCount) { const r = s.getRangeAt(0).getBoundingClientRect(); selRect = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }
  const chain = [];
  let n = h;
  while (n && n.nodeType === 1) { const cs = getComputedStyle(n); if (cs.transform !== 'none' || cs.filter !== 'none' || cs.willChange !== 'auto' || cs.contain.includes('layout')) chain.push(n.tagName + '#' + (n.id || '') + '{' + cs.transform + '}'); n = n.parentElement; }
  return {
    vw: innerWidth, vh: innerHeight,
    hostParent: h ? (h.parentElement ? h.parentElement.tagName : 'none') : 'no-host',
    cardRect: card ? (() => { const r = card.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; })() : null,
    cardStyle: card ? { left: card.style.left, top: card.style.top } : null,
    boxRect: box ? (() => { const r = box.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top) }; })() : null,
    selRect, transformedAncestors: chain,
  };
})()`;

async function probePage(sw, label, url, prep) {
  const page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
  await sleep(3000);
  const pc = client(await wsConnect(page.webSocketDebuggerUrl));
  await pc.send('Runtime.enable');
  if (prep) {
    await pc.send('Runtime.evaluate', { expression: prep });
    await sleep(400);
  }
  const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const tabIdMatch = page.id;
  const expr = `(async () => {
    const all = await chrome.tabs.query({});
    const t = all.find((x) => x.id && (${JSON.stringify(label)} === x.title || (x.url || '').startsWith(${JSON.stringify(url.slice(0, 40))})));
    if (!t) return 'tab-not-found';
    await showInPage(t.id, 'Remote Sensing of Environment');
    return 'sent';
  })()`;
  const r = await sw.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  await sleep(900);
  const m = await pc.send('Runtime.evaluate', { expression: MEASURE, returnByValue: true });
  pc.ws.close();
  return { label, url: url.slice(0, 46), send: r.result.value, measure: m.result.value, tabIdUsed: tabIdMatch };
}

async function main() {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(SYNTH);
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
  const out = [];
  try {
    const sw = await findSW();
    // select the text inside the textarea the way a user would (input selection, not document selection)
    const prep = `(() => { const b = document.querySelector('textarea,[contenteditable=true]'); if (!b) return; b.focus(); if (b.setSelectionRange) b.setSelectionRange(0, b.value.length); else { const r = document.createRange(); r.selectNodeContents(b.firstChild || b); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } })()`;
    out.push(await probePage(sw, 'synth', `http://127.0.0.1:${HTTP_PORT}/?synth`, prep));
    out.push(await probePage(sw, 'google', 'https://www.google.com/', prep));
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
