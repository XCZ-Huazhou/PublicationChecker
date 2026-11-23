'use strict';
// Isolated CFT gate: right-click lookup on a LOCAL file:// HTML page must return
// real results, not "检索失败：Failed to fetch".
// Root cause: in-page fetch of chrome-extension://data/*.gz is blocked from a
// file:// (null/opaque) origin (web_accessible_resources matches only http/https).
// Fix: content.js routes file:// lookups to the background (reads its own origin).
// Self-contained: builds a throwaway copy of EXT with file:///* added to the
// manifest so the content script injects on file:// WITHOUT the user toggle
// (that manifest grant is test scaffolding only, never shipped).
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const CFT = 'D:\\Softwares\\DailyWork\\BrowserPlugin\\.tooling\\chrome-win64\\chrome.exe';
const EXT = process.env.PC_EXT || path.resolve(__dirname, '..', '..');
const TEMP_EXT = path.join(__dirname, '.qc-file-ext');
const FIXTURE = path.join(__dirname, '.qc-file-page.html');
const PROFILE = path.join(__dirname, '.qc-file-profile');
const PORT = Number(process.env.PC_PORT || 9351);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FILES = ['manifest.json', 'background.js', 'content.js', 'popup.html', 'popup.js', 'popup.css',
  'results.html', 'results.js', 'results.css', 'options.html', 'options.js', 'options.css'];
const DIRS = ['lib', 'icons', 'data'];

function buildTempExt() {
  fs.rmSync(TEMP_EXT, { recursive: true, force: true });
  fs.mkdirSync(TEMP_EXT, { recursive: true });
  for (const f of FILES) fs.copyFileSync(path.join(EXT, f), path.join(TEMP_EXT, f));
  for (const d of DIRS) fs.cpSync(path.join(EXT, d), path.join(TEMP_EXT, d), { recursive: true });
  const mf = path.join(TEMP_EXT, 'manifest.json');
  const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
  const addFile = (arr) => (arr.includes('file:///*') ? arr : arr.concat('file:///*'));
  m.host_permissions = addFile(m.host_permissions || []);
  for (const cs of m.content_scripts || []) cs.matches = addFile(cs.matches || []);
  fs.writeFileSync(mf, JSON.stringify(m, null, 2));
  fs.writeFileSync(FIXTURE, '<!doctype html><meta charset=utf-8><title>filepage</title><p id=j style="margin:40px">Remote Sensing of Environment</p>');
}

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
          if (pending.has(id)) { pending.delete(id); reject(new Error('timeout ' + method)); }
        }, 20000);
      });
    },
  };
}
async function findSW() {
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    try {
      const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      for (const x of l.filter((y) => y.type === 'service_worker')) {
        const c = client(await wsConnect(x.webSocketDebuggerUrl));
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

const STATE = `(() => {
  const h = document.getElementById('publication-checker-host');
  const c = h && h.shadowRoot && h.shadowRoot.querySelector('.card');
  if (!c) return { on: false, txt: null };
  const txt = (c.textContent || '').replace(/\\s+/g, ' ');
  return { on: c.classList.contains('on'), txt: txt.slice(0, 60), failed: /检索失败|Failed to fetch/.test(txt), hasResult: /JCR|中科院/.test(txt) };
})()`;

async function main() {
  buildTempExt();
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const fileUrl = 'file:///' + FIXTURE.replace(/\\/g, '/');
  const chrome = spawn(CFT, [
    '--user-data-dir=' + PROFILE,
    '--load-extension=' + TEMP_EXT,
    '--disable-extensions-except=' + TEMP_EXT,
    `--remote-debugging-port=${PORT}`,
    '--window-position=-32000,-32000',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=CalculateNativeWinOcclusion',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    'about:blank',
  ], { stdio: 'ignore' });
  const out = { fileUrl };
  try {
    const sw = await findSW();
    const page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(fileUrl)}`, { method: 'PUT' })).json();
    await sleep(2500);
    const pc = client(await wsConnect(page.webSocketDebuggerUrl));
    await pc.send('Runtime.evaluate', {
      expression: `(() => { const el = document.getElementById('j'); const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); })()`,
      returnByValue: true,
    });
    const tabs = await sw.send('Runtime.evaluate', { expression: 'chrome.tabs.query({})', awaitPromise: true, returnByValue: true });
    const tab = tabs.result.value.find((x) => (x.url || '').startsWith('file://'));
    if (!tab) throw new Error('file tab not found');
    out.send = (await sw.send('Runtime.evaluate', { expression: `showInPage(${tab.id}, 'Remote Sensing of Environment').then(()=> 'sent').catch(e=> 'err:'+e.message)`, awaitPromise: true, returnByValue: true })).result.value;
    await sleep(900);
    out.state = (await pc.send('Runtime.evaluate', { expression: STATE, returnByValue: true })).result.value;
    out.verdict = out.state && out.state.on && out.state.hasResult && !out.state.failed ? 'PASS file:// 查询返回真实结果' : 'FAIL';
    pc.ws.close();
  } finally {
    console.log(JSON.stringify(out, null, 2));
    chrome.kill();
    setTimeout(() => {
      fs.rmSync(PROFILE, { recursive: true, force: true });
      fs.rmSync(TEMP_EXT, { recursive: true, force: true });
      fs.rmSync(FIXTURE, { force: true });
      process.exit(0);
    }, 1200);
  }
}
main().catch((e) => { console.error('FAILED', e); process.exit(1); });