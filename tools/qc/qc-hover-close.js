'use strict';
// Isolated CFT check: does the overlay really close ~300ms after the pointer leaves?
// The listeners live in the extension's content-script world, so the events are
// dispatched from chrome.scripting.executeScript (same world), not the page world.
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const CFT = 'D:\\Softwares\\DailyWork\\BrowserPlugin\\.tooling\\chrome-win64\\chrome.exe';
const EXT = process.env.PC_EXT || path.resolve(__dirname, '..', '..');
const PROFILE = path.join(__dirname, '.qc-hover-profile');
const PORT = Number(process.env.PC_PORT || 9343);
const HTTP_PORT = Number(process.env.PC_HTTP || 8743);
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

async function main() {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><meta charset=utf-8><p id=j>Remote Sensing of Environment</p>');
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
    await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(`http://127.0.0.1:${HTTP_PORT}/`)}`, { method: 'PUT' })).json();
    await sleep(3000);
    const expr = `(async () => {
      const t = (await chrome.tabs.query({})).find((x) => (x.url || '').startsWith('http://127.0.0.1:${HTTP_PORT}'));
      await showInPage(t.id, 'Remote Sensing of Environment');
      const probe = () => {
        const h = document.getElementById('publication-checker-host');
        const c = h && h.shadowRoot && h.shadowRoot.querySelector('.card');
        return c ? { on: c.classList.contains('on'), txt: (c.textContent || '').replace(/\\s+/g, ' ').slice(0, 24), r: (() => { const b = c.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; })() } : null;
      };
      const r = await chrome.scripting.executeScript({ target: { tabId: t.id }, func: async () => {
        const wait = (ms) => new Promise((res) => setTimeout(res, ms));
        const get = () => { const h = document.getElementById('publication-checker-host'); return h && h.shadowRoot ? h.shadowRoot.querySelector('.card') : null; };
        const card = get();
        if (!card) return { err: 'no card' };
        const b = card.getBoundingClientRect();
        const res = { opened: card.classList.contains('on') };
        card.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, clientX: b.left + 20, clientY: b.top + 20 }));
        // 指针移出卡片：给一个矩形外的坐标，避开"贴边不算移出"的角落判定
        card.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false, clientX: b.right + 200, clientY: b.bottom + 200 }));
        await wait(150);
        res.onAt150 = card.classList.contains('on');
        await wait(550);
        res.onAt700 = card.classList.contains('on');
        // 再验证：移开前把指针挪回卡片内，取消关闭
        card.classList.add('on');
        card.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, clientX: b.left + 20, clientY: b.top + 20 }));
        card.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false, clientX: b.right + 200, clientY: b.bottom + 200 }));
        await wait(200);
        card.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, clientX: b.left + 20, clientY: b.top + 20 }));
        await wait(600);
        res.cancelledByReenter = card.classList.contains('on');
        res.card = { l: Math.round(b.left), t: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) };
        return res;
      } });
      return JSON.stringify(r[0] && r[0].result);
    })()`;
    const r = await sw.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    out.hover = JSON.parse(r.result.value);
    out.verdict =
      out.hover && out.hover.opened === true && out.hover.onAt150 === true && out.hover.onAt700 === false && out.hover.cancelledByReenter === true
        ? 'PASS 移开约 300ms 自动关闭，移回可取消'
        : 'FAIL';
  } finally {
    console.log(JSON.stringify(out, null, 2));
    chrome.kill();
    server.close();
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
