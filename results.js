const $ = (id) => document.getElementById(id);
const searchJournals = (q, n) => PublicationChecker.searchJournals(q, n);
const cleanQuery = (q) => PublicationChecker.cleanQuery(q);

function zoneClass(zone) {
  const z = String(zone || "");
  if (z.includes("1") || z === "Q1") return "q1";
  if (z.includes("2") || z === "Q2") return "q2";
  if (z.includes("3") || z === "Q3") return "q3";
  if (z.includes("4") || z === "Q4") return "q4";
  return "";
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function renderBest(hit) {
  const j = hit.journal;
  const jcr = j.jcr || {};
  const cas = j.cas || {};
  const xr = j.xr || {};
  const best = jcr.best || "";
  const badges = [];
  if (jcr.if) badges.push(`<span class="badge if-badge">IF <b>${esc(jcr.if)}</b></span>`);
  if (best) badges.push(`<span class="badge ${zoneClass(best)}">JCR ${qText(best)}</span>`);
  if (cas.zone) badges.push(`<span class="badge ${zoneClass(cas.zone)}">中科院 ${zoneText(cas.zone)}</span>`);
  if (xr.zone) badges.push(`<span class="badge ${zoneClass(xr.zone)}">新锐 ${zoneText(xr.zone)}</span>`);
  if (isTopFlag(cas.top) || isTopFlag(xr.top)) {
    badges.push(`<span class="badge top">Top 期刊</span>`);
  }
  if (j.warn) badges.push(`<span class="badge warn">2025预警：${esc(j.warn)}</span>`);
  if (xr.warn) badges.push(`<span class="badge warn">新锐标记：${esc(xr.warn)}</span>`);

  const jcrCats = (jcr.cats || [])
    .filter((c) => c[0] || c[1])
    .map((c) => `${esc(c[0] || "")} ${qText(c[1])}${c[2] ? " · " + esc(c[2]) : ""}`)
    .join("<br>");

  const casMinors = (cas.minors || [])
    .map((m) => `${esc(m[0] || "")} ${zoneText(m[1])}`)
    .join("<br>");

  const xrMinors = (xr.minors || [])
    .map((m) => `${esc(m[0] || "")} ${zoneText(m[1])}`)
    .join("<br>");

  $("best").innerHTML = `
    <div class="title-row">
      <div>
        <h2>${esc(j.name)}</h2>
        ${j.cn ? `<p class="meta-line">${esc(j.cn)}</p>` : ""}
        <p class="meta-line">
          ISSN ${esc(j.issn || "—")}
          ${j.eissn ? ` · E-ISSN ${esc(j.eissn)}` : ""}
          ${jcr.wos ? ` · ${esc(jcr.wos)}` : ""}
        </p>
        <div class="badges">${badges.join("")}</div>
      </div>
    </div>
    <div class="grid">
      <div class="cell">
        <div class="label">JCR 分区（2025）</div>
        <div class="value">${qText(best)}</div>
        <div class="detail">${jcrCats || "—"}</div>
      </div>
      <div class="cell">
        <div class="label">中科院分区（2025升级版）</div>
        <div class="value">${cas.zone ? zoneText(cas.zone) : "未收录"}</div>
        <div class="detail">
          ${
            cas.zone
              ? `${esc(cas.major || "—")}${cas.top ? ` · Top ${esc(cas.top)}${isTopFlag(cas.top) ? '<span class="top-tag">Top</span>' : ""}` : ""}<br>${casMinors || "—"}`
              : jcr.wos && /ESCI|AHCI/i.test(jcr.wos)
                ? `源数据未收录（该刊多为 ${esc(jcr.wos)}）`
                : "源数据未收录于中科院2025升级版"
          }
        </div>
      </div>
      <div class="cell">
        <div class="label">新锐分区（2026）</div>
        <div class="value">${zoneText(xr.zone)}</div>
        <div class="detail">
          ${esc(xr.major || "—")}${isTopFlag(xr.top) ? '<span class="top-tag">Top</span>' : ""}
          <br>${xrMinors || "—"}
        </div>
      </div>
      <div class="cell">
        <div class="label">收录与出版</div>
        <div class="value">${esc(jcr.wos || "—")}</div>
        <div class="detail">
          ${j.review && /是|Yes/i.test(j.review) ? "综述期刊 · " : ""}${j.lang ? esc(j.lang) : ""}
          ${j.publisher ? `<br>${esc(j.publisher)}` : ""}
          ${j.cn ? `<br>中文名：${esc(j.cn)}` : ""}
        </div>
      </div>
    </div>
  `;
  $("best").hidden = false;
}

function renderOthers(hits) {
  if (!hits.length) {
    $("others").hidden = true;
    return;
  }
  const items = hits
    .map((h, idx) => {
      const j = h.journal;
      const jcr = j.jcr || {};
      const cas = j.cas || {};
      const xr = j.xr || {};
      return `
        <div class="item" data-idx="${idx}">
          <div class="name">${esc(j.name)}</div>
          <div class="row">
            <span>ISSN ${esc(j.issn || "—")}</span>
            <span>JCR ${qText(jcr.best || "")}</span>
            <span>中科院 ${zoneText(cas.zone || "")}</span>
            <span>新锐 ${zoneText(xr.zone || "")}</span>
            ${jcr.if ? `<span>IF ${esc(jcr.if)}</span>` : ""}
          </div>
        </div>
      `;
    })
    .join("");
  $("others").innerHTML = `<h3>其他匹配（${hits.length}）</h3><div class="list">${items}</div>`;
  $("others").hidden = false;
  $("others").querySelectorAll(".item").forEach((el) => {
    el.addEventListener("click", () => {
      const idx = Number(el.dataset.idx);
      const hit = hits[idx];
      if (hit) {
        renderBest(hit);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  });
}

function setStatus(html) {
  const el = $("status");
  if (!html) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;
  el.innerHTML = html;
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

  setStatus(
    `<div class="loading"><span class="spinner"></span>正在本地检索「${esc(q)}」…</div>`
  );
  $("best").hidden = true;
  $("others").hidden = true;

  try {
    const res = await searchJournals(q, 12);
    const meta = res.meta || {};
    $("meta").textContent = meta.count
      ? `本地库：${meta.count} 种期刊 · JCR ${meta.jcr} · 中科院 ${meta.cas} · 新锐 ${meta.xinrui} · 数据源 hitfyd/ShowJCR`
      : "本地库已加载";

    if (!res.hits.length) {
      setStatus(`未找到与「${esc(q)}」匹配的期刊。可尝试完整英文刊名或 ISSN。`);
      return;
    }

    setStatus(`查询「${esc(q)}」命中 ${res.total} 条，展示最相关的 ${res.hits.length} 条。`);
    renderBest(res.hits[0]);
    renderOthers(res.hits.slice(1));
  } catch (err) {
    console.error(err);
    setStatus(`检索失败：${esc(err.message || err)}`);
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
