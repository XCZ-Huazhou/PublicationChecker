const $ = (id) => document.getElementById(id);
const api = typeof browser !== "undefined" && browser?.runtime ? browser : chrome;

function esc(s) {
  return String(s ?? "")
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
    $("result").innerHTML = `
      <div class="name">${esc(j.name)}</div>
      <div>ISSN ${esc(j.issn || "—")}</div>
      <div>
        <span class="badge">JCR ${esc(j.jcr?.best || "—")}</span>
        <span class="badge">中科院 ${esc(j.cas?.zone || "未收录")}</span>
        <span class="badge">新锐 ${esc(j.xr?.zone || "—")}</span>
        ${j.jcr?.if ? `<span class="badge">IF ${esc(j.jcr.if)}</span>` : ""}
      </div>
      <div class="more" id="openFull">打开完整结果页</div>
    `;
    $("openFull").addEventListener("click", () => {
      const url =
        api.runtime.getURL("results.html") + "?q=" + encodeURIComponent(q);
      api.tabs.create({ url });
    });
  } catch (err) {
    $("status").textContent = "失败：" + (err.message || err);
  }
}

$("go").addEventListener("click", run);
$("q").addEventListener("keydown", (e) => {
  if (e.key === "Enter") run();
});
