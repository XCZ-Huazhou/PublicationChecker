'use strict';
// Isolated CFT instance: reproduce the popup paging bug —
// "click a match whose name equals the query, then the other matches are gone".
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const CFT = 'D:\\Softwares\\DailyWork\\BrowserPlugin\\.tooling\\chrome-win64\\chrome.exe';
const EXT = process.env.PC_EXT || path.resolve(__dirname, "..", "..");
const PROFILE = path.join(__dirname, '.pc-popup-profile');
const PORT = 9339;
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
  const out = [];
  let c;
  try {
    // discover this instance's extension id: must assert the manifest name,
    // otherwise component-extension service workers get picked by mistake
    let EXT_ID = null;
    for (let i = 0; i < 60 && !EXT_ID; i++) {
      await sleep(500);
      try {
        const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        for (const x of l.filter((y) => y.type === 'service_worker')) {
          const probe = client(await wsConnect(x.webSocketDebuggerUrl));
          try {
            const m = await probe.send('Runtime.evaluate', {
              expression: 'JSON.stringify([chrome.runtime.getManifest().name, chrome.runtime.id])',
              returnByValue: true,
            });
            const [name, id] = JSON.parse(m.result.value || '[]');
            if (name && /PublicationChecker/.test(name)) { EXT_ID = id; break; }
          } catch {}
          probe.ws.close();
        }
      } catch {}
    }
    if (!EXT_ID) throw new Error('extension id not found');
    // wait for the unpacked extension to register before opening its page
    let ready = false;
    for (let i = 0; i < 40 && !ready; i++) {
      await sleep(500);
      try {
        const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        ready = l.some((x) => (x.url || '').includes(EXT_ID) || x.type === 'service_worker');
      } catch {}
    }
    await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(`chrome-extension://${EXT_ID}/popup.html`)}`, { method: 'PUT' })).json();
    let target = null;
    for (let i = 0; i < 40 && !target; i++) {
      await sleep(500);
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((x) => (x.url || '').includes('popup.html'));
      if (p) target = p;
    }
    c = client(await wsConnect(target.webSocketDebuggerUrl));
    await c.send('Runtime.enable');
    await sleep(2500);

    const step = async (label, expr) => {
      const r = await c.send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
      const err = r.exceptionDetails ? (r.exceptionDetails.exception || {}).description || r.exceptionDetails.text : null;
      out.push({ label, value: typeof r.result.value === 'string' ? r.result.value.slice(0, 500) : r.result.value, error: err });
    };

    const state = `JSON.stringify({
      q: document.getElementById('q').value,
      status: (document.getElementById('status').textContent || '').trim(),
      items: [...document.querySelectorAll('#result .item')].map((e) => (e.textContent || '').replace(/\\s+/g, ' ').slice(0, 46)),
      active: document.querySelectorAll('#result .item.active').length,
      head: (document.querySelector('#result') ? (document.querySelector('#result').textContent || '').replace(/\\s+/g, ' ').slice(0, 70) : null),
    })`;

    // 0) sanity: are we on the popup page at all?
    await step('where', `return JSON.stringify({ href: location.href, hasQ: !!document.getElementById('q'), core: typeof PublicationChecker, title: document.title, hint: (document.querySelector('.hint') || {}).textContent })`);

    // 1) type a broad word, then poll until the list renders (first hit decompresses the DB)
    await step('type Environment', `
      const q = document.getElementById('q');
      q.value = 'Environment';
      q.dispatchEvent(new Event('input', { bubbles: true }));
      for (let i = 0; i < 40; i++) { if (document.querySelectorAll('#result .item').length) break; await new Promise(r => setTimeout(r, 500)); }
      await new Promise(r => setTimeout(r, 400));
      return ${state};`);

    // 2) raw search result for the same string
    await step('searchJournals direct', `
      const res = await PublicationChecker.searchJournals('Environment', 8);
      return JSON.stringify({ total: res.total, hits: res.hits.map(h => h.journal.name) });`);

    // 3) click the 2nd match (a long journal name, not the query itself)
    await step('click 2nd item', `
      const items = [...document.querySelectorAll('#result .item')];
      if (!items.length) return 'no items to click';
      items[0].click();
      await new Promise(r => setTimeout(r, 400));
      return ${state};`);

    // 4) press 查询 again (what a user does to get the list back)
    await step('press 查询 again', `
      document.getElementById('go').click();
      for (let i = 0; i < 20; i++) { if (document.querySelectorAll('#result .item').length) break; await new Promise(r => setTimeout(r, 400)); }
      await new Promise(r => setTimeout(r, 400));
      return ${state};`);

    // 5) clean round trip: search the original word, open a detail, come back
    await step('list stays, back restores the original query', `
      const q = document.getElementById('q');
      q.value = 'Environment';
      document.getElementById('go').click();
      // 等状态行真的换成新结果，别拿上一轮的旧列表当已渲染
      for (let i = 0; i < 25; i++) { if (/215 条匹配/.test(document.getElementById('status').textContent)) break; await new Promise(r => setTimeout(r, 400)); }
      const items = [...document.querySelectorAll('#result .item')];
      if (items.length < 2) return JSON.stringify({ err: 'list did not render', list: JSON.parse(${state}) });
      items[1].click();
      await new Promise(r => setTimeout(r, 300));
      const inDetail = JSON.parse(${state});
      const back = [...document.querySelectorAll('#result button')].find((b) => /回到第 1 条/.test(b.textContent));
      if (!back) return JSON.stringify({ err: 'no back link', inDetail });
      back.click();
      await new Promise(r => setTimeout(r, 300));
      const afterBack = JSON.parse(${state});
      const ok = inDetail.items.length === 7 && inDetail.active === 1 &&
        afterBack.q === 'Environment' && afterBack.items.length === 7 && afterBack.active === 0 &&
        /^共 215 条匹配/.test(afterBack.status);
      return JSON.stringify({ inDetailQ: inDetail.q, inDetailItems: inDetail.items.length, inDetailActive: inDetail.active, afterBackQ: afterBack.q, afterBackStatus: afterBack.status, afterBackItems: afterBack.items.length, verdict: ok ? 'PASS 点候选列表常驻，回到第 1 条连搜索词一起复原' : 'FAIL' });`);

    // 5) raw search for whatever the box holds now
    await step('searchJournals after', `
      const res = await PublicationChecker.searchJournals(document.getElementById('q').value, 8);
      return JSON.stringify({ q: document.getElementById('q').value, total: res.total, hits: res.hits.map(h => h.journal.name) });`);
  } finally {
    console.log(JSON.stringify(out, null, 2));
    if (c) c.ws.close();
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
