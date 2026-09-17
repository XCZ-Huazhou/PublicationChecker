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

function ensureMenu() {
  api.contextMenus.removeAll(function () {
    api.contextMenus.create({
      id: MENU_ID,
      title: "查询期刊分区：%s",
      contexts: ["selection"],
    });
  });
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
  await injectIfNeeded(tabId);
  return api.tabs.sendMessage(tabId, {
    type: "publication-checker:show",
    query: query,
  });
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
  if (!msg || msg.type !== "publication-checker:lookup") return false;

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
