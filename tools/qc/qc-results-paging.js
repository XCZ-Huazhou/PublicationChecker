'use strict';
// Isolated CFT check for the fallback results page: can the user reach EVERY match,
// and does clicking a candidate leave the query box alone?
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const CFT = 'D:\\Softwares\\DailyWork\\BrowserPlugin\\.tooling\\chrome-win64\\chrome.exe';
const EXT = process.env.PC_EXT || path.resolve(__dirname, '..', '..');
const PROFILE = path.join(__dirname, '.qc-results-profile');
const PORT = Number(process.env.PC_PORT || 9344);
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
  const out = {};
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
    const page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(`chrome-extension://${id}/results.html?q=ecology`)}`, { method: 'PUT' })).json();
    const c = client(await wsConnect(page.webSocketDebuggerUrl));
    await c.send('Runtime.enable');
    await sleep(4000);

    const step = async (label, expr) => {
      const r = await c.send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
      out[label] = r.result.value;
      if (r.exceptionDetails) out[label + '_error'] = (r.exceptionDetails.exception || {}).description;
    };
    const snap = `JSON.stringify({ q: document.getElementById('q').value, status: (document.getElementById('status').textContent||'').trim(), others: document.querySelectorAll('#others .item').length, heading: (document.querySelector('#best h2')||{}).textContent, more: !!document.getElementById('more'), moreText: document.getElementById('more') ? document.getElementById('more').textContent : null, meta: (document.getElementById('meta').textContent || '').trim() })`;

    await step('firstScreen', `return ${snap};`);
    await step('clickMoreTwice', `
      for (let k = 0; k < 2; k++) {
        const b = document.getElementById('more');
        if (!b) break;
        b.click();
        for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 300)); if (document.getElementById('more') || document.querySelectorAll('#others .item').length >= 59) break; }
        await new Promise(r => setTimeout(r, 300));
      }
      return ${snap};`);
    await step('clickMoreAll', `
      for (let k = 0; k < 8; k++) {
        const b = document.getElementById('more');
        if (!b) break;
        b.click();
        for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 300)); if (!document.getElementById('more') || document.getElementById('more').textContent.indexOf('还有 0') >= 0) break; }
        await new Promise(r => setTimeout(r, 250));
      }
      return ${snap};`);
    await step('clickCandidate', `
      const it = document.querySelectorAll('#others .item')[3];
      if (!it) return 'no candidate';
      const name = it.querySelector('.name').textContent;
      it.click();
      await new Promise(r => setTimeout(r, 500));
      const s = JSON.parse(${snap});
      s.clicked = name;
      s.inputUntouched = s.q === 'ecology';
      s.mainIsClicked = String(s.heading || '').indexOf(name) === 0;
      return JSON.stringify(s);`);

    const first = JSON.parse(out.firstScreen || '{}');
    const twice = JSON.parse(out.clickMoreTwice || '{}');
    const all = JSON.parse(out.clickMoreAll || '{}');
    const cand = JSON.parse(out.clickCandidate || '{}');
    out.verdict =
      /^查询「ecology」命中 92 条，已展示 20 条/.test(first.status || '') && first.others === 19 && first.more === true &&
      /^查询「ecology」命中 92 条，已展示 60 条/.test(twice.status || '') && twice.others === 59 &&
      /^查询「ecology」命中 92 条，已展示 92 条/.test(all.status || '') && all.others === 91 && all.more === false &&
      cand.inputUntouched === true && cand.mainIsClicked === true
        ? 'PASS 结果页翻页可看到全部 92 条，点候选不改写查询词'
        : 'FAIL';
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
