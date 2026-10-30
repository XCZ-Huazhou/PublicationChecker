const $ = (id) => document.getElementById(id);

let lastQuery = "";
let lastLimit = 8;

function h(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = String(text);
  return n;
}

/** 把若干行文本/节点用 <br> 串起来 */
function lines(parts) {
  const frag = document.createDocumentFragment();
  parts.forEach((p, i) => {
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
    for (const w of q.toLowerCase().split(/\s+/)) {
      if (!w) continue;
      let from = 0;
      for (;;) {
        const i = lower.indexOf(w, from);
        if (i < 0) break;
        spans.push([i, i + w.length]);
        from = i + w.length;
      }
    }
    spans.sort((a, b) => a[0] - b[0]);
    // 合并重叠区间，避免嵌套 <b>
    for (const s of spans) {
      const last = merged[merged.length - 1];
      if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
      else merged.push([s[0], s[1]]);
    }
  }

  if (!merged.length) {
    frag.appendChild(document.createTextNode(text));
    return frag;
  }

  let at = 0;
  for (const span of merged) {
    if (span[0] > at) frag.appendChild(document.createTextNode(text.slice(at, span[0])));
    frag.appendChild(h("b", null, text.slice(span[0], span[1])));
    at = span[1];
  }
  if (at < text.length) frag.appendChild(document.createTextNode(text.slice(at)));
  return frag;
}

function zoneClass(zone) {
  const z = String(zone || "");
  if (z.includes("1") || z === "Q1") return "q1";
  if (z.includes("2") || z === "Q2") return "q2";
  if (z.includes("3") || z === "Q3") return "q3";
  if (z.includes("4") || z === "Q4") return "q4";
  return "";
}

function zoneText(zone) {
  return zone ? String(zone).replace(/\s+/g, "") : "—";
}

function qText(q) {
  return q ? String(q).toUpperCase() : "—";
}

function isTopFlag(v) {
  const s = String(v || "").trim();
  return s === "是" || s === "Yes" || s === "YES" || s === "Top";
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

function renderJournal(j, query) {
  const jcr = j.jcr || {};
  const cas = j.cas || {};
  const xr = j.xr || {};
  const best = jcr.best || "";
  const frag = document.createDocumentFragment();

  const name = h("div", "name");
  name.appendChild(highlightNode(j.name, query));
  if (jcr.if) {
    const pill = h("span", "if-pill", "IF ");
    pill.appendChild(h("b", null, jcr.if));
    name.appendChild(pill);
  }
  frag.appendChild(name);

  frag.appendChild(
    h(
      "div",
      "meta-line",
      "ISSN " +
        (j.issn || "—") +
        (j.eissn ? " · E-ISSN " + j.eissn : "") +
        (j.cn ? " · " + j.cn : "")
    )
  );

  const badges = h("div", "badges");
  if (best) badges.appendChild(h("span", "badge " + zoneClass(best), "JCR " + qText(best)));
  if (cas.zone)
    badges.appendChild(h("span", "badge " + zoneClass(cas.zone), "中科院 " + zoneText(cas.zone)));
  if (xr.zone)
    badges.appendChild(h("span", "badge " + zoneClass(xr.zone), "新锐 " + zoneText(xr.zone)));
  if (j.warn) badges.appendChild(h("span", "badge warn", "预警 " + j.warn));
  if (xr.warn) badges.appendChild(h("span", "badge warn", "新锐标记 " + xr.warn));
  frag.appendChild(badges);

  const jcrCats = (jcr.cats || [])
    .slice(0, 3)
    .filter((c) => c[0] || c[1])
    .map((c) => (c[0] || "") + " " + qText(c[1]) + (c[2] ? " · " + c[2] : ""));
  const casMinors = (cas.minors || [])
    .slice(0, 3)
    .map((m) => (m[0] || "") + " " + zoneText(m[1]));
  const xrMinors = (xr.minors || []).slice(0, 3).map((m) => (m[0] || "") + " " + zoneText(m[1]));

  const casSub = cas.zone
    ? lines([majorLine(cas.major || "—", isTopFlag(cas.top)), casMinors.length ? lines(casMinors) : "—"])
    : jcr.wos && /ESCI|AHCI/i.test(jcr.wos)
      ? "源数据未收录（该刊多为 " + jcr.wos + "）"
      : "源数据未收录于中科院2025升级版";

  const xrSub = lines([majorLine(xr.major || "—", isTopFlag(xr.top)), xrMinors.length ? lines(xrMinors) : "—"]);

  const pubSub = document.createDocumentFragment();
  if (j.review && /是|Yes/i.test(j.review)) pubSub.appendChild(document.createTextNode("综述期刊 · "));
  if (j.lang) {
    pubSub.appendChild(document.createTextNode(j.lang));
    pubSub.appendChild(document.createElement("br"));
  }
  if (j.publisher) pubSub.appendChild(document.createTextNode(j.publisher));

  const grid = h("div", "grid");
  grid.appendChild(zoneCell("JCR 2025", qText(best), jcrCats.length ? lines(jcrCats) : "—"));
  grid.appendChild(zoneCell("中科院 2025升级版", cas.zone ? zoneText(cas.zone) : "未收录", casSub));
  grid.appendChild(zoneCell("新锐 2026", zoneText(xr.zone), xrSub));
  grid.appendChild(zoneCell("收录与出版", jcr.wos || "—", pubSub));
  frag.appendChild(grid);

  return frag;
}

function renderHits(hits, total) {
  paint(hits, total, 0);
}

/**
 * 主卡片 + 常驻的「其他匹配」列表（跟结果页一个样：点候选只换上面的主卡片，
 * 列表不消失，所以想接着看别的直接点下一条，不用来回翻）。
 * activeIdx = 现在摊开在主卡片上的那条，0 表示默认的第一条。
 */
function paint(hits, total, activeIdx) {
  const n = total || hits.length;
  const active = hits[activeIdx] ? activeIdx : 0;
  const q0 = lastQuery; // 用户真正输入的那个词，回填之后还得能复原

  const frag = document.createDocumentFragment();
  frag.appendChild(renderJournal(hits[active].journal, lastQuery));

  if (active > 0) {
    const back = h("button", "link-btn", "← 回到第 1 条（" + q0 + "）");
    back.type = "button";
    back.addEventListener("click", function () {
      $("q").value = q0;
      paint(hits, total, 0);
    });
    frag.appendChild(back);
  }

  const others = hits.slice(1);
  if (others.length) {
    const list = h("div", "list");
    list.appendChild(h("h3", null, "其他匹配（" + others.length + "）"));
    others.forEach((hit, i) => {
      const j = hit.journal;
      const jcr = j.jcr || {};
      const cas = j.cas || {};
      const xr = j.xr || {};
      const idx = i + 1; // 在 hits 里的真实下标（第 0 条在主卡片上）
      const item = h("div", "item" + (idx === active ? " active" : ""));
      item.dataset.idx = String(idx);
      const itemName = h("div", "item-name");
      itemName.appendChild(h("span", "idx", idx + 1 + "."));
      itemName.appendChild(highlightNode(j.name, lastQuery));
      item.appendChild(itemName);
      item.appendChild(
        h(
          "div",
          "item-row",
          "JCR " +
            qText(jcr.best || "") +
            " · 中科院 " +
            zoneText(cas.zone || "") +
            " · 新锐 " +
            zoneText(xr.zone || "") +
            (jcr.if ? " · IF " + jcr.if : "")
        )
      );
      list.appendChild(item);
    });
    frag.appendChild(list);
  }

  // 还有没显示的：给一个「继续查看」，点一次多取 10 条
  const remaining = n - hits.length;
  if (remaining > 0) {
    const more = h("button", "more-btn", "继续查看（还有 " + remaining + " 条，每次多显示 10 条）");
    more.type = "button";
    more.id = "more";
    frag.appendChild(more);
  }

  const box = $("result");
  box.replaceChildren(frag);
  box.hidden = false;
  box.querySelectorAll(".item").forEach((el) => {
    el.addEventListener("click", () => {
      const idx = Number(el.dataset.idx);
      if (!hits[idx]) return;
      // 回填刊名方便接着改；想回原来的词点上面那条「回到第 1 条」
      $("q").value = hits[idx].journal.name;
      paint(hits, total, idx);
    });
  });

  const more = $("more");
  if (more) more.addEventListener("click", loadMore);

  $("status").hidden = false;
  $("status").textContent =
    active > 0
      ? "第 " + (active + 1) + " 条 / 共 " + n + " 条匹配"
      : n > hits.length
        ? "共 " + n + " 条匹配，按字母序显示前 " + hits.length + " 条 —— 继续输入可缩小范围"
        : "共 " + n + " 条匹配";
  // 出结果后收起使用提示：popup 高度有上限，提示会把第一个结果挤到折叠线后面
  $("tip").hidden = true;
}

async function run() {
  const q = $("q").value.trim();
  if (!q) return;
  lastQuery = q;
  lastLimit = 8; // 新的一次查询从 8 条开始
  await render();
}

/** 「继续查看」：一次多取 10 条 */
async function loadMore() {
  if (!lastQuery) return;
  lastLimit += 10;
  await render();
}

async function render() {
  $("status").hidden = false;
  $("status").textContent = "本地检索中…";
  // 出结果后收起使用提示：popup 高度有上限，提示占两行会把第一个结果
  // 挤到折叠线 / 钉底按钮后面，看起来像"第一个结果没显示全"。
  $("tip").hidden = true;
  try {
    const res = await PublicationChecker.searchJournals(lastQuery, lastLimit);
    if (!res.hits.length) {
      $("result").hidden = true;
      $("status").textContent = "未找到匹配期刊。可尝试完整英文刊名或 ISSN。";
      return;
    }
    // 同分结果只能按字母序排，所以把命中总数讲清楚，引导继续输入缩小范围
    renderHits(res.hits, res.total);
  } catch (err) {
    $("result").hidden = true;
    $("status").textContent = "失败：" + (err.message || err);
  }
}

// 边输入边查：本地检索很快，防抖 200ms 就够
let liveTimer = null;

function scheduleLive() {
  clearTimeout(liveTimer);
  const q = $("q").value.trim();
  if (!q) {
    // 清空输入：把上一次的结果收起来，提示重新露出
    $("status").hidden = true;
    $("result").hidden = true;
    $("tip").hidden = false;
    return;
  }
  liveTimer = setTimeout(run, 200);
}

$("go").addEventListener("click", () => {
  clearTimeout(liveTimer);
  run();
});
$("q").addEventListener("input", scheduleLive);
$("q").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    clearTimeout(liveTimer);
    run();
  }
});

$("db").addEventListener("click", () => {
  const api =
    typeof browser !== "undefined" && browser && browser.runtime
      ? browser
      : chrome;
  if (api.runtime.openOptionsPage) {
    api.runtime.openOptionsPage();
  } else {
    api.tabs.create({ url: api.runtime.getURL("options.html") });
  }
  window.close();
});

// 头部标出当前构建时间：浏览器加载的是哪一版，一眼就能看出来
const hintEl = document.querySelector(".hint");
if (hintEl && PublicationChecker.build) hintEl.textContent += " · " + PublicationChecker.build;
