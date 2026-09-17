/* MV2 background page script (360 / older Chromium) */
(function () {
  "use strict";

  var MENU_ID = "publication-checker-lookup";
  var api = typeof browser !== "undefined" && browser.runtime ? browser : chrome;

  function openFallbackPage(query) {
    var url =
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

  ensureMenu();
  api.runtime.onInstalled.addListener(ensureMenu);

  api.contextMenus.onClicked.addListener(function (info, tab) {
    if (info.menuItemId !== MENU_ID) return;
    var query = PublicationChecker.cleanQuery(info.selectionText || "");
    if (!query) return;

    function fallback() {
      openFallbackPage(query);
    }

    if (!tab || tab.id == null) {
      fallback();
      return;
    }

    api.tabs.sendMessage(
      tab.id,
      { type: "publication-checker:show", query: query },
      function () {
        if (api.runtime.lastError) fallback();
      }
    );
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
        sendResponse({ ok: false, error: String((err && err.message) || err) });
      });
    return true;
  });
})();
