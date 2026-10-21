/**
 * PublicationChecker 选项页：期刊数据库更新
 *
 * 运行时库由三部分组成（见 tools/build_db.py）：
 *   索引 data/journals.idx.json.gz、数据块 data/chunks/NNN.json.gz、ISSN 表 data/journals.issn.json.gz
 *
 * 两条取数路径（按浏览器能力分流）：
 *   - Chromium：showDirectoryPicker 选解压后的扩展文件夹，整包读出来
 *   - Firefox ：<input type="file"> 选 .xpi（zip），自己从包里解出来
 * 另外支持从 GitHub Release 拉取同样的包。
 *
 * 校验通过后写进 IndexedDB（见 lib/search-core.js 的 importDatabase），
 * 覆盖库与内置库形态一致，扩展自身的页面检索时优先用它
 * （网页里右键弹出的浮层仍用内置库，原因见 README「更新期刊库」）。
 */
"use strict";

const $ = (id) => document.getElementById(id);
const PC = window.PublicationChecker;

const REPO_KEY = "pcGithubRepo";
// 运行时库是「索引 + 数据块 + ISSN」三部分（build_db.py 产出）：
// 索引在小文件里，完整行按 data/chunks/NNN.json.gz 分块，导入时整包搬运。
const IDX_PATH = "data/journals.idx.json.gz";
const ISSN_PATH = "data/journals.issn.json.gz";
const CHUNK_RE = /^data\/chunks\/\d+\.json\.gz$/;
const HAS_DIR_PICKER = typeof window.showDirectoryPicker === "function";

// 内置的发布仓库：填成 "owner/repo" 后，选项页不再要求用户手填
const GITHUB_REPO = "XCZ-Huazhou/PublicationChecker";

// Release 资产按浏览器分流：Firefox / Zen 用 .xpi，Chromium 系用 .zip
const ASSET_RULES = {
  firefox: { label: "Firefox / Zen", re: /\.xpi$/i },
  chrome: { label: "Chrome / Edge", re: /\.zip$/i },
};

/** 当前浏览器类型：两个平台发布的扩展包格式不同 */
function browserKind() {
  const ua = navigator.userAgent || "";
  return /Firefox\/|Zen\//i.test(ua) ? "firefox" : "chrome";
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

/** 当前扩展版本，用于和远端 Release 对比 */
function currentVersion() {
  try {
    return apiObj().runtime.getManifest().version || "";
  } catch (e) {
    return "";
  }
}

/** 从 v1.2.3 / 1.2.3 里取出三段数字；取不到返回 null */
function parseVersion(s) {
  const m = String(s || "").match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** a 相对 b：更新返回 1，相同返回 0，更旧返回 -1；任一方解析不出就当相同 */
function versionCmp(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}

function apiObj() {
  return typeof browser !== "undefined" && browser && browser.runtime
    ? browser
    : chrome;
}

// ---------- 设置读写（storage.local，MV3 与旧 Chromium 都要能用）----------

function storageGet(key) {
  const api = apiObj();
  try {
    const p = api.storage.local.get(key);
    if (p && typeof p.then === "function") {
      return p.then(
        (obj) => (obj ? obj[key] : undefined),
        () => undefined
      );
    }
  } catch (e) {
    // 落到回调写法
  }
  return new Promise((resolve) => {
    try {
      api.storage.local.get(key, (obj) => {
        void api.runtime.lastError;
        resolve(obj ? obj[key] : undefined);
      });
    } catch (e) {
      resolve(undefined);
    }
  });
}

function storageSet(key, val) {
  const api = apiObj();
  try {
    const p = api.storage.local.set({ [key]: val });
    if (p && typeof p.then === "function") {
      return p.then(
        () => undefined,
        () => undefined
      );
    }
  } catch (e) {
    // 落到回调写法
  }
  return new Promise((resolve) => {
    try {
      api.storage.local.set({ [key]: val }, () => {
        void api.runtime.lastError;
        resolve();
      });
    } catch (e) {
      resolve();
    }
  });
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

function busy(on) {
  ["local-btn", "github-btn"].forEach((id) => {
    $(id).disabled = on;
  });
}

function fmtSize(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / 1024 / 1024).toFixed(2) + " MB";
}

function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
}

// ---------- 当前数据库 ----------

/** 扩展版本号显示在页头右侧 */
function renderVersion() {
  const el = $("ext-version");
  if (!el) return;
  const ver = currentVersion();
  el.textContent = ver ? "v" + ver : "";
}

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

    const rows = [
      [
        "数据来源",
        isOverride
          ? '<span class="badge-src override">本地覆盖</span>'
          : '<span class="badge-src">扩展内置</span>',
      ],
      ["期刊条数", String(info.count)],
      ["数据生成", info.builtAt ? fmtTime(info.builtAt) : "—"],
      ["分区年度", years || "—"],
    ];
    if (isOverride) {
      rows.push(["导入方式", info.origin === "github" ? "GitHub" : "本地文件"]);
      rows.push(["导入时间", fmtTime(info.importedAt)]);
    }
    box.innerHTML =
      "<dl>" +
      rows.map(([k, v]) => "<dt>" + k + "</dt><dd>" + v + "</dd>").join("") +
      "</dl>";
  } catch (err) {
    box.textContent = "读取失败：" + (err.message || err);
  }
}

/** background 有自己的 cachePromise，导入后要通知它失效 */
function notifyReload() {
  const api = apiObj();
  try {
    api.runtime.sendMessage({ type: "publication-checker:db-reload" }, () => {
      void api.runtime.lastError;
    });
  } catch (e) {
    // 忽略：background 未就绪时，下次检索会自然读到新库
  }
}

async function applyInput(input, source) {
  const out = await PC.importDatabase(input, source);
  notifyReload();
  await refreshInfo();
  return out;
}

// ---------- 本地：Chromium 选文件夹 ----------

/** 从「解压后的扩展文件夹」读整套运行时库（索引 + 数据块 + ISSN） */
async function readBundleFromDirectory(dir) {
  let dataDir = dir;
  try {
    dataDir = await dir.getDirectoryHandle("data");
  } catch (e) {
    // 用户直接把 data/ 这一层选进来了
  }

  let idxFile = null;
  try {
    idxFile = await (await dataDir.getFileHandle("journals.idx.json.gz")).getFile();
  } catch (e) {
    idxFile = null;
  }
  if (!idxFile) throw new Error("该文件夹里没有 " + IDX_PATH);

  let issnBytes = null;
  try {
    issnBytes = await (
      await (await dataDir.getFileHandle("journals.issn.json.gz")).getFile()
    ).arrayBuffer();
  } catch (e) {
    issnBytes = null; // 没有 ISSN 表也能用，只是 ISSN 查询退化
  }

  const chunksDir = await dataDir.getDirectoryHandle("chunks");
  const names = [];
  for await (const entry of chunksDir.values()) {
    if (entry.kind === "file" && /\.json\.gz$/i.test(entry.name)) names.push(entry.name);
  }
  names.sort();
  if (!names.length) throw new Error("这个文件夹里没有 data/chunks/*.json.gz");

  const chunks = [];
  for (const name of names) {
    const f = await (await chunksDir.getFileHandle(name)).getFile();
    chunks.push(await f.arrayBuffer());
  }

  return { idxBytes: await idxFile.arrayBuffer(), chunks: chunks, issnBytes: issnBytes };
}

/** 从 zip / xpi 包里读整套运行时库（Firefox 本地选择与 GitHub 更新都走这里） */
async function readBundleFromZip(buf) {
  const names = PCZipRead.listEntries(buf);
  if (names.indexOf(IDX_PATH) < 0) {
    throw new Error("这个包里没有 " + IDX_PATH + "（多半是旧版包，装上新版扩展再试）");
  }
  const idxBytes = await PCZipRead.readEntry(buf, IDX_PATH);

  const chunkNames = names.filter(function (n) {
    return CHUNK_RE.test(n);
  });
  chunkNames.sort();
  if (!chunkNames.length) throw new Error("这个包里没有 data/chunks/*.json.gz");

  const chunks = [];
  for (const n of chunkNames) chunks.push(await PCZipRead.readEntry(buf, n));

  let issnBytes = null;
  if (names.indexOf(ISSN_PATH) >= 0) issnBytes = await PCZipRead.readEntry(buf, ISSN_PATH);

  return { idxBytes: idxBytes, chunks: chunks, issnBytes: issnBytes };
}

// ---------- 本地：Firefox 选 xpi ----------

function pickFromFileInput() {
  return new Promise((resolve, reject) => {
    const input = $("local-file");
    input.value = "";
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) {
        reject(new Error("没有选择文件"));
        return;
      }
      resolve(file);
    };
    input.click();
  });
}

// zip 读取见 lib/zip-read.js（PCZipRead）—— 抽出去是为了能用真实 xpi 单独测

// ---------- 两个动作 ----------

async function onLocal() {
  clearStatus();
  busy(true);
  try {
    let input;
    let label;

    if (HAS_DIR_PICKER) {
      const dir = await window.showDirectoryPicker({ mode: "read" });
      label = "所选文件夹";
      setStatus("正在读取文件夹里的索引与数据块…");
      input = await readBundleFromDirectory(dir);
      label += "（" + input.chunks.length + " 个数据块）";
    } else {
      const file = await pickFromFileInput();
      label = file.name;
      setStatus("正在读取 " + file.name + "（" + fmtSize(file.size) + "）…");
      const buf = await file.arrayBuffer();
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".xpi") || lower.endsWith(".zip")) {
        setStatus("正在从 " + file.name + " 里解出索引与数据块…");
        input = await readBundleFromZip(buf);
      } else {
        // 兼容：直接给一份旧格式（含 rows）的完整数据文件
        input = buf;
      }
    }

    setStatus("正在校验并写入…");
    const out = await applyInput(input, "local");
    setStatus(
      "更新成功：" +
        label +
        "，共 " +
        out.count +
        " 条，数据生成于 " +
        (out.builtAt ? fmtTime(out.builtAt) : "未知") +
        "。",
      "ok"
    );
  } catch (err) {
    if (err && err.name === "AbortError") setStatus("已取消。");
    else setStatus("更新失败：" + (err.message || err), "error");
  } finally {
    busy(false);
  }
}

/** GitHub REST：拿最新 Release（含 tag 与资产清单） */
async function fetchLatestRelease(repo) {
  const res = await fetch(
    "https://api.github.com/repos/" + repo + "/releases/latest",
    { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" }
  );
  if (!res.ok) {
    // GitHub 会在响应体里写明原因（限流、滥用检测…），原样带出来，别自己猜
    let detail = "";
    try {
      const text = await res.text();
      const m = text.match(/"message"\s*:\s*"([^"]+)"/);
      detail = m ? m[1] : text.slice(0, 140);
    } catch (e) {
      // 读不出就算了
    }
    throw new Error("GitHub API HTTP " + res.status + (detail ? "：" + detail : ""));
  }
  return await res.json();
}

/** 按当前浏览器挑对应的 Release 资产 */
function pickAsset(assets, kind) {
  const rule = ASSET_RULES[kind];
  return (assets || []).find((a) => rule.re.test(a.name || "")) || null;
}

/**
 * 不走 API 的退路：/releases/latest 会 302 到 /releases/tag/<tag>，
 * 跟着重定向看最终 URL 就能拿到版本号 —— 不消耗 API 配额，也不受限流影响。
 */
async function latestTagViaRedirect(repo) {
  const res = await fetch("https://github.com/" + repo + "/releases/latest", {
    redirect: "follow",
    cache: "no-store",
  });
  if (!res.ok) throw new Error("打不开发布页（HTTP " + res.status + "）");
  const m = String(res.url).match(/\/releases\/tag\/([^/?#]+)/);
  if (!m) throw new Error("没能从发布页读出 tag");
  return decodeURIComponent(m[1]);
}

/**
 * Release 资产固定用这一个名字，不带版本号。
 * 下载地址是 /releases/latest/download/<名字> —— 里面的 latest 由 GitHub 解析成
 * 最新 Release，所以每次发版覆盖上传同一个名字即可，代码不用跟着版本号变。
 * 名字对不上时会退回 API 问真实文件名（那次会消耗配额）。
 */
function assetCandidates(kind) {
  const base =
    kind === "firefox" ? "PublicationChecker-firefox" : "PublicationChecker-chrome";
  const ext = kind === "firefox" ? ".xpi" : ".zip";
  return [base + ext];
}

/** 从 latest Release 里按名字取资产；没有、或网络抖动，都返回 null 交给下一个候选名 */
async function downloadAsset(repo, name) {
  try {
    const res = await fetch(
      "https://github.com/" +
        repo +
        "/releases/latest/download/" +
        encodeURIComponent(name),
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return { buf: buf, name: name, size: buf.byteLength };
  } catch (e) {
    // 超时 / 连接重置也当成这个候选名不可用，继续试下一个
    return null;
  }
}

function hideAsk() {
  const box = $("github-ask");
  if (!box) return;
  box.hidden = true;
  box.innerHTML = "";
}

/**
 * 在 GitHub 卡片里渲染内联确认区，等用户点按钮；返回 Promise<boolean>。
 * warn 为真时（远端 Release 比当前扩展更旧）整块和「判断」那行标警告色，
 * 主按钮也从「确认更新」改成「仍要更新」—— 免得用户没细看就点了。
 */
function askInline(rows, warn) {
  return new Promise((resolve) => {
    const box = $("github-ask");
    box.className = "ask" + (warn ? " ask-warn" : "");
    box.innerHTML =
      '<dl class="ask-info">' +
      rows
        .map(([k, v, w]) => {
          const cls = w ? ' class="warn"' : "";
          return "<dt" + cls + ">" + k + "</dt><dd" + cls + ">" + v + "</dd>";
        })
        .join("") +
      "</dl>" +
      '<div class="ask-actions">' +
      '<button type="button" class="primary" id="ask-yes">' +
      (warn ? "仍要更新" : "确认更新") +
      "</button>" +
      '<button type="button" id="ask-no">取消</button>' +
      "</div>";
    box.hidden = false;
    $("ask-yes").addEventListener("click", () => {
      hideAsk();
      resolve(true);
    });
    $("ask-no").addEventListener("click", () => {
      hideAsk();
      resolve(false);
    });
  });
}

async function onGithub() {
  clearStatus();
  hideAsk();

  const repo =
    GITHUB_REPO ||
    $("repo")
      .value.trim()
      .replace(/^https?:\/\/github\.com\//i, "")
      .replace(/\.git$/i, "")
      .replace(/\/+$/, "");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    setStatus(
      "还没内置发布仓库，请填 owner/repo（或直接在 options.js 里设置 GITHUB_REPO）。",
      "error"
    );
    return;
  }

  const kind = browserKind();
  const rule = ASSET_RULES[kind];

  busy(true);
  try {
    // 首选不碰 API 的路径：github.com 的发布页没有 60 次/小时那套配额限制，
    // 多人共用出口 IP 也不会撞。API 只作兜底。
    let tag = "";
    let knownAsset = null;
    let note = "";

    try {
      tag = await latestTagViaRedirect(repo);
    } catch (e) {
      note = "发布页读不到（" + e.message + "）";
    }

    if (!tag) {
      // 两条路都不通时，两边的原因都要报出来 —— 只报后一条会让人误以为是后一条的问题
      let rel = null;
      try {
        rel = await fetchLatestRelease(repo);
      } catch (e2) {
        note += (note ? "；" : "") + "GitHub API 也不可用（" + e2.message + "）";
      }
      if (rel) {
        tag = rel.tag_name || rel.name || "";
        knownAsset = pickAsset(rel.assets, kind);
      }
    }

    // 拿不到版本号也别把路堵死：下载地址里的 latest 由 GitHub 自己解析，
    // 本来就不需要先知道版本号；版本号可以下载后从包内的 manifest.json 读。
    const cur = currentVersion();
    const cmp = tag ? versionCmp(tag, cur) : 0;
    const verdict =
      cmp > 0
        ? "→ 发现新版本"
        : cmp === 0
          ? "→ 版本与当前相同，可能只是数据有更新"
          : "⚠ 这个 Release 比当前扩展版本更旧";

    const names = assetCandidates(kind);
    const rows = [];
    if (tag) {
      rows.push(["检测到版本", esc(tag) + "（" + rule.label + "）"]);
      rows.push(["当前扩展版本", cur ? "v" + cur : "未知"]);
      // 第三项是「这一行要不要标警告」
      rows.push(["判断", verdict.replace(/^[→⚠]\s*/, ""), cmp < 0]);
    } else {
      rows.push(["状态", "拿不到版本号，无法先告诉你要更新到哪一版"]);
      rows.push(["原因", esc(note || "发布页与 GitHub API 都不通")]);
    }
    rows.push([
      "资产",
      knownAsset
        ? esc(knownAsset.name) + "（" + fmtSize(knownAsset.size || 0) + "）"
        : names.join(" 或 "),
    ]);
    if (tag && note) rows.push(["说明", esc(note)]);
    rows.push([
      "操作",
      tag
        ? "把期刊库更新到 " + esc(tag)
        : "直接下载最新包，版本号下载后从包内 manifest.json 读",
    ]);

    const ok = await askInline(rows, cmp < 0);
    if (!ok) {
      // 用户主动取消：什么都不提示，卡片恢复原样
      clearStatus();
      return;
    }

    let buf = null;
    if (knownAsset) {
      setStatus("正在下载 " + knownAsset.name + " …");
      const res = await fetch(knownAsset.browser_download_url, { cache: "no-store" });
      if (!res.ok) throw new Error("下载失败 HTTP " + res.status);
      buf = await res.arrayBuffer();
    } else {
      // 按命名约定逐个试，命中就完事，完全不消耗 API 配额
      for (const name of names) {
        setStatus("正在尝试下载 " + name + " …");
        const got = await downloadAsset(repo, name);
        if (got) {
          buf = got.buf;
          break;
        }
      }
      // 命名约定都没命中，才调 API 问准确的文件名
      if (!buf) {
        const rel = await fetchLatestRelease(repo);
        const a = pickAsset(rel.assets, kind);
        if (!a) {
          throw new Error(
            "Release 里没有 " + rule.label + " 的包（需要匹配 " + String(rule.re) + "）"
          );
        }
        setStatus("正在下载 " + a.name + " …");
        const res = await fetch(a.browser_download_url, { cache: "no-store" });
        if (!res.ok) throw new Error("下载失败 HTTP " + res.status);
        buf = await res.arrayBuffer();
      }
    }

    setStatus("已下载 " + fmtSize(buf.byteLength) + "，正在解出索引与数据块…");
    const bundle = await readBundleFromZip(buf);

    // 走「直接下载」那条路时没有 tag，就从包内的 manifest.json 读真实版本号
    if (!tag) {
      try {
        const mTxt = await PCZipRead.readEntry(buf, "manifest.json");
        const mv = JSON.parse(new TextDecoder().decode(mTxt)).version;
        if (mv) tag = "v" + mv;
      } catch (e) {
        // 读不到就只影响版本号显示，不影响导入
      }
    }

    setStatus("已解出索引与 " + bundle.chunks.length + " 个数据块，正在校验并写入…");
    const out = await applyInput(bundle, "github");
    await storageSet(REPO_KEY, repo);
    setStatus(
      "已更新到 " +
        (tag || "最新版") +
        "（" +
        rule.label +
        "）：共 " +
        out.count +
        " 条，数据生成于 " +
        (out.builtAt ? fmtTime(out.builtAt) : "未知") +
        "。",
      "ok"
    );
  } catch (err) {
    setStatus("更新失败：" + (err.message || err), "error");
  } finally {
    busy(false);
  }
}

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
    "- 扩展分支：" + browserKind() + "（决定拉取 .zip 还是 .xpi）",
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

function setupLocalUi() {
  if (HAS_DIR_PICKER) {
    $("local-btn").textContent = "选择扩展文件夹…";
    $("local-hint").textContent =
      "选中扩展文件夹，扩展会读取其中的 " +
      IDX_PATH +
      " 与 data/chunks/*.json.gz，用它替换当前的期刊库。";
    const input = $("local-file");
    if (input) input.remove();
  } else {
    $("local-btn").textContent = "选择 xpi / zip / 数据文件…";
    $("local-hint").textContent =
      "选中扩展包（.xpi / .zip），扩展会从中取出 " +
      IDX_PATH +
      " 与数据块；也可直接选旧格式的 .json.gz / .json 文件。";
    $("local-file").setAttribute("accept", ".xpi,.zip,.gz,.json");
  }
}

function setupGithubUi() {
  if (!GITHUB_REPO) return;
  // 已经内置了仓库：不再让用户手填
  const field = $("repo-field");
  if (field) field.remove();
  $("github-hint").textContent =
    "自动识别浏览器，从 " +
    GITHUB_REPO +
    " 拉取对应版本的期刊库，并在更新前告诉你版本号。";
}

async function init() {
  setupLocalUi();
  setupGithubUi();
  renderVersion();

  if (!GITHUB_REPO) {
    const savedRepo = await storageGet(REPO_KEY);
    if (savedRepo) $("repo").value = savedRepo;
  }

  $("local-btn").addEventListener("click", onLocal);
  $("github-btn").addEventListener("click", onGithub);
  $("feedback-btn").addEventListener("click", onFeedback);

  const repoInput = $("repo");
  if (repoInput) {
    repoInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") onGithub();
    });
  }

  await refreshInfo();
}

init();
