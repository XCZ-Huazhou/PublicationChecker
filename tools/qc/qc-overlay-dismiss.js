'use strict';
// Isolated CFT check for the far-away overlay bug (DEVELOPMENT.md 后续优化 #1),
// resolution B: keep the normal "pointer leaves -> ~300ms auto-close"; when the
// card lands far from the pointer (selection near viewport edge, pointer never
// enters), it STAYS open and a left-click outside dismisses it.
// Uses REAL CDP Input.dispatchMouseEvent so :hover / mouseenter / mouseleave
// reflect the browser's actual pointer state.
//
// Scenarios:
//   A bottom selection, pointer parked far below the flipped card -> stays open,
//     then a left-click outside closes it
//   B card appears UNDER the parked pointer (normal flow) -> stays open
//   C pointer inside the card then moves out -> ~300ms auto-close (preserved)
//   D pointer leaves then re-enters within grace -> cancels close; leaves again -> closes
//   E tall top selection, pointer on its first line above the card -> stays open,
//     then a left-click outside closes it
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const CFT = 'D:\\Softwares\\DailyWork\\BrowserPlugin\\.tooling\\chrome-win64\\chrome.exe';
const EXT = process.env.PC_EXT || path.resolve(__dirname, '..', '..');
const PROFILE = path.join(__dirname, '.qc-dismiss-profile');
const PORT = Number(process.env.PC_PORT || 9347);
const HTTP_PORT = Number(process.env.PC_HTTP || 8747);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGE = `<!doctype html><meta charset=utf-8><title>dismiss</title>
<style>body{margin:0;font:16px/1.5 sans-serif}</style>
<p id="top" style="position:absolute;top:8px;left:24px;width:220px;margin:0">Remote Sensing<br>of Environment<br>Remote Sensing<br>of Environment</p>
<p id="mid" style="position:absolute;top:360px;left:24px;margin:0">Remote Sensing of Environment</p>
<p id="bot" style="position:absolute;top:740px;left:24px;margin:0">Remote Sensing of Environment</p>`;

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

const STATE = `(() => {
  const h = document.getElementById('publication-checker-host');
  const c = h && h.shadowRoot && h.shadowRoot.querySelector('.card');
  if (!c) return { on: false };
  const b = c.getBoundingClientRect();
  return {
    on: c.classList.contains('on'),
    hover: c.matches(':hover'),
    txt: (c.textContent || '').replace(/\\s+/g, ' ').slice(0, 20),
    r: { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) },
  };
})()`;

async function main() {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(PAGE);
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
    const page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(`http://127.0.0.1:${HTTP_PORT}/`)}`, { method: 'PUT' })).json();
    await sleep(3000);
    const pc = client(await wsConnect(page.webSocketDebuggerUrl));
    await pc.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 800, deviceScaleFactor: 1, mobile: false });

    const tabs = await sw.send('Runtime.evaluate', { expression: 'chrome.tabs.query({})', awaitPromise: true, returnByValue: true });
    const tab = tabs.result.value.find((x) => (x.url || '').startsWith(`http://127.0.0.1:${HTTP_PORT}`));
    if (!tab) throw new Error('tab not found');

    const sel = (id) => pc.send('Runtime.evaluate', {
      expression: `(() => { const el = document.getElementById(${JSON.stringify(id)}); const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); const b = r.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; })()`,
      returnByValue: true,
    }).then((m) => m.result.value);
    const move = (x, y) => pc.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    const click = async (x, y) => {
      await pc.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await pc.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    };
    const show = () => sw.send('Runtime.evaluate', {
      expression: `showInPage(${tab.id}, 'Remote Sensing of Environment')`,
      awaitPromise: true,
      returnByValue: true,
    });
    const state = () => pc.send('Runtime.evaluate', { expression: STATE, returnByValue: true }).then((m) => m.result.value);
    const outside = (s, m) => !(m.x >= s.r.l && m.x <= s.r.r && m.y >= s.r.t && m.y <= s.r.b);

    // A: bottom selection -> card flips above; pointer parked far below, never
    // enters. Must STAY open (no auto-close), then a left-click outside closes it.
    {
      const r = await sel('bot');
      const mx = Math.round(r.l + 30), my = Math.round(r.t + 8);
      await move(mx, my);
      await show();
      await sleep(900);
      const parked = await state();
      await click(mx, my);
      await sleep(80);
      const afterClick = await state();
      out.A_bottomFar = { mouse: { x: mx, y: my }, parked, afterClick };
    }

    // B: card appears under the parked pointer (normal right-click flow) -> stays
    {
      const r = await sel('mid');
      const mx = Math.round(r.l + 30), my = Math.round(r.b + 30);
      await move(mx, my);
      await show();
      await sleep(900);
      const parked = await state();
      out.B_underPointer = { mouse: { x: mx, y: my }, parked };
    }

    // C: pointer inside the card, then moves out -> ~300ms auto-close (preserved)
    {
      const r = await sel('mid');
      const mx = Math.round(r.l + 30), my = Math.round(r.b + 30);
      await move(mx, my);
      await show();
      await sleep(120);
      const inside = await state();
      await move(900, 700); // leave the card
      await sleep(150);
      const at150 = await state();
      await sleep(550);
      const at700 = await state();
      out.C_normalLeave = { inside, at150, at700 };
    }

    // D: leave then re-enter within grace -> cancels; leave again -> closes
    {
      const r = await sel('mid');
      const mx = Math.round(r.l + 30), my = Math.round(r.b + 30);
      await move(mx, my);
      await show();
      await sleep(120);
      const s0 = await state();
      await move(900, 700); // leave -> arms timer
      await sleep(150);
      await move(Math.round((s0.r.l + s0.r.r) / 2), Math.round((s0.r.t + s0.r.b) / 2)); // re-enter
      await sleep(600);
      const reentered = await state();
      await move(900, 700); // leave again
      await sleep(700);
      const leftAgain = await state();
      out.D_reenterCancel = { atShow: s0, reentered, leftAgain };
    }

    // E: tall top selection, pointer on first line (above the card) -> stays,
    // then a left-click outside closes it.
    {
      const r = await sel('top');
      const mx = Math.round(r.l + 30), my = Math.round(r.t + 6);
      await move(mx, my);
      await show();
      await sleep(900);
      const parked = await state();
      await click(mx, my);
      await sleep(80);
      const afterClick = await state();
      out.E_topFar = { mouse: { x: mx, y: my }, parked, afterClick };
    }

    // F: card lands far (pointer outside, never entered) -> pointer moves IN,
    // then OUT -> normal ~300ms auto-close must engage (user rule 2).
    {
      const r = await sel('bot');
      const mx = Math.round(r.l + 30), my = Math.round(r.t + 8);
      await move(mx, my);
      await show();
      await sleep(500);
      const parked = await state(); // far, never entered -> still on
      await move(Math.round((parked.r.l + parked.r.r) / 2), Math.round((parked.r.t + parked.r.b) / 2)); // enter
      await sleep(150);
      const entered = await state();
      await move(mx, my); // leave again
      await sleep(150);
      const at150 = await state();
      await sleep(550);
      const at700 = await state();
      out.F_farEnterLeave = { parked, entered, at150, at700 };
    }

    const A = out.A_bottomFar, B = out.B_underPointer, C = out.C_normalLeave, D = out.D_reenterCancel, E = out.E_topFar, F = out.F_farEnterLeave;
    const checks = {
      A_farStays: A.parked.on === true && outside(A.parked, A.mouse),
      A_clickCloses: A.afterClick.on === false,
      B_staysOpen: B.parked.on === true && B.parked.hover === true,
      C_autoClose: C.inside.on === true && C.at150.on === true && C.at700.on === false,
      D_enterCancels: D.reentered.on === true,
      D_leaveCloses: D.leftAgain.on === false,
      E_farStays: E.parked.on === true && outside(E.parked, E.mouse),
      E_clickCloses: E.afterClick.on === false,
      F_parkedStays: F.parked.on === true,
      F_enterThenLeaveAutoCloses: F.entered.on === true && F.entered.hover === true && F.at150.on === true && F.at700.on === false,
    };
    out.checks = checks;
    out.verdict = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';
    pc.ws.close();
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