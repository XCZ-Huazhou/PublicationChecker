# 开发者与维护者指南

面向想**改数据、改检索逻辑、自己打包发版**的人。只想用插件的话，看 [README](../README.md) 就够了。

数字均按 v0.1.4 的构建产物实测（2026-10-21 生成的库，23059 条）。

## 运行时数据

安装包里带的是**编译好的离线数据库**，装上即可用。三个文件都由 `tools/build_db.py` 产出：

| 文件 | 实测体积 | 内容 | 什么时候读 |
|------|---------|------|-----------|
| `data/journals.idx.json.gz` | 0.55 MB | `{ v: 3, meta, chunkSize, names, cns, tokens, prefix }` | 每次检索都读（匹配只用它） |
| `data/chunks/NNN.json.gz` | 47 块，共 1.51 MB | 一批完整行，每块 `chunkSize`（500）行 | 命中哪几行，才读这几行所在的块 |
| `data/journals.issn.json.gz` | 0.20 MB | `[[ISSN, E-ISSN], …]`，下标即行号 | 只在按 ISSN 查询时读 |

三者合计 2.27 MB；不含 ISSN 表则是 2.07 MB。

索引里两个决定「命中哪些行」的结构：

- `tokens`：`{ 词: [行号…] }` —— 刊名规范化后按空格切开的倒排表，支撑「中间词也能搜到」
- `prefix`：`{ 前两个字符: [行号…] }` —— 支撑只输入刊名开头几个字母

规范化刊名（小写、`&`→`and`、其余非字母数字折成空格、压缩空格）**不占存储**，运行时由 `normsOf()` 逐条现算（全表约 17 ms），单条走 `normOf()`。

### rows 每行的位置

缺的字段一律填 `""`，共 20 个位置：

| 下标 | 含义 | 下标 | 含义 |
|------|------|------|------|
| 0 | 刊名（英文） | 10 | 中科院小类，`类名\|分区` 用 `;` 分隔 |
| 1 | ISSN | 11 | 新锐分区 |
| 2 | E-ISSN | 12 | 新锐大类 |
| 3 | 影响因子 | 13 | 新锐 Top（填 `是` 才显示标签） |
| 4 | JCR 最佳分区 | 14 | 预警标记 |
| 5 | WOS 收录（SCIE / ESCI / AHCI…） | 15 | 中文名 |
| 6 | JCR 学科，`类名\|分区\|说明` 用 `;` 分隔 | 16 | 新锐小类，`类名\|分区` 用 `;` 分隔 |
| 7 | 中科院分区 | 17 | 出版机构 |
| 8 | 中科院大类 | 18 | 是否综述（填 `是` 才显示） |
| 9 | 中科院 Top（填 `是` 才显示标签） | 19 | 语种 |

`prefix` 与 `tokens` 都是「行号列表」的倒排表，**行号即 `chunks` 里的位置**（块号 = 行号 ÷ `chunkSize`）。改完重跑 `python tools/build_db.py`，就会重新生成索引与全部数据块。

## 检索与排序

全部在 `lib/search-core.js`，与数据本身无关。入口是 `searchJournals(query, limit)`（`limit` 默认 12；网页浮层从 8 条起，「继续查看」每次 +10）。

相关函数：

| 函数 | 作用 |
|------|------|
| `normName(name)` | 刊名规范化（比对前双方都过一遍） |
| `cleanQuery(raw)` | 清洗用户输入 |
| `candidateIds(db, qNorm)` | 用 `prefix` + `tokens` 缩小候选行号，避免扫全表 |
| `makeScorer(qNorm)` / `scoreName(nNorm, qNorm)` | 打分，见下表 |
| `resolveRows(db, ids)` | 命中之后才去取那几行所在的块 |
| `loadIssns(db)` | 仅在按 ISSN 查询时加载 ISSN 表 |

`makeScorer()` 的打分规则（分数越高越靠前）：

| 分数 | 条件 | 含义 |
|------|------|------|
| 110 | ISSN 命中 | 精确标识符，最高 |
| 100 | 规范化后刊名与查询完全相同 | 精确命中 |
| 90 | 单词查询，且该词正好是刊名里的一个完整词 | 输入 `Environment` 找到 `Remote Sensing of Environment` |
| 85 | 刊名以查询开头 | 用户正在往下打的那本刊 |
| 80 | 查询以刊名开头（刊名比查询短） | 这本刊只是查询的前缀，用户还要往后打 |
| 70 | 任一方包含另一方 | 宽松子串 |
| `jac × 80` | 双方都是多词、词集 Jaccard ≥ 0.5 | 词重叠兜底 |

入选门槛是 `best >= 55`。**同分按刊名字母序排**（`localeCompare`）—— 这就是为什么界面上要把命中总数讲清楚，引导用户继续输入缩小范围。

85 与 80 的区分是 v0.1.4 修的：此前两个方向同为 85，输入 `Remote Sensing a` 时更短的 `Remote Sensing` 会因字母序抢到第一位。

另外有两条兜底：ISSN 命中若被前缀桶漏掉，会按 ISSN 再扫一次；候选不足 3 条且查询 ≥ 3 字符时，扫全表捞 `score >= 70` 的（最多 20 条）。

## 数据管线

```
raw/*.csv（原始分区表，仅仓库内，不进安装包，约 14 MB）
        │  python tools/build_db.py
        ▼
data/journals.idx.json.gz    （索引，0.55 MB）      ← 匹配只读它
data/chunks/*.json.gz        （47 块，共 1.51 MB）  ← 命中之后才取那几行所在的块
data/journals.issn.json.gz   （ISSN，0.20 MB）      ← 只在按 ISSN 查询时读
        │  node build-chrome.js / node build-firefox.js
        ▼
Chrome zip / Firefox xpi 安装包
```

原始 CSV 来自开源项目 [hitfyd/ShowJCR](https://github.com/hitfyd/ShowJCR)，置于 `raw/`。**直接改 CSV 不会影响已发布的安装包** —— CSV 是生数据，插件只读编译产物；改完必须重新生成并重新打包。

`build_db.py` 按**列名**读取 CSV，所以删行、删列、去掉整个来源都可以，缺失列自动按空值处理；某本期刊若在所有来源里都被删光，则不会入库。重建时会先 `rmtree` 整个 `chunks/` 目录再写，避免上次构建多出来的块留在包里。

### 环境要求

- Python 3（仅标准库，任意发行版均可；QGIS/ArcGIS 自带的也能用）
- Node.js（仅打包时用，数据重建本身不需要）
- `zip` 命令：打包脚本优先用 PATH 里的 `zip`，找不到再退回 `build-*.js` 里 `ZIP_CANDIDATES` 写死的候选路径。换机器时把 `zip` 加进 PATH 即可

### 例：去掉中科院分区数据

1. 编辑 `tools/build_db.py`，把这一行注释掉：

   ```python
   load_cas(RAW / "FQBJCR2025-UTF8.csv", index)
   ```

2. 重新生成数据库并打包：

   ```bash
   python tools/build_db.py      # 输出统计里 cas=0 即生效
   node build-chrome.js          # 或 node build-firefox.js
   ```

3. 重新加载扩展即可。前端对所有缺失字段判空，去掉的来源会显示「未收录」，不会报错。

## 改哪里

| 想改的东西 | 位置 | 怎么改 |
|------|------|------|
| 库里的数据（刊名、分区、影响因子…） | `data/journals.idx.json.gz` + `data/chunks/*.json.gz` | 匹配只读索引，展示才取块；换掉它们就换了数据 |
| 数据来源、字段取舍、收录范围 | `raw/*.csv` + `tools/build_db.py` | 脚本按列名读取，删行、删列、去掉整个来源都可以；改完重建 `.json.gz` |
| 检索与排序（怎么搜、同分怎么排） | `lib/search-core.js`：`normName` / `candidateIds` / `makeScorer` / `searchJournals` | 打分表见上；与数据本身无关 |
| 数据格式 | 见上方「rows 每行的位置」 | 每行 20 个位置，缺的字段填 `""` |
| 打包与下载约定 | `options.js` 顶部的 `GITHUB_REPO` / `IDX_PATH` / `ISSN_PATH` / `CHUNK_RE` / `ASSET_RULES`，以及 `build-chrome.js` / `build-firefox.js` | 资产名固定，见下方「发版约定」 |

## 换库路线一：改源码 + 重新打包

**唯一能让所有入口都换库的方式。**

1. 改 `raw/` 下的 CSV，或改 `tools/build_db.py`
2. `python tools/build_db.py` —— 重建索引与数据块，输出统计里对应来源变成 0 即生效
3. `node build-chrome.js` / `node build-firefox.js` —— 打出 Chrome zip / Firefox xpi
4. 重新加载扩展（`chrome://extensions` 里点刷新；Firefox 重装 xpi）

## 换库路线二：选项页导入

不碰代码、不用重装，**但只对扩展自身的页面生效**。

入口：工具栏图标 →「关于 PublicationChecker」（或扩展详情页的「扩展程序选项」）。

| 来源 | 说明 |
|------|------|
| 从本地更新 | **Chrome / Edge**：选解压后的扩展文件夹，整包读其中的三个 `.json.gz`；**Firefox**：选 `.xpi` 包，用 `lib/zip-read.js` 从包里解出同样这几个文件。也接受旧格式（含 `rows` 的单文件 `.json.gz` / `.json`） |
| 从 GitHub 更新 | 由 `browserKind()` 按 UA 自动分流（`ASSET_RULES`：Firefox/Zen 取 `.xpi`，Chromium 取 `.zip`），从最新 Release 里取对应的包再解出数据。更新前会显示检测到的版本号和当前扩展版本，确认后才下载替换 |

**两条路都只换数据、不换扩展代码。** `readBundleFromZip()` / `readBundleFromDirectory()` 只取 `IDX_PATH`、`CHUNK_RE`、`ISSN_PATH` 三类条目，包里其余文件（所有脚本、样式、`manifest.json`、图标）读完即弃；浏览器也不提供让扩展覆盖自身程序文件的接口。想升级插件本身只能重新安装。安装包 2.4 MB 里数据占 2.27 MB、程序只占 0.12 MB，所以「下载了整包」很容易被误当成「更新了整个插件」—— 选项页的文案应当避免这种暗示。

### 导入校验

校验逻辑内联在 `lib/search-core.js` 的 `importDatabase()` 里（没有单独的校验函数），不过就直接抛错、不会把现有的库写坏：

- v3 形态：必须有 `names` 与 `tokens`，必须至少有一个数据块
- 旧格式：必须有 `rows` 数组
- 两者都要求条数 ≥ `MIN_ROWS`（= 1000）

### 生效范围（重要）

导入的库存进 IndexedDB（库名 `publication-checker`、store `db`、键 `override`，读写走 `readOverride()`），**只有扩展自己的页面读得到** —— 工具栏弹窗、完整结果页、选项页、后台。

**网页里右键弹出的浮层读不到它**，仍然用内置库。两个原因：

1. content script 调 IndexedDB 用的是**宿主网页的源**，不是扩展的源（Chrome 官方文档 *Storage and cookies*：content scripts 里调 Web Storage 类 API，访问的是宿主页的数据）
2. `content.js` 在页面空闲时就已经把内置库解压并缓存了，没人通知它换库

所以导入之后，在网页里右键查询看到的还是旧数据，刷新页面也没用（源不同这一点不会变）。要让网页浮层也换库，只能走路线一。

回到内置库：调 `clearOverride()`（会连带删掉所有 `chunk_N` 键），或卸载扩展重装 —— 扩展源的 IndexedDB 会一并清掉。

> `clearOverride()` 虽然挂在 `root.PublicationChecker` 上导出了，但**选项页没有任何按钮调用它**（`options.html` 只有 `local-btn` / `github-btn` / `feedback-btn` 三个）。用户导入错了库，界面上无法撤销，只能卸载重装。这是个待补的 UI 缺口。

## 构建脚本

两个脚本都是「拷到 staging → 删掉不该进包的 → zip → 删 staging」。

**排除清单**（`build-chrome.js`）：

```
.git  .gitignore  raw  tools
build-firefox.js  build-chrome.js
manifest-mv2.json  background-mv2.js
data/journals.json          ← 数据管线的未压缩中间产物
```

外加 `dropBak()` 递归删掉所有 `*.bak` / `*.bak-<时间戳>` 手工备份。

`build-firefox.js` 的排除清单少两项（`manifest-mv2.json`、`background-mv2.js`），因为它**以 MV2 清单为准**：构建时把 `manifest-mv2.json` 复制成 `manifest.json` 再打包。若检测到 Zen profile，还会直接把 xpi 部署进去，重启浏览器生效。

产物（都落在仓库的**上一级**目录）：

| 命令 | 产物 | 实测体积 |
|------|------|---------|
| `node build-chrome.js` | `../PublicationChecker-chrome.zip`（发布用） | 2.31 MB |
| | `../PublicationChecker-chrome/`（`chrome://extensions` 加载用） | 约 2.4 MB |
| `node build-firefox.js` | `../PublicationChecker-firefox.xpi` | 2.31 MB |

Chrome 不能直接装 zip（不像 Firefox 能拖 xpi），所以 build-chrome 同步产出一份解压好的目录。

**不要直接把仓库根目录加载成扩展**：`raw/`（14 MB）和 `.git/`（14 MB）都会被算进扩展体积，`chrome://extensions` 里会显示 30 MB 以上。

### 打包后必做的抽包验证

```bash
# Git Bash 的 GNU tar 读不了 zip，用 Windows 自带的 bsdtar
/c/Windows/System32/tar.exe -tf 包名 | grep -iE "\.git|raw/|tools/|build-|\.gitignore"   # 应为空
/c/Windows/System32/tar.exe -xOf 包名 manifest.json | grep '"version"'                   # 版本号必须与预期一致
/c/Windows/System32/tar.exe -tf 包名 | head -30                                          # 运行时文件齐全
```

版本号抽验是硬性步骤 —— 双清单项目 `manifest.json` 与 `manifest-mv2.json` 必须同步改。

## MV2 通道（360 极速 / 旧版 Chromium）

`manifest-mv2.json` + `background-mv2.js` 只在仓库里，**Chrome 打包产物不含这两个文件**（Firefox 的 xpi 则以 MV2 清单为准）。

手动走 MV2：

1. 备份 `manifest.json`（可改名为 `manifest-mv3.json`）
2. 把 `manifest-mv2.json` 复制或重命名为 `manifest.json`
3. 在扩展管理页加载 / 重新加载

若用的是打包产物，把这两个文件复制进产物目录再改名。部分浏览器需在设置中允许「未知来源扩展」或切换到极速内核。

## 发版约定

把发布仓库写进 `options.js` 顶部的 `GITHUB_REPO = "owner/repo"`，选项页就会隐藏「仓库」输入框，用户点一下「检查更新」即可。

Release 资产名**固定、不带版本号**：

```
PublicationChecker-chrome.zip     （Chrome / Edge）
PublicationChecker-firefox.xpi    （Firefox / Zen）
```

下载地址是 `releases/latest/download/<这个名字>` —— `latest` 由 GitHub 解析成最新 Release，不同 Release 的同名资产各自独立、互不冲突，所以**每次发版覆盖上传同一个名字**即可，代码不用跟着版本号变。

插件直接从包里取 `data/journals.idx.json.gz`、`data/chunks/*.json.gz` 与 `data/journals.issn.json.gz`，**不需要额外单独上传数据文件**。

### 为什么资产名不能带版本号

扩展内的「检查更新」先读 `https://github.com/<repo>/releases/latest` 的 302 重定向拿 **tag（= 版本号）**，再按 `assetCandidates()` 里写死的固定名字直接下载。**文件名与版本号是两件独立的事** —— 版本号只来自 tag。

若资产名不符合约定，插件会退回 GitHub API 去问真实文件名（`assetCandidates()` 不试带 `v` 前缀或带版本号的变体）。功能照用，但会消耗一次 API 配额。实测：

| 资产名 | GitHub API 调用 |
|---|---|
| `PublicationChecker-chrome.zip` | 0 次 ✓ |
| `PublicationChecker-chrome-0.1.2.zip` | 1 次 ✗ |
| `PublicationChecker-chrome-v0.1.2.zip` | 1 次 ✗ |

**为什么必须避开 API**：GitHub 未认证 REST API 限额是 60 次/小时/IP，大量用户共用出口 IP（公司/学校 NAT、代理、VPN）时会被瞬间用光并返回 403。而 `github.com` 的发布页与 Release 下载**没有次数限制**。发布页读不出 tag 时（代理、网络问题）也会走一次 API，这是无法避免的回退。

发版操作固定成：**打 tag（带版本号）→ 上传两个包（名字不带版本号）**。上传后本地 zip 删掉，GitHub 是唯一归档。

## 目录结构

```
PublicationChecker/
  manifest.json          # Manifest V3（Chrome / Edge）
  manifest-mv2.json      # Manifest V2（Firefox / 360 等）
  background.js          # 右键菜单（MV3 service worker）
  background-mv2.js      # 右键菜单（MV2 后台页）
  content.js             # 当前页浮层
  popup.* / results.*    # 工具栏弹窗与完整结果页
  options.*              # 选项页：期刊库更新（本地 / GitHub）
  lib/search-core.js     # 离线检索核心（含覆盖库存储）
  lib/zip-read.js        # 最小 zip 读取器（Firefox 从 xpi 取数用）
  data/journals.idx.json.gz   # 检索索引（编译产物）
  data/chunks/                # 完整行，每块 500 行（编译产物）
  data/journals.issn.json.gz  # ISSN 表（按需加载，编译产物）
  tools/build_db.py      # 数据重建脚本
  build-chrome.js        # 打包 Chrome zip
  build-firefox.js       # 打包 Firefox xpi
  raw/                   # 原始 CSV（生数据，仅重建时使用，不进包）
  docs/DEVELOPMENT.md    # 本文
```

## 技术栈

- Chrome Extension（Manifest V3 + V2 双清单，原生 JavaScript，无框架、无构建时依赖）
- 数据构建：Python 3（纯标准库）
- 打包：Node.js + `zip`
- 存储：IndexedDB（仅存用户导入的覆盖库）

## 已知约束

- content script 读不到扩展源的 IndexedDB（见「生效范围」），这是平台限制，不是 bug
- MV3 的 service worker 空闲 30 秒就被回收，所以 `content.js` 优先在页面内检索、库加载一次就常驻；走 background 的话每次都要重新解压数据库
- 用户导入的覆盖库只活到扩展卸载为止；`clearOverride()` 可单独清掉
