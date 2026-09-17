const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function run() {
  const q = $("q").value.trim();
  if (!q) return;
  $("status").hidden = false;
  $("status").textContent = "本地检索中…";
  $("result").hidden = true;
  try {
    const res = await PublicationChecker.searchJournals(q, 5);
    if (!res.hits.length) {
      $("status").textContent = "未找到匹配期刊";
      return;
    }
    $("status").hidden = true;
    const top = res.hits[0];
    const j = top.journal;
    $("result").hidden = false;
    const jj = j.jcr || {};
    const cc = j.cas || {};
    const xx = j.xr || {};
    $("result").innerHTML = `
      <div class="name">${esc(j.name)}</div>
      <div>ISSN ${esc(j.issn || "—")}</div>
      <div>
        <span class="badge">JCR ${esc(jj.best || "—")}</span>
        <span class="badge">中科院 ${esc(cc.zone || "未收录")}</span>
        <span class="badge">新锐 ${esc(xx.zone || "—")}</span>
        ${jj.if ? `<span class="badge">IF ${esc(jj.if)}</span>` : ""}
      </div>
    `;
  } catch (err) {
    $("status").textContent = "失败：" + (err.message || err);
  }
}

$("go").addEventListener("click", run);
$("q").addEventListener("keydown", (e) => {
  if (e.key === "Enter") run();
});
