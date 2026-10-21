# PublicationChecker

浏览器扩展：选中期刊名后**右键 → 点菜单「查询期刊分区」**，当前页浮层显示结果

- **JCR 分区**（2025，含 IF 与学科四分位）
- **中科院分区**（2025 升级版，大类 / 小类 / Top）
- **新锐分区**（2026）

内置约 2.3 万刊离线库（索引 + 数据块共约 2.3 MB，gzip），**无需联网、无需登录**。

## 解决什么问题

浏览网页、读文献列表或审稿意见时，经常要核对某本期刊的分区和影响因子。常见做法是复制刊名，再新开一个标签去 LetPub / 分区表网站搜，步骤多、还可能要登录。

**PublicationChecker** 把这件事压到：**页面上选中完整刊名 → 右键 → 点菜单「查询期刊分区」→ 当前页弹出结果**。

- 不用离开当前页面
- 不用专门打开查询网站
- 数据本地内置，离线也能查
- 结果页只展示信息，**不提供任何外链跳转**

## 使用建议

- **尽量选中完整英文期刊名**（例如 `Applied Computing and Informatics`），匹配最准。
- 若只选中刊名的一部分，扩展会列出相关候选，需要你自己点选。**同分结果按字母序排**，界面会显示命中总数（如「共 92 条匹配，显示前 8 条」），继续多输几个字母就能快速缩小范围。
- **识别不准？直接改。** 浮层顶部有输入框，选中内容自动填入；**边输入边实时匹配**，回车 / 点「查询」立即重查。
- 无需选中：在页面空白处（或图片上）右键 →「查询期刊分区（手动输入刊名）」，直接输入刊名查询。
- 也支持用 **ISSN** 查询。

## 功能

| 操作 | 行为 |
|------|------|
| 选中文字 | 不打扰（方便复制粘贴） |
| 右键 → 点菜单「查询期刊分区」 | 当前页弹出结果浮层，选中内容填入顶部输入框 |
| 浮层顶部输入框 | 刊名可编辑，**边输入边实时匹配**；回车 / 点「查询」立即重查 |
| 右键 →「查询期刊分区（手动输入刊名）」 | 无需选中，弹出空浮层直接输入刊名 |
| 工具栏图标 | 手动输入期刊名 / ISSN，展示完整分区详情 |
| 工具栏图标 →「关于 PublicationChecker」 | 查看版本与数据库信息，更新期刊库（本地文件 / GitHub Release；**只对扩展自身的页面生效**，见「更新期刊库」） |

结果卡片包含：

- 刊名（Title Case 展示）+ ISSN / E-ISSN
- JCR 分区 + 学科四分位 + **淡蓝色加粗 IF 胶囊**
- 中科院分区（大类 / 小类；仅 Top 时显示 **Top** 标签）
- 新锐分区（同上）
- 收录与出版（WOS、综述刊、语种、出版机构、中文名）

兼容 **Chrome / Edge**，以及 **360 极速** 等旧版 Chromium 浏览器（MV2 清单）。

## 安装（开发者模式）

> **注意**：Chrome / Edge 不能直接导入 ZIP，请先解压成文件夹，再「加载已解压的扩展程序」。选择含 `manifest.json` 的那一层目录。

### 方式一：下载打包好的版本（推荐）

到 [Releases](../../releases) 页面下载：

| 文件 | 适用环境 |
|------|----------|
| `PublicationChecker-chrome.zip` | Chrome / Edge 等现代 Chromium（解压后开发者模式加载） |
| `PublicationChecker-firefox.xpi` | Firefox 115+ / Zen / 其他支持 MV2 的浏览器（拖入安装） |

> 资产名**固定、不带版本号**（发版时覆盖上传同一个名字即可），插件也是按这两个名字去取新数据的，见「更新期刊库 → 维护者」。

### 方式二：从源码加载（本地开发，或自己改过代码）

**不要直接把仓库根目录加载成扩展**：`raw/`（14 MB）、`.git/`（10 MB）都会被算进扩展体积，`chrome://extensions` 里会显示 30 MB 以上。先构建出只含运行时文件的目录，再加载它：

1. `node build-chrome.js` —— 产出两样：`../PublicationChecker-chrome.zip`（发布用，约 2.4 MB）和 `../PublicationChecker-chrome/`（加载用，约 2.4 MB）
2. Chrome 打开 `chrome://extensions`（Edge 为 `edge://extensions`）
3. 打开「开发者模式」
4. 「加载已解压的扩展程序」→ 选择上一步的 `PublicationChecker-chrome` 目录
5. 以后改完代码：再跑一次 `node build-chrome.js`，回扩展页点「刷新」

> Firefox / Zen 侧对应 `node build-firefox.js`：产出 `PublicationChecker-firefox.xpi`（约 2.4 MB）；Zen profile 里已装过的话，脚本会直接覆盖部署，重启浏览器生效。

### 360 极速 / 旧版 Chromium（Manifest V2）

若提示 **「requires version 109 or greater」** 或无法加载清单：

1. 备份 `manifest.json`（可改名为 `manifest-mv3.json`）
2. 把仓库里的 `manifest-mv2.json` **复制或重命名**为 `manifest.json`
3. 再在扩展管理页加载 / 重新加载

> 打包产物（zip 与 `PublicationChecker-chrome/`）只含 MV3 清单，**不含** `manifest-mv2.json` 与 `background-mv2.js` —— 这两个文件只在仓库里。走 MV2 的话，把这两个文件复制进产物目录再改名，或直接加载仓库源码目录（体积大，见「方式二」的说明）。

部分浏览器需在设置中允许「未知来源扩展」或切换到极速内核。

## 使用

1. 在任意 **http/https** 网页选中英文期刊名或 ISSN
2. 右键 → **查询期刊分区：xxx**
3. 浮层展示分区与 IF 等信息

说明：

- 部分 **ESCI** 刊未收录进中科院分区表，界面会显示「未收录」
- `chrome://` 等受限页面无法注入浮层时，会自动打开完整结果页

## 体积与性能

- 扩展运行体积约 **2.4 MB**，其中数据约 2.3 MB
- 检索：**匹配只用索引**（`data/journals.idx.json.gz`，约 0.55 MB），命中之后才去取那几行所在的块（`data/chunks/*.json.gz`）
  —— 所以第一次查询不必解压 + 解析整个库
- `raw/`（原始 CSV）与 `.git/` 都不进安装包

## 更新期刊库

**默认就用扩展内置的库，不需要任何操作。** 运行时库是三个文件（都由 `tools/build_db.py` 产出）：`data/journals.idx.json.gz`（索引）、`data/chunks/*.json.gz`（完整行，每块 500 行）、`data/journals.issn.json.gz`（ISSN）。要换掉它，先看「改哪里」，再按改动范围选一条路线。

### 改哪里

| 想改的东西 | 位置 | 怎么改 |
|------|------|------|
| 库里的数据（刊名、分区、影响因子…） | `data/journals.idx.json.gz` + `data/chunks/*.json.gz` | 匹配只读索引，展示才取块；换掉它们就换了数据 |
| 数据来源、字段取舍、收录范围 | `raw/*.csv` + `tools/build_db.py` | 脚本按**列名**读取，删行、删列、去掉整个来源都可以；改完重建出上面那份 `.json.gz` |
| 检索与排序（怎么搜、同分怎么排） | `lib/search-core.js`：`normName` / `scoreName` / `candidateIds` / `searchJournals` | 前缀索引 + 运行时词索引（`buildTokenIndex`），与数据本身无关 |
| 数据格式 | 见下方「数据格式」 | `rows` 每行 20 个位置，缺的字段填 `""` |
| 打包与下载约定 | `options.js` 顶部的 `GITHUB_REPO` / `DATA_PATH` / `ASSET_RULES`，以及 `build-chrome.js` / `build-firefox.js` | 资产名固定，见下方「维护者」 |

### 路线一：改源码 + 重新打包（唯一能让**所有**入口都换库的方式）

1. 改 `raw/` 下的 CSV，或改 `tools/build_db.py`（例如去掉中科院分区：把 `load_cas(...)` 那行注释掉）
2. `python tools/build_db.py` —— 重建出索引与数据块，输出统计里对应来源变成 0 即生效
3. `node build-chrome.js` / `node build-firefox.js` —— 打出 Chrome zip / Firefox xpi
4. 重新加载扩展（`chrome://extensions` 里点刷新；Firefox 重装 xpi）

从 CSV 到安装包的完整流程图、环境要求，以及「删数据源 / 删列删行」的完整示例，见下方「数据与自定义」。

### 路线二：选项页导入（不碰代码、不用重装，但只对扩展自身的页面生效）

入口：工具栏图标 →「关于 PublicationChecker」（或扩展详情页的「扩展程序选项」）。

| 来源 | 说明 |
|------|------|
| 从本地更新 | **Chrome / Edge**：选解压后的扩展文件夹，整包读其中的 `data/journals.idx.json.gz`、`data/chunks/*.json.gz` 与 `data/journals.issn.json.gz`；**Firefox**：选 `.xpi` 包，从包里解出同样这几个文件。也接受旧格式（含 `rows` 的 `.json.gz` / `.json` 单文件） |
| 从 GitHub 更新 | 自动识别浏览器，从发布仓库的最新 Release 里取对应的包：**Firefox / Zen 取 `.xpi`**，**Chrome / Edge 取 `.zip`**，再从中解出索引与数据块。更新前会显示检测到的版本号（如 `v0.1.3`）和当前扩展版本，确认后才下载替换 |

导入前会校验：必须是含 `rows` 数组的合法数据，且条数 ≥ 1000（`lib/search-core.js` 的 `validatePayload`，`MIN_ROWS = 1000`），校验不过直接拒绝，不会把库写坏。

> **生效范围（重要）**：导入的库存进 IndexedDB（库名 `publication-checker`、store `db`、键 `override`，见 `lib/search-core.js` 的 `importDatabase` / `loadOverride`），**只有扩展自己的页面读得到** —— 工具栏弹窗、完整结果页、选项页、后台。
>
> **网页里右键弹出的浮层读不到它**，仍然用内置库：content script 调 IndexedDB 用的是宿主网页的源，不是扩展的源（Chrome 官方文档 *Storage and cookies*：content scripts 里调 Web Storage 类 API，访问的是宿主页的数据，而不是扩展的）；而且 `content.js` 在页面空闲时就已经把内置库解压并缓存了，没人通知它换库。
>
> 所以导入之后，**在网页里右键查询看到的还是旧数据**，刷新页面也没用（源不同这一点不会变）。要让网页浮层也换库，只能走路线一。
>
> 回到内置库：清掉那条 `override`（`lib/search-core.js` 的 `clearOverride()`），或卸载扩展重装 —— 扩展源的 IndexedDB 会一并清掉。

### 维护者：发版时让「从 GitHub 更新」拿得到新库

> 把发布仓库写进 `options.js` 顶部的 `GITHUB_REPO = "owner/repo"`，选项页就会隐藏「仓库」输入框，用户点一下「检查更新」即可。
>
> 发布时把 `node build-chrome.js` / `node build-firefox.js` 产出的包作为 Release 资产上传，**名字固定**：
>
> ```
> PublicationChecker-chrome.zip     （Chrome / Edge）
> PublicationChecker-firefox.xpi    （Firefox / Zen）
> ```
>
> 下载地址是 `releases/latest/download/<这个名字>` —— `latest` 由 GitHub 解析成最新 Release，所以**每次发版覆盖上传同一个名字**即可，不用带版本号。插件直接从包里取 `data/journals.idx.json.gz` 与 `data/chunks/*.json.gz`，**不需要额外单独上传数据文件**。
>
> 如果用了别的资产名，插件会退回 GitHub API 去问真实文件名 —— 功能照用，但会消耗一次 API 配额（未认证 60 次/小时/IP）；发布页读不出 tag 时（代理、网络问题）也会走一次 API。
>
> 为什么不走 GitHub API：未认证的 REST API 限额是 **60 次/小时/IP**，若大量用户共用出口 IP（公司/学校 NAT、代理、VPN），配额会被瞬间用光，插件就会收到 403。所以插件默认读发布页的重定向拿版本号、再按上面的命名约定直接下载 —— 这条路没有次数限制；只有命名不符合约定、或发布页读不到时，才回退到 API。

### 数据格式

`python tools/build_db.py` 产出三个东西，插件按需读取：

| 文件 | 内容 | 什么时候读 |
|------|------|-----------|
| `data/journals.idx.json.gz` | `{ v: 3, meta, chunkSize, names, cns, tokens, prefix }` | 每次检索都读（匹配只用它） |
| `data/chunks/NNN.json.gz` | 一批完整行，每块 `chunkSize` 行 | 命中哪几行，才读这几行所在的块 |
| `data/journals.issn.json.gz` | `[[ISSN, E-ISSN], …]`，下标即行号 | 只在按 ISSN 查询时读 |

索引里两个决定「命中哪些行」的结构：

- `tokens`：`{ 词: [行号…] }` —— 刊名规范化后按空格切开的倒排表，支撑「中间词也能搜到」
- `prefix`：`{ 前两个字符: [行号…] }` —— 支撑只输入刊名开头几个字母

规范化刊名（小写、`&`→`and`、其余非字母数字折成空格、压缩空格）不占存储，插件要用时现算。

`rows` 每行的位置（缺的字段一律填 `""`）：

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

## 数据与自定义

### 数据管线

安装包里带的是**编译好的离线数据库**，装上即可用：

```
raw/*.csv（原始分区表，仅仓库内，不进安装包）
        │  python tools/build_db.py
        ▼
data/journals.idx.json.gz    （索引，约 0.55 MB）  ← 匹配只读它
data/chunks/*.json.gz        （47 块，共约 1.5 MB）← 命中之后才取那几行所在的块
data/journals.issn.json.gz   （ISSN，约 0.2 MB）   ← 只在按 ISSN 查询时读
        │  node build-chrome.js / node build-firefox.js
        ▼
Chrome zip / Firefox xpi 安装包
```

原始 CSV 来自开源项目 [hitfyd/ShowJCR](https://github.com/hitfyd/ShowJCR)，置于 `raw/`。**直接改 CSV 不会影响已发布的安装包**——CSV 是生数据，插件只读编译产物；改完必须重新生成并重新打包。

### 环境要求

- Python 3（仅标准库，任意发行版均可；QGIS/ArcGIS 自带的也能用）
- Node.js（仅打包时用，数据重建本身不需要）

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

### 例：只删部分期刊或某些列

直接编辑 `raw/` 下的 CSV——脚本按**列名**读取，删行、删列都可以，缺失列自动按空值处理；某本期刊若在所有来源里都被删光，则不会入库。改完同样跑一遍上面的重建 + 打包流程。

## 目录结构

```
PublicationChecker/
  manifest.json          # Manifest V3（Chrome / Edge）
  manifest-mv2.json      # Manifest V2（360 等，按需改名）
  background.js          # 右键菜单（MV3）
  background-mv2.js      # 右键菜单（MV2）
  content.js             # 当前页浮层
  popup.* / results.*    # 工具栏弹窗与完整结果页
  options.*              # 选项页：期刊库更新（本地 / GitHub）
  lib/search-core.js     # 离线检索核心（含覆盖库存储）
  lib/zip-read.js        # 最小 zip 读取器（Firefox 从 xpi 取数用）
  data/journals.idx.json.gz   # 检索索引（刊名/中文名/词索引/前缀桶，编译产物）
  data/chunks/                # 完整行，每块 500 行（编译产物）
  data/journals.issn.json.gz  # ISSN 表（按需加载，编译产物）
  tools/build_db.py      # 数据重建脚本
  build-chrome.js        # 打包 Chrome zip
  build-firefox.js       # 打包 Firefox xpi
  raw/                   # 原始 CSV（生数据，仅重建时使用）
```

## 技术栈

- Chrome Extension（Manifest V3 + V2 双清单，JavaScript）
- 数据构建：Python（纯标准库）
- 打包：Node.js + zip

## 反馈问题

遇到 bug 或有改进建议，到 [Issues](../../issues) 提。也可以在扩展的「关于 PublicationChecker」页点 **「到 GitHub 提 issue」** —— 打开时会自动带上扩展版本、浏览器、数据库来源与条数、数据生成时间，省得手填。

## 免责声明

分区与影响因子数据来自社区整理（ShowJCR 等），仅供科研检索参考，不构成投稿建议。数据版权与准确性以原始发布方为准。

## License

[MIT](./LICENSE)
