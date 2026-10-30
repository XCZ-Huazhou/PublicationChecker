const $ = (id) => document.getElementById(id);
const searchJournals = (q, n) => PublicationChecker.searchJournals(q, n);
const cleanQuery = (q) => PublicationChecker.cleanQuery(q);

const PAGE0 = 20; // 首屏条数
const PAGE = 20; // 每次「继续查看」多取的条数
let cur = { q: "", limit: PAGE0, total: 0, hits: [] };

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

function zoneCell(label, valText, detail) {
  const cell = h("div", "cell");
  cell.appendChild(h("div", "label", label));
  cell.appendChild(h("div", "value", valText));
  const d = h("div", "detail");
  if (detail instanceof Node) d.appendChild(detail);
  else if (detail != null) d.textContent = String(detail);
  cell.appendChild(d);
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

function renderBest(hit) {
  const j = hit.journal;
  const jcr = j.jcr || {};
  const cas = j.cas || {};
  const xr = j.xr || {};
  const best = jcr.best || "";
  const frag = document.createDocumentFragment();

  const h2 = h("h2");
  h2.appendChild(document.createTextNode(j.name || "未知期刊"));
  if (jcr.if) {
    const pill = h("span", "if-pill", "IF ");
    pill.appendChild(h("b", null, jcr.if));
    h2.appendChild(pill);
  }

  const titleBox = h("div");
  titleBox.appendChild(h2);
  if (j.cn) titleBox.appendChild(h("p", "meta-line", j.cn));
  titleBox.appendChild(
    h(
      "p",
      "meta-line",
      "ISSN " + (j.issn || "—") + (j.eissn ? " · E-ISSN " + j.eissn : "") + (jcr.wos ? " · " + jcr.wos : "")
    )
  );

  const badges = h("div", "badges");
  if (best) badges.appendChild(h("span", "badge " + zoneClass(best), "JCR " + qText(best)));
  if (cas.zone)
    badges.appendChild(h("span", "badge " + zoneClass(cas.zone), "中科院 " + zoneText(cas.zone)));
  if (xr.zone)
    badges.appendChild(h("span", "badge " + zoneClass(xr.zone), "新锐 " + zoneText(xr.zone)));
  if (isTopFlag(cas.top) || isTopFlag(xr.top))
    badges.appendChild(h("span", "badge top", "Top 期刊"));
  if (j.warn) badges.appendChild(h("span", "badge warn", "2025预警：" + j.warn));
  if (xr.warn) badges.appendChild(h("span", "badge warn", "新锐标记：" + xr.warn));
  titleBox.appendChild(badges);

  const titleRow = h("div", "title-row");
  titleRow.appendChild(titleBox);
  frag.appendChild(titleRow);

  const jcrCats = (jcr.cats || [])
    .filter((c) => c[0] || c[1])
    .map((c) => (c[0] || "") + " " + qText(c[1]) + (c[2] ? " · " + c[2] : ""));
  const casMinors = (cas.minors || []).map((m) => (m[0] || "") + " " + zoneText(m[1]));
  const xrMinors = (xr.minors || []).map((m) => (m[0] || "") + " " + zoneText(m[1]));

  let casDetail;
  if (cas.zone) {
    casDetail = lines([
      majorLine(cas.major || "—", isTopFlag(cas.top)),
      casMinors.length ? lines(casMinors) : "—",
    ]);
  } else if (jcr.wos && /ESCI|AHCI/i.test(jcr.wos)) {
    casDetail = "源数据未收录（该刊多为 " + jcr.wos + "）";
  } else {
    casDetail = "源数据未收录于中科院2025升级版";
  }

  const pubDetail = document.createDocumentFragment();
  if (j.review && /是|Yes/i.test(j.review)) pubDetail.appendChild(document.createTextNode("综述期刊 · "));
  if (j.lang) pubDetail.appendChild(document.createTextNode(j.lang));
  if (j.publisher) {
    pubDetail.appendChild(document.createElement("br"));
    pubDetail.appendChild(document.createTextNode(j.publisher));
  }
  if (j.cn) {
    pubDetail.appendChild(document.createElement("br"));
    pubDetail.appendChild(document.createTextNode("中文名：" + j.cn));
  }

  const grid = h("div", "grid");
  grid.appendChild(zoneCell("JCR 分区（2025）", qText(best), jcrCats.length ? lines(jcrCats) : "—"));
  grid.appendChild(zoneCell("中科院分区（2025升级版）", cas.zone ? zoneText(cas.zone) : "未收录", casDetail));
  grid.appendChild(
    zoneCell(
      "新锐分区（2026）",
      zoneText(xr.zone),
      lines([majorLine(xr.major || "—", isTopFlag(xr.top)), xrMinors.length ? lines(xrMinors) : "—"])
    )
  );
  grid.appendChild(zoneCell("收录与出版", jcr.wos || "—", pubDetail));
  frag.appendChild(grid);

  $("best").replaceChildren(frag);
  $("best").hidden = false;
}

function renderOthers(hits, total) {
  const shown = hits.length + 1; // 主结果那条也算已展示
  if (!hits.length && total <= shown) {
    $("others").hidden = true;
    return;
  }

  const list = h("div", "list");
  hits.forEach((hit, idx) => {
    const j = hit.journal;
    const jcr = j.jcr || {};
    const cas = j.cas || {};
    const xr = j.xr || {};
    const item = h("div", "item");
    item.dataset.idx = String(idx);
    item.appendChild(h("div", "name", j.name));
    const row = h("div", "row");
    row.appendChild(h("span", null, "ISSN " + (j.issn || "—")));
    row.appendChild(h("span", null, "JCR " + qText(jcr.best || "")));
    row.appendChild(h("span", null, "中科院 " + zoneText(cas.zone || "")));
    row.appendChild(h("span", null, "新锐 " + zoneText(xr.zone || "")));
    if (jcr.if) row.appendChild(h("span", null, "IF " + jcr.if));
    item.appendChild(row);
    list.appendChild(item);
  });

  const frag = document.createDocumentFragment();
  frag.appendChild(
    h("h3", null, "其他匹配（" + hits.length + (total > shown ? " / 共 " + total + " 条" : "") + "）")
  );
  frag.appendChild(list);

  // 同分结果只能按字母序排，所以给一个「继续查看」把剩下的翻出来
  const remaining = total - shown;
  if (remaining > 0) {
    const more = h("button", "more-btn", "继续查看（还有 " + remaining + " 条，每次多显示 " + PAGE + " 条）");
    more.type = "button";
    more.id = "more";
    frag.appendChild(more);
  }

  $("others").replaceChildren(frag);
  $("others").hidden = false;
  $("others").querySelectorAll(".item").forEach((el) => {
    el.addEventListener("click", () => {
      const idx = Number(el.dataset.idx);
      const hit = hits[idx];
      if (!hit) return;
      // 只把这条换成主结果：输入框保持用户查的那个词，
      // 否则状态行写着「ecology」而框里是另一串长刊名，回车就搜歪了。
      renderBest(hit);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
  const more = $("more");
  if (more) more.addEventListener("click", showMore);
}

/** status 只显示纯文本；spinner 为真时前面加转圈图标 */
function setStatus(text, spinner) {
  const el = $("status");
  if (!text) {
    el.hidden = true;
    el.replaceChildren();
    return;
  }
  el.hidden = false;
  if (!spinner) {
    el.textContent = text;
    return;
  }
  const wrap = h("div", "loading");
  wrap.appendChild(h("span", "spinner"));
  wrap.appendChild(document.createTextNode(text));
  el.replaceChildren(wrap);
}

async function run(raw) {
  const q = cleanQuery(raw);
  $("q").value = q;
  if (!q) {
    setStatus("请输入期刊名或 ISSN。");
    $("best").hidden = true;
    $("others").hidden = true;
    return;
  }
  cur = { q: q, limit: PAGE0, total: 0, hits: [] };
  await render();
}

/** 「继续查看」：每次多取 PAGE 条（整库 2 万多条，一次全铺会卡住页面） */
async function showMore() {
  if (!cur.q) return;
  cur.limit += PAGE;
  await render();
}

async function render() {
  setStatus("正在本地检索「" + cur.q + "」…", true);
  $("best").hidden = true;
  $("others").hidden = true;

  try {
    const res = await searchJournals(cur.q, cur.limit);
    cur.total = res.total;
    cur.hits = res.hits;
    const meta = res.meta || {};
    $("meta").textContent = meta.count
      ? `本地库：${meta.count} 种期刊 · JCR ${meta.jcr} · 中科院 ${meta.cas} · 新锐 ${meta.xinrui} · 数据源 hitfyd/ShowJCR · 构建 ${PublicationChecker.build}`
      : "本地库已加载";

    if (!res.hits.length) {
      setStatus("未找到与「" + cur.q + "」匹配的期刊。可尝试完整英文刊名或 ISSN。");
      return;
    }

    setStatus(
      "查询「" + cur.q + "」命中 " + res.total + " 条，已展示 " + res.hits.length + " 条。"
    );
    renderBest(res.hits[0]);
    renderOthers(res.hits.slice(1), res.total);
  } catch (err) {
    console.error(err);
    setStatus("检索失败：" + (err.message || err));
  }
}

function boot() {
  const params = new URLSearchParams(location.search);
  const q = params.get("q") || "";
  $("go").addEventListener("click", () => run($("q").value));
  $("q").addEventListener("keydown", (e) => {
    if (e.key === "Enter") run($("q").value);
  });
  run(q);
}

boot();
