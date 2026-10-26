/* PublicationChecker background - classic service worker */
importScripts("lib/search-core.js");

const MENU_ID = "publication-checker-lookup";
const api =
  typeof browser !== "undefined" && browser && browser.runtime
    ? browser
    : chrome;

function openFallbackPage(query) {
  const url =
    api.runtime.getURL("results.html") +
    "?q=" +
    encodeURIComponent(query || "");
  api.tabs.create({ url: url });
}

let menuInFlight = null;

function ensureMenu() {
  if (menuInFlight) return menuInFlight;

  function mk(opts) {
    try {
      api.contextMenus.create(opts, function () {
        void api.runtime.lastError;
      });
    } catch (e) {
      // ignore: duplicate id / race with another create
    }
  }

  menuInFlight = (async function () {
    try {
      await api.contextMenus.removeAll();
    } catch (e) {
      // ignore: nothing to remove
    }
    mk({ id: MENU_ID, title: "查询期刊分区：%s", contexts: ["selection"] });
  })();

  const p = menuInFlight;
  p.finally(function () {
    if (menuInFlight === p) menuInFlight = null;
  });
  return p;
}

async function injectIfNeeded(tabId) {
  if (!api.scripting || !api.scripting.executeScript) return;
  try {
    await api.scripting.executeScript({
      target: { tabId: tabId },
      files: ["content.js"],
    });
  } catch (e) {
    // ignore: already injected or restricted page
  }
}

async function showInPage(tabId, query) {
  const msg = { type: "publication-checker:show", query: query };
  try {
    // content script 在页面加载时就注入了，先直接发消息 —— 省掉每次右键的
    // executeScript（那是一次额外的脚本注入，要几十毫秒）
    return await api.tabs.sendMessage(tabId, msg);
  } catch (e) {
    // 没收到（脚本没跑、页面受限）才补注入一次
    await injectIfNeeded(tabId);
    return api.tabs.sendMessage(tabId, msg);
  }
}

api.runtime.onInstalled.addListener(ensureMenu);
api.runtime.onStartup.addListener(ensureMenu);

api.contextMenus.onClicked.addListener(async function (info, tab) {
  if (info.menuItemId !== MENU_ID) return;

  const query = PublicationChecker.cleanQuery(info.selectionText || "");
  if (!query) return;

  if (!tab || tab.id == null) {
    openFallbackPage(query);
    return;
  }

  try {
    await showInPage(tab.id, query);
  } catch (err) {
    console.warn("[PublicationChecker] content show failed, fallback page", err);
    openFallbackPage(query);
  }
});

api.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
  if (!msg || !msg.type) return false;

  if (msg.type === "publication-checker:db-reload") {
    // 选项页导入了新库：清掉缓存，下次检索就会读到覆盖库
    PublicationChecker.reloadDatabase();
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type !== "publication-checker:lookup") return false;

  PublicationChecker.searchJournals(msg.query, msg.limit || 8)
    .then(function (res) {
      sendResponse({
        ok: true,
        hits: res.hits,
        total: res.total,
        meta: res.meta,
      });
    })
    .catch(function (err) {
      sendResponse({
        ok: false,
        error: String((err && err.message) || err),
      });
    });

  return true;
});
