const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 把刊名里与查询匹配的部分加粗（按查询的每个词，不区分大小写） */
function highlight(name, query) {
  const text = String(name || "");
  const q = String(query || "").trim();
  if (!q) return esc(text);

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
  if (!spans.length) return esc(text);

  // 合并重叠区间，避免嵌套 <b>
  spans.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else merged.push([s[0], s[1]]);
  }

  let out = "";
  let at = 0;
  for (const span of merged) {
    out += esc(text.slice(at, span[0])) + "<b>" + esc(text.slice(span[0], span[1])) + "</b>";
    at = span[1];
  }
  return out + esc(text.slice(at));
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
  if (!zone) return "—";
  return esc(String(zone).replace(/\s+/g, ""));
}

function qText(q) {
  if (!q) return "—";
  return esc(String(q).toUpperCase());
}

function isTopFlag(v) {
  const s = String(v || "").trim();
  return s === "是" || s === "Yes" || s === "YES" || s === "Top";
}

function renderJournal(j, query) {
  const jcr = j.jcr || {};
  const cas = j.cas || {};
  const xr = j.xr || {};
  const best = jcr.best || "";

  const badges = [];
  if (best) badges.push(`<span class="badge ${zoneClass(best)}">JCR ${qText(best)}</span>`);
  if (cas.zone) badges.push(`<span class="badge ${zoneClass(cas.zone)}">中科院 ${zoneText(cas.zone)}</span>`);
  if (xr.zone) badges.push(`<span class="badge ${zoneClass(xr.zone)}">新锐 ${zoneText(xr.zone)}</span>`);
  if (j.warn) badges.push(`<span class="badge warn">预警 ${esc(j.warn)}</span>`);
  if (xr.warn) badges.push(`<span class="badge warn">新锐标记 ${esc(xr.warn)}</span>`);

  const jcrCats = (jcr.cats || [])
    .slice(0, 3)
    .filter((c) => c[0] || c[1])
    .map((c) => `${esc(c[0] || "")} ${qText(c[1])}${c[2] ? " · " + esc(c[2]) : ""}`)
    .join("<br>");
  const casMinors = (cas.minors || [])
    .slice(0, 3)
    .map((m) => `${esc(m[0] || "")} ${zoneText(m[1])}`)
    .join("<br>");
  const xrMinors = (xr.minors || [])
    .slice(0, 3)
    .map((m) => `${esc(m[0] || "")} ${zoneText(m[1])}`)
    .join("<br>");

  const casSub = cas.zone
    ? `${esc(cas.major || "—")}${isTopFlag(cas.top) ? ' <span class="top-tag">Top</span>' : ""}<br>${casMinors || "—"}`
    : jcr.wos && /ESCI|AHCI/i.test(jcr.wos)
      ? `源数据未收录（该刊多为 ${esc(jcr.wos)}）`
      : "源数据未收录于中科院2025升级版";

  return `
    <div class="name">${highlight(j.name, query)}${jcr.if ? `<span class="if-pill">IF <b>${esc(jcr.if)}</b></span>` : ""}</div>
    <div class="meta-line">ISSN ${esc(j.issn || "—")}${j.eissn ? " · E-ISSN " + esc(j.eissn) : ""}${j.cn ? " · " + esc(j.cn) : ""}</div>
    <div class="badges">${badges.join("")}</div>
    <div class="grid">
      <div class="cell">
        <div class="lab">JCR 2025</div>
        <div class="val">${qText(best)}</div>
        <div class="sub">${jcrCats || "—"}</div>
      </div>
      <div class="cell">
        <div class="lab">中科院 2025升级版</div>
        <div class="val">${cas.zone ? zoneText(cas.zone) : "未收录"}</div>
        <div class="sub">${casSub}</div>
      </div>
      <div class="cell">
        <div class="lab">新锐 2026</div>
        <div class="val">${zoneText(xr.zone)}</div>
        <div class="sub">${esc(xr.major || "—")}${isTopFlag(xr.top) ? ' <span class="top-tag">Top</span>' : ""}<br>${xrMinors || "—"}</div>
      </div>
      <div class="cell">
        <div class="lab">收录与出版</div>
        <div class="val">${esc(jcr.wos || "—")}</div>
        <div class="sub">${j.review && /是|Yes/i.test(j.review) ? "综述期刊 · " : ""}${j.lang ? esc(j.lang) + "<br>" : ""}${j.publisher ? esc(j.publisher) : ""}</div>
      </div>
    </div>
  `;
}

function renderHits(hits, total) {
  const top = hits[0];
  // 顶部那条是主结果，不编号；候选列表从「2.」开始
  let html = renderJournal(top.journal, lastQuery);

  const others = hits.slice(1);
  if (others.length) {
    html +=
      '<div class="list"><h3>其他匹配（' + others.length + '）</h3>' +
      others
        .map((h, i) => {
          const j = h.journal;
          const jcr = j.jcr || {};
          const cas = j.cas || {};
          const xr = j.xr || {};
          return `<div class="item" data-idx="${i + 1}"><div class="item-name"><span class="idx">${i + 2}.</span>${highlight(j.name, lastQuery)}</div><div class="item-row">JCR ${qText(jcr.best || "")} · 中科院 ${zoneText(cas.zone || "")} · 新锐 ${zoneText(xr.zone || "")}${jcr.if ? " · IF " + esc(jcr.if) : ""}</div></div>`;
        })
        .join("") +
      "</div>";
  }

  // 还有没显示的：给一个「继续查看」，点一次多取 10 条
  const remaining = (total || hits.length) - hits.length;
  if (remaining > 0) {
    html +=
      '<button id="more" class="more-btn" type="button">继续查看（还有 ' +
      remaining +
      " 条，每次多显示 10 条）</button>";
  }

  $("result").innerHTML = html;
  $("result").hidden = false;
  $("result").querySelectorAll(".item").forEach((el) => {
    el.addEventListener("click", () => {
      const idx = Number(el.dataset.idx);
      const hit = hits[idx];
      if (hit) {
        $("result").innerHTML = renderJournal(hit.journal, lastQuery);
        // 进了详情页：使用提示和「共 N 条」都没用了，收起来腾出高度
        $("tip").hidden = true;
        $("status").hidden = false;
        $("status").textContent =
          "第 " + (idx + 1) + " 条 / 共 " + (total || hits.length) + " 条匹配";
      }
    });
  });

  const more = $("more");
  if (more) more.addEventListener("click", loadMore);
}

let lastQuery = "";
let lastLimit = 8;

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
  $("tip").hidden = false;
  try {
    const res = await PublicationChecker.searchJournals(lastQuery, lastLimit);
    if (!res.hits.length) {
      $("result").hidden = true;
      $("status").textContent = "未找到匹配期刊。可尝试完整英文刊名或 ISSN。";
      return;
    }
    // 同分结果只能按字母序排，所以把命中总数讲清楚，引导继续输入缩小范围
    $("status").hidden = false;
    $("status").textContent =
      res.total > res.hits.length
        ? "共 " +
          res.total +
          " 条匹配，按字母序显示前 " +
          res.hits.length +
          " 条 —— 继续输入可缩小范围"
        : "共 " + res.total + " 条匹配";
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
    // 清空输入：把上一次的结果收起来
    $("status").hidden = true;
    $("result").hidden = true;
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
