/* MV2 background page script (360 / older Chromium) */
(function () {
  "use strict";

  var MENU_ID = "publication-checker-lookup";
  var api = typeof browser !== "undefined" && browser.runtime ? browser : chrome;
  // MV2 的 tabs.executeScript 一次只认一个 file（files 数组是 MV3 的写法）
  var CS_FILES = ["lib/search-core.js", "content.js"];

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
      menuInFlight = false;
    });
  }

  ensureMenu();
  injectExistingTabs();
  api.runtime.onInstalled.addListener(function () {
    ensureMenu();
    injectExistingTabs();
  });
  api.runtime.onStartup.addListener(function () {
    ensureMenu();
    injectExistingTabs();
  });

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
        if (!api.runtime.lastError) return;
        // 页面层没在跑：补注入一次再试
        injectInto(tab.id, function (ok) {
          if (!ok) {
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
      }
    );
  });

  // 按顺序注入核心库和页面层，done(ok) 告诉调用方有没有注入成功
  function injectInto(tabId, done) {
    (function next(i) {
      if (i >= CS_FILES.length) {
        done(true);
        return;
      }
      api.tabs.executeScript(tabId, { file: CS_FILES[i] }, function () {
        if (api.runtime.lastError) {
          done(false);
          return;
        }
        next(i + 1);
      });
    })(0);
  }

  // 与 MV3 版一致：安装/启动时给已打开的标签页补注入页面层
  function injectExistingTabs() {
    if (!api.tabs.executeScript) return;
    api.tabs.query({ url: ["http://*/*", "https://*/*"] }, function (tabs) {
      if (api.runtime.lastError || !tabs) return;
      tabs.forEach(function (t) {
        if (t.id == null) return;
        injectInto(t.id, function () {
          /* 受限页注入不了就算了，右键时还有回退页 */
        });
      });
    });
  }

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
