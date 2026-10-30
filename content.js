/**
 * PublicationChecker 页面浮层
 * 仅在用户选中文字后右键点菜单时显示结果，不会自动弹出。
 * 卡片顶部带可编辑搜索框：识别不准可直接改刊名回车重查。
 * 不选中、直接手动搜的入口在工具栏弹窗（popup），不在页面浮层。
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

    // 卡片住在 Shadow DOM 里，keydown 冒泡出影子树时 target 会被重定向成宿主
    // div（而不是 input）。宿主页面的全局快捷键靠「target 是不是输入框」来
    // 判断该不该放行，重定向后它看到的是 div，于是把打字当成快捷键 ——
    // GitHub 的 s / 斜杠 会直接把焦点抢去站内搜索。在卡片这层截停，
    // 页面文档就收不到这些按键。
    cardEl.addEventListener("keydown", function (e) {
      e.stopPropagation();
    });

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
  const HIDE_DELAY = 300;

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

  function h(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }

  /** 把若干行文本/节点用 <br> 串起来 */
  function lines(parts) {
    const frag = document.createDocumentFragment();
    parts.forEach(function (p, i) {
      if (i) frag.appendChild(document.createElement("br"));
      frag.appendChild(typeof p === "string" ? document.createTextNode(p) : p);
    });
    return frag;
  }

  /** 把刊名里与查询匹配的部分加粗（按查询的每个词，不区分大小写） */
  function highlightNode(name, query) {
    const text = String(name || "");
    const q = String(query || "").trim();
    const frag = document.createDocumentFragment();
    const merged = [];

    if (q) {
      const lower = text.toLowerCase();
      const spans = [];
      q.toLowerCase()
        .split(/\s+/)
        .forEach(function (w) {
          if (!w) return;
          let from = 0;
          for (;;) {
            const i = lower.indexOf(w, from);
            if (i < 0) break;
            spans.push([i, i + w.length]);
            from = i + w.length;
          }
        });
      spans.sort(function (a, b) {
        return a[0] - b[0];
      });
      // 合并重叠区间，避免嵌套 <b>
      spans.forEach(function (s) {
        const last = merged[merged.length - 1];
        if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
        else merged.push([s[0], s[1]]);
      });
    }

    if (!merged.length) {
      frag.appendChild(document.createTextNode(text));
      return frag;
    }

    let at = 0;
    merged.forEach(function (span) {
      if (span[0] > at) frag.appendChild(document.createTextNode(text.slice(at, span[0])));
      frag.appendChild(h("b", null, text.slice(span[0], span[1])));
      at = span[1];
    });
    if (at < text.length) frag.appendChild(document.createTextNode(text.slice(at)));
    return frag;
  }

  function zoneCell(lab, valText, sub) {
    const cell = h("div", "cell");
    cell.appendChild(h("div", "lab", lab));
    cell.appendChild(h("div", "val", valText));
    const s = h("div", "sub");
    if (sub instanceof Node) s.appendChild(sub);
    else if (sub != null) s.textContent = String(sub);
    cell.appendChild(s);
    return cell;
  }

  /** 首行「主分类 + 可选 Top 小标」 */
  function majorLine(text, isTop) {
    const frag = document.createDocumentFragment();
    frag.appendChild(document.createTextNode(String(text)));
    if (isTop) {
      frag.appendChild(document.createTextNode(" "));
      frag.appendChild(h("span", "top-tag", "Top"));
    }
    return frag;
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
    bodyEl.replaceChildren(h("div", "status", text));
  }

  function renderHit(hit) {
    const j = hit.journal || {};
    const jcr = j.jcr || {};
    const cas = j.cas || {};
    const xr = j.xr || {};
    const best = jcr.best || "";
    const frag = document.createDocumentFragment();

    const head = h("div", "head");
    const title = h("div", "title");
    title.appendChild(highlightNode(j.name || "未知期刊", currentQuery));
    if (jcr.if) {
      const pill = h("span", "if-pill", "IF ");
      pill.appendChild(h("b", null, jcr.if));
      title.appendChild(pill);
    }
    head.appendChild(title);
    frag.appendChild(head);

    frag.appendChild(
      h("div", "meta", "ISSN " + (j.issn || "—") + (j.eissn ? " · E-ISSN " + j.eissn : ""))
    );

    const badges = h("div", "badges");
    if (best) badges.appendChild(h("span", "badge " + zoneCls(best), "JCR " + best));
    if (cas.zone)
      badges.appendChild(h("span", "badge " + zoneCls(cas.zone), "中科院 " + cas.zone));
    if (xr.zone) badges.appendChild(h("span", "badge " + zoneCls(xr.zone), "新锐 " + xr.zone));
    if (j.warn) badges.appendChild(h("span", "badge warn", "预警 " + j.warn));
    if (xr.warn) badges.appendChild(h("span", "badge warn", "新锐标记 " + xr.warn));
    frag.appendChild(badges);

    const jcrCats = (jcr.cats || []).slice(0, 3).map(function (c) {
      return (c[0] || "") + " " + (c[1] || "") + (c[2] ? " · " + c[2] : "");
    });
    const casMinors = (cas.minors || []).slice(0, 3).map(function (m) {
      return (m[0] || "") + " " + (m[1] || "");
    });
    const xrMinors = (xr.minors || []).slice(0, 3).map(function (m) {
      return (m[0] || "") + " " + (m[1] || "");
    });

    const casSub = cas.zone
      ? lines([
          majorLine(cas.major || "", isTopFlag(cas.top)),
          casMinors.length ? lines(casMinors) : "—",
        ])
      : jcr.wos && /ESCI|AHCI|ESCI/i.test(jcr.wos)
        ? "源数据未收录（该刊多为 " + jcr.wos + "）"
        : "源数据未收录于中科院2025升级版";

    const pubSub = document.createDocumentFragment();
    if (j.review && /是|Yes/i.test(j.review))
      pubSub.appendChild(document.createTextNode("综述期刊 · "));
    if (j.lang) {
      pubSub.appendChild(document.createTextNode(j.lang));
      pubSub.appendChild(document.createElement("br"));
    }
    if (j.publisher) pubSub.appendChild(document.createTextNode(j.publisher));
    if (j.cn) {
      if (j.publisher) pubSub.appendChild(document.createElement("br"));
      pubSub.appendChild(document.createTextNode("中文名：" + j.cn));
    }

    const grid = h("div", "grid");
    grid.appendChild(zoneCell("JCR 2025", best || "—", jcrCats.length ? lines(jcrCats) : "—"));
    grid.appendChild(zoneCell("中科院 2025升级版", cas.zone || "未收录", casSub));
    grid.appendChild(
      zoneCell(
        "新锐 2026",
        xr.zone || "—",
        lines([
          majorLine(xr.major || "", isTopFlag(xr.top)),
          xrMinors.length ? lines(xrMinors) : "—",
        ])
      )
    );
    grid.appendChild(zoneCell("收录与出版", jcr.wos || "—", pubSub));
    frag.appendChild(grid);

    const otherRows = currentHits
      .map(function (row, i) {
        return { row: row, i: i };
      })
      .filter(function (item) {
        return item.row.journal && item.row.journal.name !== j.name;
      });

    if (otherRows.length) {
      const list = h("div", "list");
      list.appendChild(
        h(
          "div",
          "list-title",
          "其他匹配：显示 " +
            otherRows.length +
            " / 共 " +
            currentTotal +
            " 条（按字母序，继续输入可缩小范围）"
        )
      );
      otherRows.forEach(function (item) {
        const jj = item.row.journal;
        const row = h("div", "item");
        row.setAttribute("data-idx", String(item.i));
        const nameEl = h("div", "n");
        nameEl.appendChild(h("span", "idx", item.i + 1 + "."));
        nameEl.appendChild(highlightNode(jj.name, currentQuery));
        row.appendChild(nameEl);
        row.appendChild(
          h(
            "div",
            "r",
            "JCR " +
              ((jj.jcr && jj.jcr.best) || "—") +
              " · 中科院 " +
              ((jj.cas && jj.cas.zone) || "未收录") +
              " · 新锐 " +
              ((jj.xr && jj.xr.zone) || "—") +
              (jj.jcr && jj.jcr.if ? " · IF " + jj.jcr.if : "")
          )
        );
        list.appendChild(row);
      });
      frag.appendChild(list);
    }

    if (currentTotal > currentHits.length) {
      const more = h(
        "button",
        "more-btn",
        "继续查看（还有 " + (currentTotal - currentHits.length) + " 条，每次多显示 10 条）"
      );
      more.type = "button";
      frag.appendChild(more);
    }

    bodyEl.replaceChildren(frag);

    bodyEl.querySelectorAll(".item").forEach(function (el) {
      el.addEventListener("click", function () {
        const idx = Number(el.getAttribute("data-idx"));
        const picked = currentHits[idx];
        if (!picked) return;
        // 选中候选后，把顶部输入框换成这条刊名，方便接着改或核对
        if (inputEl && picked.journal && picked.journal.name)
          inputEl.value = picked.journal.name;
        renderHit(picked);
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
    if (!query) return;
    // 「选中刊名右键查询」只展示结果，不抢输入框焦点，
    // 这样鼠标移开卡片 300ms 后仍会自动关闭；想改刊名点一下输入框即可。
    lookup(query, null);
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

  /**
   * <input> / <textarea> 里的选区不走 document selection，selectionBox() 只会拿到
   * 0×0 的空矩形（搜索框里选中刊名就是这个情况）。这时退到聚焦控件自身的矩形，
   * 浮层至少贴着用户选字的那个框，而不是掉到屏幕中间。
   */
  function focusedFieldBox() {
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) return null;
    const tag = el.tagName;
    const isField =
      tag === "TEXTAREA" ||
      (tag === "INPUT" && /^(text|search|url|email|tel|password)$/i.test(el.type || "")) ||
      el.isContentEditable;
    if (!isField) return null;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return rect;
  }

  api().runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (!msg || !msg.type) return false;
    if (msg.type === "publication-checker:show") {
      const q = PublicationCheckerQueryClean(msg.query);
      const info = selectionBox();
      const rect = info ? info.rect : focusedFieldBox() || lastRect;
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
