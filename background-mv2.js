/* MV2 background page script (360 / older Chromium) */
(function () {
  "use strict";

  var MENU_ID = "publication-checker-lookup";
  var MENU_INPUT_ID = "publication-checker-input";
  var api = typeof browser !== "undefined" && browser.runtime ? browser : chrome;

  function openFallbackPage(query) {
    var url =
      api.runtime.getURL("results.html") +
      "?q=" +
      encodeURIComponent(query || "");
    api.tabs.create({ url: url });
  }

  var menuInFlight = false;

  function ensureMenu() {
    if (menuInFlight) return;
    menuInFlight = true;

    function mk(opts) {
      try {
        api.contextMenus.create(opts, function () {
          void api.runtime.lastError;
        });
      } catch (e) {
        // ignore: duplicate id / race with another create
      }
    }

    api.contextMenus.removeAll(function () {
      void api.runtime.lastError;
      mk({ id: MENU_ID, title: "查询期刊分区：%s", contexts: ["selection"] });
      mk({
        id: MENU_INPUT_ID,
        title: "查询期刊分区（手动输入刊名）",
        contexts: ["page", "image"],
      });
      menuInFlight = false;
    });
  }

  ensureMenu();
  api.runtime.onInstalled.addListener(ensureMenu);
  api.runtime.onStartup.addListener(ensureMenu);

  api.contextMenus.onClicked.addListener(function (info, tab) {
    var isLookup = info.menuItemId === MENU_ID;
    var isInput = info.menuItemId === MENU_INPUT_ID;
    if (!isLookup && !isInput) return;

    var query = isLookup
      ? PublicationChecker.cleanQuery(info.selectionText || "")
      : "";
    if (isLookup && !query) return;

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
        sendResponse({ ok: false, error: String((err && err.message) || err) });
      });
    return true;
  });
})();
