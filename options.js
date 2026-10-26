/**
 * PublicationChecker 选项页：数据库信息与反馈入口
 *
 * 期刊库随扩展包一起发布（data/ 下的索引 + 数据块 + ISSN 表），
 * 所以更新只走扩展商店：装上新版本，数据自然跟着换。
 * 这里不再提供本地导入或从 GitHub 拉取期刊数据的入口。
 */
"use strict";

const $ = (id) => document.getElementById(id);
const PC = window.PublicationChecker;

// 内置的发布仓库：反馈区与「GitHub 仓库」链接都用它
const GITHUB_REPO = "XCZ-Huazhou/PublicationChecker";

function h(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = String(text);
  return n;
}

function apiObj() {
  return typeof browser !== "undefined" && browser && browser.runtime
    ? browser
    : chrome;
}

/** 当前扩展版本 */
function currentVersion() {
  try {
    return apiObj().runtime.getManifest().version || "";
  } catch (e) {
    return "";
  }
}

/** 把 UA 压成「浏览器 主版本 · 系统」。
 * UA 里 Mozilla/5.0、(KHTML, like Gecko)、Safari/537.36 都是历史遗留的假标识，
 * 只有靠后的 Chrome/xxx、Firefox/xxx 才是真的，且顺序要紧（Edge 的 UA 里也含 Chrome）。
 */
function describeBrowser() {
  const ua = navigator.userAgent || "";
  let name = "";
  let ver = "";
  const tests = [
    [/Edg(?:e|A|iOS)?\/([\d.]+)/, "Edge"],
    [/OPR\/([\d.]+)/, "Opera"],
    [/Zen\/([\d.]+)/, "Zen"],
    [/Firefox\/([\d.]+)/, "Firefox"],
    [/Chrome\/([\d.]+)/, "Chrome"],
    [/Version\/([\d.]+).*Safari/, "Safari"],
  ];
  for (const pair of tests) {
    const m = ua.match(pair[0]);
    if (m) {
      name = pair[1];
      ver = m[1];
      break;
    }
  }
  if (!name) return "未知浏览器";

  let os = "";
  if (/Windows NT 10\.0/.test(ua)) os = "Windows 10/11";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Android/.test(ua)) os = "Android";
  else if (/iPhone|iPad/.test(ua)) os = "iOS";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Linux/.test(ua)) os = "Linux";

  return name + (ver ? " " + ver.split(".")[0] : "") + (os ? " · " + os : "");
}

function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
}

// ---------- 界面小工具 ----------

function setStatus(text, kind) {
  const el = $("status");
  el.hidden = false;
  el.textContent = text;
  el.className = "status" + (kind ? " " + kind : "");
}

function clearStatus() {
  $("status").hidden = true;
}

function renderVersion() {
  const el = $("ext-version");
  if (!el) return;
  const ver = currentVersion();
  el.textContent = ver ? "当前版本： v" + ver : "";
}

// ---------- 当前数据库 ----------

async function refreshInfo() {
  const box = $("db-info");
  try {
    const info = await PC.getDbInfo();
    const isOverride = info.source === "override";
    const years = [
      info.jcr ? "JCR " + info.jcr : "",
      info.cas ? "中科院 " + info.cas : "",
      info.xinrui ? "新锐 " + info.xinrui : "",
    ]
      .filter(Boolean)
      .join(" · ");

    const dl = document.createElement("dl");
    function row(label, value) {
      dl.appendChild(h("dt", null, label));
      const dd = h("dd");
      if (value instanceof Node) dd.appendChild(value);
      else dd.textContent = String(value);
      dl.appendChild(dd);
    }

    row(
      "数据来源",
      isOverride
        ? h("span", "badge-src override", "本地覆盖")
        : h("span", "badge-src", "扩展内置")
    );
    row("期刊条数", info.count);
    row("数据生成", info.builtAt ? fmtTime(info.builtAt) : "—");
    row("分区年度", years || "—");

    if (isOverride) {
      // 旧版本导入的覆盖库会挡住扩展自带的数据，商店更新后也换不掉它，
      // 所以留一个明确的退出口。
      row("导入时间", info.importedAt ? fmtTime(info.importedAt) : "—");
      const btn = h("button", "primary", "改用内置数据");
      btn.type = "button";
      btn.addEventListener("click", () => onResetOverride(btn));
      row("操作", btn);
    }

    box.replaceChildren(dl);
  } catch (err) {
    box.textContent = "读取失败：" + (err.message || err);
  }
}

/** 清掉旧版导入的覆盖库，让所有页面回到扩展内置数据 */
async function onResetOverride(btn) {
  clearStatus();
  btn.disabled = true;
  try {
    await PC.clearOverride();
    const api = apiObj();
    try {
      api.runtime.sendMessage({ type: "publication-checker:db-reload" }, () => {
        void api.runtime.lastError;
      });
    } catch (e) {
      // background 未就绪时下次检索也会自然读到内置库
    }
    await refreshInfo();
    setStatus("已清除本地覆盖库，现在用的是扩展内置数据。", "ok");
  } catch (err) {
    setStatus("清除失败：" + (err.message || err), "error");
  } finally {
    btn.disabled = false;
  }
}

// ---------- 反馈 ----------

/** 预填诊断信息的 GitHub issue 链接 */
function feedbackUrl(info) {
  const repo = GITHUB_REPO || "XCZ-Huazhou/PublicationChecker";
  const ver = currentVersion();
  const body = [
    "### 问题描述",
    "<!-- 请描述你遇到的情况 -->",
    "",
    "### 复现步骤",
    "1. ",
    "",
    "### 期望结果",
    "",
    "",
    "### 诊断信息（自动生成，可直接保留）",
    "- 扩展版本：" + (ver ? "v" + ver : "未知"),
    "- 浏览器：" + describeBrowser(),
    "- 数据来源：" + (info && info.source === "override" ? "本地覆盖" : "扩展内置"),
    "- 期刊条数：" + ((info && info.count) || "未知"),
    "- 数据生成：" + ((info && info.builtAt) || "未知"),
    "- 完整 UA：" + (navigator.userAgent || "未知"),
  ].join("\n");

  return (
    "https://github.com/" +
    repo +
    "/issues/new?labels=bug&title=" +
    encodeURIComponent("[Bug] ") +
    "&body=" +
    encodeURIComponent(body)
  );
}

async function onFeedback() {
  let info = null;
  try {
    info = await PC.getDbInfo();
  } catch (e) {
    // 取不到就少带几项，不影响提 issue
  }
  const url = feedbackUrl(info);
  try {
    apiObj().tabs.create({ url: url });
  } catch (e) {
    window.open(url, "_blank");
  }
}

// ---------- 初始化 ----------

function init() {
  renderVersion();

  const home = $("repo-home");
  if (home && GITHUB_REPO) home.href = "https://github.com/" + GITHUB_REPO;

  $("feedback-btn").addEventListener("click", onFeedback);

  refreshInfo();
}

init();
