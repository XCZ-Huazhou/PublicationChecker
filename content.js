/**
 * PublicationChecker 页面浮层
 * 仅在用户右键点菜单后显示，选中文字不会自动弹出。
 * 卡片顶部带可编辑搜索框：识别不准可直接改刊名回车重查；
 * 无选中时右键「手动输入刊名」打开空卡片，输入后回车查询。
 */
(function () {
  "use strict";

  if (window.__PublicationCheckerLoaded) return;
  window.__PublicationCheckerLoaded = true;

  const HOST_ID = "publication-checker-host";
  let rootEl = null;
  let cardEl = null;
  let bodyEl = null;
  let inputEl = null;
  let hideTimer = null;
  let lastRect = null;
  let currentHits = [];
  let currentTotal = 0;
  let currentQuery = "";
  let currentLimit = 8; // 向后端要多少条；「继续查看」每次 +10
  let liveTimer = null;
  let lookupSeq = 0;

  const EMPTY_HINT =
    "输入期刊名或 ISSN 后实时匹配；也可在网页选中刊名后右键查询。";

  function api() {
    return typeof browser !== "undefined" && browser && browser.runtime
      ? browser
      : chrome;
  }

  function ensureDom() {
    if (rootEl && cardEl) return;

    let host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = HOST_ID;
      host.setAttribute("data-publication-checker", "1");
      host.style.cssText =
        "position:fixed!important;inset:0!important;width:0!important;height:0!important;z-index:2147483646!important;pointer-events:none!important;";
      (document.body || document.documentElement).appendChild(host);
    }

    if (!host.shadowRoot) {
      host.attachShadow({ mode: "open" });
    }
    const shadow = host.shadowRoot;
    shadow.innerHTML = "";

    const style = document.createElement("style");
    style.textContent = [
      "*{box-sizing:border-box;font-family:'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;}",
      ".wrap{position:fixed;inset:0;pointer-events:none;}",
      ".card{pointer-events:auto;display:none;position:fixed;z-index:2147483647;",
      "width:min(360px,calc(100vw - 20px));max-height:min(70vh,480px);overflow:auto;",
      "background:#fff;color:#111827;border:1px solid #e5e7eb;border-radius:14px;",
      "box-shadow:0 20px 50px rgba(15,23,42,.25);padding:14px;font-size:13px;line-height:1.45;}",
      ".card.on{display:block;}",
      ".searchbar{display:flex;gap:6px;margin-bottom:8px;}",
      ".searchbar input{flex:1;min-width:0;border:1px solid #e5e7eb;border-radius:10px;padding:7px 10px;",
      "font-size:13px;color:#111827;background:#fff;outline:none;}",
      ".searchbar input:focus{border-color:#2d5ac8;}",
      ".searchbar .go{border:0;background:#2d5ac8;color:#fff;border-radius:10px;padding:0 12px;",
      "font-size:13px;font-weight:600;cursor:pointer;flex:none;}",
      ".searchbar .go:hover{background:#244ea8;}",
      ".x{border:0;background:#f3f4f6;color:#6b7280;width:24px;height:24px;border-radius:8px;cursor:pointer;flex:none;}",
      ".x:hover{background:#e5e7eb;color:#111827;}",
      ".head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:6px;}",
      ".title{flex:1;font-weight:700;font-size:14px;word-break:break-word;}",
      ".if-pill{display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;background:#e8eefc;color:#2d5ac8;font-size:11px;font-weight:700;vertical-align:middle;border:1px solid #c7d2fe;}",
      ".if-pill b{font-size:13px;font-weight:800;margin-left:2px;color:#1e3a8a;}",
      ".meta{color:#6b7280;font-size:12px;margin-bottom:8px;word-break:break-all;}",
      ".badges{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;}",
      ".badge{border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700;background:#eef2ff;color:#2d5ac8;}",
      ".badge.q1{background:#d1fae5;color:#0f766e;}.badge.q2{background:#dbeafe;color:#0369a1;}",
      ".badge.q3{background:#fef3c7;color:#b45309;}.badge.q4{background:#f3f4f6;color:#6b7280;}",
      ".badge.warn{background:#fee2e2;color:#b91c1c;}",
      ".grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}",
      ".cell{background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:8px 10px;}",
      ".top-tag{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:999px;background:#c2410c;color:#fff;font-size:10px;font-weight:700;vertical-align:middle;}",
      ".lab{color:#4b5563;font-size:12px;font-weight:700;}.val{font-weight:700;font-size:15px;margin-top:2px;}",
      ".sub{color:#6b7280;font-size:11px;margin-top:2px;word-break:break-word;}",
      ".status{color:#4b5563;}",
      ".list{margin-top:10px;display:flex;flex-direction:column;gap:6px;}",
      ".list-title{color:#6b7280;font-size:11px;margin-bottom:4px;}",
      ".more-btn{display:block;width:100%;margin-top:8px;border:1px dashed #c7d2fe;background:#f8fafc;color:#2d5ac8;border-radius:10px;padding:7px 10px;font-size:12px;font-family:inherit;font-weight:600;cursor:pointer;}",
      ".more-btn:hover{background:#eef2ff;border-color:#2d5ac8;}",
      ".idx{display:inline-block;min-width:17px;margin-right:5px;color:#6b7280;font-weight:700;font-variant-numeric:tabular-nums;}",
      ".title b,.item .n b{color:#2d5ac8;font-weight:800;background:#e8eefc;border-radius:3px;padding:0 1px;}",
      ".item{border:1px solid #e5e7eb;border-radius:10px;padding:8px 10px;cursor:pointer;background:#fff;}",
      ".item:hover{border-color:#c7d2fe;background:#f8fafc;}",
      ".item .n{font-weight:600;}.item .r{color:#6b7280;font-size:11px;margin-top:2px;}",
    ].join("");

    rootEl = document.createElement("div");
    rootEl.className = "wrap";
    cardEl = document.createElement("div");
    cardEl.className = "card";
    cardEl.innerHTML =
      '<div class="searchbar">' +
      '<input class="q" type="search" placeholder="期刊名或 ISSN，改完回车重查" spellcheck="false" />' +
      '<button class="go" type="button">查询</button>' +
      '<button class="x" type="button" title="关闭">×</button>' +
      "</div>" +
      '<div class="body"></div>';
    bodyEl = cardEl.querySelector(".body");
    inputEl = cardEl.querySelector(".q");

    inputEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        submitQuery();
      } else if (e.key === "Escape") {
        e.preventDefault();
        hideCard();
      }
    });
    inputEl.addEventListener("input", scheduleLiveSearch);
    cardEl.querySelector(".go").addEventListener("click", submitQuery);
    cardEl.querySelector(".x").addEventListener("click", hideCard);

    cardEl.addEventListener("mouseenter", function () {
      clearTimeout(hideTimer);
    });
    // 不能直接用 scheduleHide：输入框 type="search" 的原生清除按钮住在
    // UA shadow DOM 里，鼠标经过它时 mouseleave 会被误触发。
    // 所以再用坐标确认一次 —— 鼠标真在卡片外才安排关闭。
    cardEl.addEventListener("mouseleave", function (e) {
      const r = cardEl.getBoundingClientRect();
      if (
        e.clientX >= r.left &&
        e.clientX <= r.right &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom
      ) {
        return;
      }
      scheduleHide();
    });

    shadow.appendChild(style);
    shadow.appendChild(rootEl);
    rootEl.appendChild(cardEl);
  }

  function hideCard() {
    if (!cardEl) return;
    cardEl.classList.remove("on");
    // 让在途检索结果失效并清掉待触发的实时匹配，避免卡片被"幽灵"重开
    lookupSeq += 1;
    clearTimeout(liveTimer);
    if (inputEl) inputEl.blur();
    clearTimeout(hideTimer);
  }

  // 鼠标移开后的宽限时间。太短会打断「划出去选中输入框里的文字准备改」
  // 这类操作；鼠标中途移回来（mouseenter）会取消，所以放宽没有副作用。
  const HIDE_DELAY = 500;

  // 鼠标离开卡片就安排关闭；不看输入框焦点，也不管有没有提交查询
  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideCard, HIDE_DELAY);
  }

  function place(el, rect, gap) {
    gap = gap == null ? 10 : gap;
    el.classList.add("on");
    el.style.visibility = "hidden";
    const w = el.offsetWidth || 300;
    const h = el.offsetHeight || 120;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = rect ? rect.left : Math.max(12, vw / 2 - w / 2);
    let top = rect ? rect.bottom + gap : Math.max(12, vh / 3);
    if (left + w > vw - 10) left = Math.max(10, vw - w - 10);
    if (left < 10) left = 10;
    if (top + h > vh - 10) top = Math.max(10, (rect ? rect.top : vh / 2) - h - gap);
    el.style.left = Math.round(left) + "px";
    el.style.top = Math.round(top) + "px";
    el.style.visibility = "visible";
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** 把刊名里与查询匹配的部分加粗（按查询的每个词，不区分大小写） */
  function highlight(name, query) {
    var text = String(name || "");
    var q = String(query || "").trim();
    if (!q) return esc(text);

    var lower = text.toLowerCase();
    var spans = [];
    var words = q.toLowerCase().split(/\s+/);
    for (var wi = 0; wi < words.length; wi++) {
      var w = words[wi];
      if (!w) continue;
      var from = 0;
      for (;;) {
        var i = lower.indexOf(w, from);
        if (i < 0) break;
        spans.push([i, i + w.length]);
        from = i + w.length;
      }
    }
    if (!spans.length) return esc(text);

    // 合并重叠区间，避免嵌套 <b>
    spans.sort(function (a, b) {
      return a[0] - b[0];
    });
    var merged = [];
    for (var si = 0; si < spans.length; si++) {
      var s = spans[si];
      var last = merged[merged.length - 1];
      if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
      else merged.push([s[0], s[1]]);
    }

    var out = "";
    var at = 0;
    for (var mi = 0; mi < merged.length; mi++) {
      out +=
        esc(text.slice(at, merged[mi][0])) +
        "<b>" +
        esc(text.slice(merged[mi][0], merged[mi][1])) +
        "</b>";
      at = merged[mi][1];
    }
    return out + esc(text.slice(at));
  }

  function isTopFlag(v) {
    const s = String(v || "").trim();
    return s === "是" || s === "Yes" || s === "YES" || s === "Top";
  }

  function zoneCls(z) {
    const s = String(z || "");
    if (s.indexOf("1") >= 0 || s === "Q1") return "q1";
    if (s.indexOf("2") >= 0 || s === "Q2") return "q2";
    if (s.indexOf("3") >= 0 || s === "Q3") return "q3";
    if (s.indexOf("4") >= 0 || s === "Q4") return "q4";
    return "";
  }

  function showStatus(text) {
    ensureDom();
    bodyEl.innerHTML = '<div class="status">' + esc(text) + "</div>";
  }

  function renderHit(hit) {
    const j = hit.journal || {};
    const jcr = j.jcr || {};
    const cas = j.cas || {};
    const xr = j.xr || {};
    const best = jcr.best || "";
    const badges = [];
    if (best)
      badges.push('<span class="badge ' + zoneCls(best) + '">JCR ' + esc(best) + "</span>");
    if (cas.zone)
      badges.push(
        '<span class="badge ' + zoneCls(cas.zone) + '">中科院 ' + esc(cas.zone) + "</span>"
      );
    if (xr.zone)
      badges.push(
        '<span class="badge ' + zoneCls(xr.zone) + '">新锐 ' + esc(xr.zone) + "</span>"
      );
    if (j.warn) badges.push('<span class="badge warn">预警 ' + esc(j.warn) + "</span>");
    if (xr.warn) badges.push('<span class="badge warn">新锐标记 ' + esc(xr.warn) + "</span>");

    const jcrCats = (jcr.cats || [])
      .slice(0, 3)
      .map(function (c) {
        return esc(c[0] || "") + " " + esc(c[1] || "") + (c[2] ? " · " + esc(c[2]) : "");
      })
      .join("<br>");
    const casMinors = (cas.minors || [])
      .slice(0, 3)
      .map(function (m) {
        return esc(m[0] || "") + " " + esc(m[1] || "");
      })
      .join("<br>");
    const xrMinors = (xr.minors || [])
      .slice(0, 3)
      .map(function (m) {
        return esc(m[0] || "") + " " + esc(m[1] || "");
      })
      .join("<br>");

    const otherRows = currentHits
      .map(function (h, i) {
        return { h: h, i: i };
      })
      .filter(function (row) {
        return row.h.journal && row.h.journal.name !== j.name;
      });

    const shown = otherRows;
    const others = shown
      .map(function (row) {
        const jj = row.h.journal;
        return (
          '<div class="item" data-idx="' +
          row.i +
          '"><div class="n">' +
          '<span class="idx">' +
          (row.i + 1) +
          ".</span>" +
          highlight(jj.name, currentQuery) +
          '</div><div class="r">JCR ' +
          esc((jj.jcr && jj.jcr.best) || "—") +
          " · 中科院 " +
          esc((jj.cas && jj.cas.zone) || "未收录") +
          " · 新锐 " +
          esc((jj.xr && jj.xr.zone) || "—") +
          (jj.jcr && jj.jcr.if ? " · IF " + esc(jj.jcr.if) : "") +
          "</div></div>"
        );
      })
      .join("");

    const casIsTop = isTopFlag(cas.top);
    const xrIsTop = isTopFlag(xr.top);

    bodyEl.innerHTML =
      '<div class="head"><div class="title">' +
      highlight(j.name || "未知期刊", currentQuery) +
      "</div></div>" +      '<div class="meta">ISSN ' +
      esc(j.issn || "—") +
      (j.eissn ? " · E-ISSN " + esc(j.eissn) : "") +
      "</div>" +
      '<div class="badges">' +
      badges.join("") +
      "</div>" +
      '<div class="grid">' +
      '<div class="cell"><div class="lab">JCR 2025</div><div class="val">' +
      esc(best || "—") +
      (jcr.if
        ? '<span class="if-pill">IF <b>' + esc(jcr.if) + "</b></span>"
        : "") +
      '</div><div class="sub">' +
      (jcrCats || "—") +
      "</div></div>" +
      '<div class="cell"><div class="lab">中科院 2025升级版</div><div class="val">' +
      esc(cas.zone || "未收录") +
      '</div><div class="sub">' +
      (cas.zone
        ? esc(cas.major || "") +
          (casIsTop ? ' <span class="top-tag">Top</span>' : "") +
          "<br>" +
          (casMinors || "—")
        : (jcr.wos && /ESCI|AHCI|ESCI/i.test(jcr.wos)
            ? "源数据未收录（该刊多为 " + esc(jcr.wos) + "）"
            : "源数据未收录于中科院2025升级版")) +
      "</div></div>" +
      '<div class="cell"><div class="lab">新锐 2026</div><div class="val">' +
      esc(xr.zone || "—") +
      '</div><div class="sub">' +
      esc(xr.major || "") +
      (xrIsTop ? '<span class="top-tag">Top</span>' : "") +
      "<br>" +
      (xrMinors || "—") +
      "</div></div>" +
      '<div class="cell"><div class="lab">收录与出版</div><div class="val">' +
      esc(jcr.wos || "—") +
      '</div><div class="sub">' +
      (j.review && /是|Yes/i.test(j.review) ? "综述期刊 · " : "") +
      (j.lang ? esc(j.lang) + "<br>" : "") +
      (j.publisher ? esc(j.publisher) : "") +
      (j.cn ? (j.publisher ? "<br>" : "") + "中文名：" + esc(j.cn) : "") +
      "</div></div>" +
      "</div>" +
      (others
        ? '<div class="list"><div class="list-title">其他匹配：显示 ' +
          shown.length +
          " / 共 " +
          currentTotal +
          " 条（按字母序，继续输入可缩小范围）</div>" +
          others +
          "</div>"
        : "") +
      (currentTotal > currentHits.length
        ? '<button class="more-btn" type="button">继续查看（还有 ' +
          (currentTotal - currentHits.length) +
          " 条，每次多显示 10 条）</button>"
        : "");

    bodyEl.querySelectorAll(".item").forEach(function (el) {
      el.addEventListener("click", function () {
        const idx = Number(el.getAttribute("data-idx"));
        if (currentHits[idx]) renderHit(currentHits[idx]);
      });
    });

    const moreBtn = bodyEl.querySelector(".more-btn");
    if (moreBtn) moreBtn.addEventListener("click", loadMore);
  }

  /** 「继续查看」：一次多取 10 条 */
  function loadMore() {
    if (!currentQuery) return;
    currentLimit += 10;
    lookup(currentQuery, null, { keepInput: true, quiet: true, more: true });
  }

  function submitQuery() {
    if (!inputEl) return;
    clearTimeout(liveTimer);
    const q = PublicationCheckerQueryClean(inputEl.value);
    if (!q) {
      showStatus("请输入期刊名或 ISSN。");
      return;
    }
    lookup(q, null);
  }

  // 边输入边匹配：防抖 200ms，避免每个按键都跨进程检索
  function scheduleLiveSearch() {
    clearTimeout(liveTimer);
    if (!inputEl) return;
    const raw = inputEl.value;
    if (!raw.trim()) {
      currentHits = [];
      showStatus(EMPTY_HINT);
      return;
    }
    liveTimer = setTimeout(function () {
      const q = PublicationCheckerQueryClean(raw);
      if (q.length < 2) return;
      lookup(q, null, { keepInput: true, quiet: true });
    }, 200);
  }

  /** lib/search-core.js 已随 content script 注入的话，就能在页面里直接查 */
  function localSearch() {
    return typeof PublicationChecker !== "undefined" &&
      PublicationChecker &&
      typeof PublicationChecker.searchJournals === "function"
      ? PublicationChecker
      : null;
  }

  /** 落地检索结果；过期响应直接丢掉 */
  function applyHits(query, seq, res) {
    if (seq !== lookupSeq) return;
    const hits = (res && res.hits) || [];
    if (!hits.length) {
      showStatus(
        "未找到「" + query + "」。可在上方输入框改写刊名，或改用 ISSN 查询。"
      );
      return;
    }
    currentHits = hits;
    currentTotal = (res && res.total) || hits.length;
    renderHit(hits[0]);
    place(cardEl, lastRect, 10);
  }

  function lookup(query, rect, opts) {
    opts = opts || {};
    ensureDom();
    currentQuery = query;
    if (!opts.keepInput && inputEl) inputEl.value = query;
    if (rect) lastRect = rect;
    // 新查询从 8 条起；「继续查看」不清零
    if (!opts.more) currentLimit = 8;
    clearTimeout(hideTimer);
    if (!opts.quiet) showStatus("正在查询「" + query + "」…");
    place(cardEl, lastRect, 10);

    lookupSeq += 1;
    const seq = lookupSeq;

    // 优先在页面里查：库加载一次就常驻（后续查询 ~2ms）。
    // 走 background 的话，MV3 的 service worker 空闲 30 秒就被回收，
    // 每次右键都要重新解压 6MB 的库 —— 那才是卡顿的来源。
    const local = localSearch();
    if (local) {
      local
        .searchJournals(query, currentLimit)
        .then(function (res) {
          applyHits(query, seq, res);
        })
        .catch(function (err) {
          if (seq !== lookupSeq) return;
          showStatus("检索失败：" + ((err && err.message) || err));
        });
      return;
    }

    // 兜底：search-core 没注入时仍走 background
    api().runtime.sendMessage(
      { type: "publication-checker:lookup", query: query, limit: currentLimit },
      function (res) {
        if (seq !== lookupSeq) return;
        if (api().runtime.lastError) {
          showStatus("检索失败：" + api().runtime.lastError.message);
          return;
        }
        if (!res || !res.ok) {
          showStatus((res && res.error) || "查询失败");
          return;
        }
        applyHits(query, seq, res);
      }
    );
  }

  function openCard(rect, query) {
    ensureDom();
    if (rect) lastRect = rect;
    if (query) {
      // 「选中刊名右键查询」只展示结果，不抢输入框焦点，
      // 这样鼠标移开卡片 350ms 后仍会自动关闭；想改刊名点一下输入框即可。
      lookup(query, null);
    } else {
      // 「手动输入刊名」入口：空卡片直接聚焦，输入期间不自动关闭。
      if (inputEl) inputEl.value = "";
      currentHits = [];
      showStatus(EMPTY_HINT);
      place(cardEl, lastRect, 10);
      try {
        inputEl.focus();
      } catch (e) {}
    }
  }

  function selectionBox() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const text = String(sel.toString() || "").trim();
    if (text.length < 2 || text.length > 160) return null;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) return null;
    return { text: text, rect: rect };
  }

  api().runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (!msg || !msg.type) return false;
    if (msg.type === "publication-checker:show") {
      const q = PublicationCheckerQueryClean(msg.query);
      const info = selectionBox();
      // 手动输入模式（无 query）不沿用旧位置，居中弹出
      const rect = info ? info.rect : q ? lastRect : null;
      openCard(rect, q);
      sendResponse({ ok: true });
      return true;
    }
    return false;
  });

  function PublicationCheckerQueryClean(raw) {
    return String(raw || "")
      .trim()
      .replace(/^[\"'“”‘’«»《》\[\(（]+|[\"'“”‘’«»《》\[\)\)）]+$/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
  }

  // 页面空闲时先把库解压好，右键查询那一下就不用等它了
  function warmUp() {
    const local = localSearch();
    if (!local) return;
    local.loadDatabase().catch(function () {});
  }
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(warmUp, { timeout: 4000 });
  } else {
    setTimeout(warmUp, 2500);
  }
})();
