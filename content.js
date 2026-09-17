/**
 * PublicationChecker 页面浮层
 * 仅在用户右键点击「查询期刊分区」后显示，选中文字不会自动弹出。
 */
(function () {
  "use strict";

  if (window.__PublicationCheckerLoaded) return;
  window.__PublicationCheckerLoaded = true;

  const HOST_ID = "publication-checker-host";
  let rootEl = null;
  let cardEl = null;
  let hideTimer = null;
  let lastQuery = "";
  let lastRect = null;

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
      ".head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:6px;}",
      ".title{flex:1;font-weight:700;font-size:14px;word-break:break-word;}",
      ".if-inline{margin-left:8px;font-size:11px;color:#6b7280;font-weight:600;}",
      ".if-inline b{color:#111827;font-size:14px;font-weight:800;}",
      ".x{border:0;background:#f3f4f6;color:#6b7280;width:24px;height:24px;border-radius:8px;cursor:pointer;flex:none;}",
      ".x:hover{background:#e5e7eb;color:#111827;}",
      ".meta{color:#6b7280;font-size:12px;margin-bottom:8px;word-break:break-all;}",
      ".badges{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;}",
      ".badge{border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700;background:#eef2ff;color:#2d5ac8;}",
      ".badge.q1{background:#d1fae5;color:#0f766e;}.badge.q2{background:#dbeafe;color:#0369a1;}",
      ".badge.q3{background:#fef3c7;color:#b45309;}.badge.q4{background:#f3f4f6;color:#6b7280;}",
      ".badge.warn{background:#fee2e2;color:#b91c1c;}",
      ".badge.if-badge{background:#111827;color:#fff;}",
      ".badge.if-badge b{font-size:12px;}",
      ".grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}",
      ".cell{background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:8px 10px;}",
      ".top-tag{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:999px;background:#c2410c;color:#fff;font-size:10px;font-weight:700;vertical-align:middle;}",
      ".lab{color:#6b7280;font-size:11px;}.val{font-weight:700;font-size:15px;margin-top:2px;}",
      ".sub{color:#6b7280;font-size:11px;margin-top:2px;word-break:break-word;}",
      ".status{color:#4b5563;}",
      ".list{margin-top:10px;display:flex;flex-direction:column;gap:6px;}",
      ".item{border:1px solid #e5e7eb;border-radius:10px;padding:8px 10px;cursor:pointer;background:#fff;}",
      ".item:hover{border-color:#c7d2fe;background:#f8fafc;}",
      ".item .n{font-weight:600;}.item .r{color:#6b7280;font-size:11px;margin-top:2px;}",
      ".foot{margin-top:10px;font-size:12px;}.foot a{color:#2d5ac8;}",
    ].join("");

    rootEl = document.createElement("div");
    rootEl.className = "wrap";
    cardEl = document.createElement("div");
    cardEl.className = "card";

    shadow.appendChild(style);
    shadow.appendChild(rootEl);
    rootEl.appendChild(cardEl);

    cardEl.addEventListener("mouseenter", function () {
      clearTimeout(hideTimer);
    });
    cardEl.addEventListener("mouseleave", scheduleHide);
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      if (cardEl) cardEl.classList.remove("on");
    }, 350);
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

  function setCard(html) {
    ensureDom();
    cardEl.innerHTML = html;
    const x = cardEl.querySelector(".x");
    if (x) {
      x.addEventListener("click", function () {
        cardEl.classList.remove("on");
      });
    }
    cardEl.querySelectorAll(".item").forEach(function (el) {
      el.addEventListener("click", function () {
        const idx = Number(el.getAttribute("data-idx"));
        const hits = cardEl.__hits || [];
        if (hits[idx]) renderHit(hits[idx], cardEl.__query);
      });
    });
  }

  function showStatus(text, rect) {
    ensureDom();
    setCard(
      '<div class="head"><div class="title">PublicationChecker</div>' +
        '<button class="x" type="button">×</button></div>' +
        '<div class="status">' +
        esc(text) +
        "</div>"
    );
    place(cardEl, rect || lastRect, 10);
  }

  function renderHit(hit, query) {
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

    const others = (cardEl.__hits || [])
      .map(function (h, i) {
        return { h: h, i: i };
      })
      .filter(function (row) {
        return row.h.journal && row.h.journal.name !== j.name;
      })
      .slice(0, 4)
      .map(function (row) {
        const jj = row.h.journal;
        return (
          '<div class="item" data-idx="' +
          row.i +
          '"><div class="n">' +
          esc(jj.name) +
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

    setCard(
      '<div class="head"><div class="title">' +
        esc(j.name || "未知期刊") +
        '</div><button class="x" type="button">×</button></div>' +
        '<div class="meta">ISSN ' +
        esc(j.issn || "—") +
        (j.eissn ? " · E-ISSN " + esc(j.eissn) : "") +
        "</div>" +
        '<div class="badges">' +
        badges.join("") +
        "</div>" +
        '<div class="grid">' +
        '<div class="cell"><div class="lab">JCR 2025</div><div class="val">' +
        esc(best || "—") +
        '</div><div class="sub">' +
        (jcrCats || "—") +
        (jcr.if
          ? "<br><span class=\"if-inline\">IF <b>" + esc(jcr.if) + "</b></span>"
          : "") +
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
        (others ? '<div class="list">' + others + "</div>" : "")
    );
    place(cardEl, lastRect, 10);
  }

  function lookup(query, rect) {
    ensureDom();
    lastQuery = query;
    if (rect) lastRect = rect;
    clearTimeout(hideTimer);
    showStatus("正在查询「" + query + "」…", lastRect);

    api().runtime.sendMessage(
      { type: "publication-checker:lookup", query: query, limit: 8 },
      function (res) {
        if (api().runtime.lastError) {
          showStatus("检索失败：" + api().runtime.lastError.message, lastRect);
          return;
        }
        if (!res || !res.ok) {
          showStatus((res && res.error) || "查询失败", lastRect);
          return;
        }
        const hits = res.hits || [];
        if (!hits.length) {
          showStatus("未找到「" + query + "」。请尽量选中完整英文期刊名，或用 ISSN 查询。", lastRect);
          return;
        }
        cardEl.__hits = hits;
        cardEl.__query = query;
        renderHit(hits[0], query);
      }
    );
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
      if (!q) {
        sendResponse({ ok: false, error: "空查询" });
        return true;
      }
      // 若当前无选区，用视口中部
      const info = selectionBox();
      const rect = info ? info.rect : lastRect;
      lookup(q, rect);
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
})();
