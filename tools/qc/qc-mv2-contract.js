'use strict';
// Contract harness for background-mv2.js: Firefox/old-Chromium MV2 API shape.
// tabs.executeScript in MV2 accepts a single `file`, never a `files` array.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const SRC = process.argv[2] || path.resolve(__dirname, "..", "..");
const code = fs.readFileSync(path.join(SRC, 'background-mv2.js'), 'utf8');

function makeApi(opts) {
  const log = [];
  let pendingError = null;
  const api = {
    runtime: {
      get lastError() { return pendingError; },
      getURL: (p) => 'chrome-extension://pc/' + p,
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
      onMessage: { addListener() {} },
    },
    contextMenus: {
      create() {},
      removeAll(cb) { if (cb) cb(); },
      onClicked: { addListener(fn) { api.onClickedHandler = fn; } },
    },
    tabs: {
      create(o) { log.push('create:' + o.url); },
      query(_q, cb) { if (cb) cb([{ id: 11, url: 'https://chatgpt.com/c/abc' }]); },
      executeScript(tabId, details, cb) {
        if (details && details.files) {
          throw new Error('BAD_API: MV2 tabs.executeScript has no files[] — got ' + JSON.stringify(details.files));
        }
        log.push('inject:' + details.file);
        pendingError = opts.injectFails ? { message: 'Cannot access this page' } : null;
        if (cb) cb();
        pendingError = null;
      },
      sendMessage(tabId, msg, cb) {
        const sends = log.filter((l) => l.startsWith('send:')).length;
        log.push('send:' + msg.type);
        const shouldFail = sends === 0 ? opts.firstSendFails : opts.secondSendFails;
        pendingError = shouldFail ? { message: 'Could not establish connection. Receiving end does not exist.' } : null;
        if (cb) cb(shouldFail ? undefined : { ok: true });
        pendingError = null;
      },
    },
  };
  return { api, log };
}

function run(name, opts, expect) {
  const { api, log } = makeApi(opts);
  const sandbox = {
    browser: api,
    PublicationChecker: {
      cleanQuery: (s) => String(s).trim(),
      reloadDatabase() {},
      searchJournals: () => Promise.resolve({ hits: [], total: 0, meta: {} }),
    },
    console: { log() {}, warn() {}, error() {} },
    setTimeout,
    clearTimeout,
  };
  try {
    vm.runInNewContext(code, sandbox, { filename: 'background-mv2.js' });
    const base = log.length; // load-time sweep (ensureMenu + injectExistingTabs)
    sandbox.browser.onClickedHandler(
      { menuItemId: 'publication-checker-lookup', selectionText: '  Nature  ' },
      { id: 11, url: 'https://chatgpt.com/c/abc' }
    );
    const clickLog = log.slice(base);
    const sweepOk = log.slice(0, base).join('|') === 'inject:lib/search-core.js|inject:content.js';
    // 注入失败时 sweep 会在第一个文件就停住，那是预期行为
    const ok = expect(clickLog) && (opts.injectFails || sweepOk);
    console.log((ok ? 'PASS ' : 'FAIL ') + name);
    console.log('  sweep: ' + JSON.stringify(log.slice(0, base)) + '  click: ' + JSON.stringify(clickLog));
    if (!ok) process.exitCode = 1;
  } catch (e) {
    console.log('FAIL ' + name + ' threw: ' + e.message);
    console.log('  log: ' + JSON.stringify(log));
    process.exitCode = 1;
  }
}

run('page listening -> no re-inject, no new tab', { firstSendFails: false }, (l) =>
  l.join('|') === 'send:publication-checker:show' && !l.some((x) => x.startsWith('create:')));

run('orphaned page -> inject both files in order, no new tab', { firstSendFails: true }, (l) =>
  l.join('|') ===
  'send:publication-checker:show|inject:lib/search-core.js|inject:content.js|send:publication-checker:show');

run('restricted page -> falls back to results.html', { firstSendFails: true, injectFails: true }, (l) =>
  l.includes('create:chrome-extension://pc/results.html?q=Nature'));

run('retry still unlistened -> falls back', { firstSendFails: true, secondSendFails: true }, (l) =>
  l.some((x) => x.startsWith('create:')));
