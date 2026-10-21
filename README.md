# PublicationChecker

浏览器扩展：选中期刊名后**右键 → 点菜单「查询期刊分区」**，当前页浮层显示结果

- **JCR 分区**（2025，含 IF 与学科四分位）
- **中科院分区**（2025 升级版，大类 / 小类 / Top）
- **新锐分区**（2026）

内置约 2.3 万刊离线库（约 1.5 MB，gzip），**无需联网、无需登录**。

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
| 工具栏图标 →「关于 PublicationChecker」 | 查看版本与数据库信息，更新期刊库（本地文件 / GitHub Release） |

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
| `PublicationChecker-chrome-*.zip` | Chrome / Edge 等现代 Chromium（解压后开发者模式加载） |
| `PublicationChecker-firefox-*.xpi` | Firefox 115+ / Zen / 其他支持 MV2 的浏览器（拖入安装） |

### 方式二：从源码加载

1. 下载本仓库（ZIP 需先解压；或直接使用本地目录）
2. Chrome 打开 `chrome://extensions`（Edge 为 `edge://extensions`）
3. 打开「开发者模式」
4. 「加载已解压的扩展程序」→ 选择解压后的仓库根目录

### 360 极速 / 旧版 Chromium（Manifest V2）

若提示 **「requires version 109 or greater」** 或无法加载清单：

1. 备份根目录的 `manifest.json`（可改名为 `manifest-mv3.json`）
2. 把 `manifest-mv2.json` **复制或重命名**为 `manifest.json`
3. 再在扩展管理页加载 / 重新加载

部分浏览器需在设置中允许「未知来源扩展」或切换到极速内核。

## 使用

1. 在任意 **http/https** 网页选中英文期刊名或 ISSN
2. 右键 → **查询期刊分区：xxx**
3. 浮层展示分区与 IF 等信息

说明：

- 部分 **ESCI** 刊未收录进中科院分区表，界面会显示「未收录」
- `chrome://` 等受限页面无法注入浮层时，会自动打开完整结果页

## 体积与性能

- 扩展运行体积约 **1.5 MB**
- 数据：`data/journals.json.gz`（紧凑数组 + gzip）
- 检索：前缀索引 + 兜底扫描，首次解压后缓存

## 更新期刊库

**默认就用扩展内置的库，不需要任何操作。** 想换成自己的数据，看下面的「换成自己的数据库」。

入口：工具栏图标 →「关于 PublicationChecker」（或扩展详情页的「扩展程序选项」）。

| 来源 | 说明 |
|------|------|
| 从本地更新 | **Chrome / Edge**：选解压后的扩展文件夹，自动读其中的 `data/journals.json.gz`；**Firefox**：选 `.xpi` 包，从中解出同一路径，也可直接选 `.json.gz` / `.json` |
| 从 GitHub 更新 | 自动识别浏览器，从发布仓库的最新 Release 里挑对应的包：**Firefox / Zen 取 `.xpi`**，**Chrome / Edge 取 `.zip`**，再从中解出 `data/journals.json.gz`。更新前会显示检测到的版本号（如 `v0.1.3`）和当前扩展版本，确认后才下载替换 |

> **维护者**：把发布仓库写进 `options.js` 顶部的 `GITHUB_REPO = "owner/repo"`，选项页就会隐藏「仓库」输入框，用户点一下「检查更新」即可。
>
> 发布时把 `node build-chrome.js` / `node build-firefox.js` 产出的包作为 Release 资产上传，**名字固定**：
>
> ```
> PublicationChecker-chrome.zip     （Chrome / Edge）
> PublicationChecker-firefox.xpi    （Firefox / Zen）
> ```
>
> 下载地址是 `releases/latest/download/<这个名字>` —— `latest` 由 GitHub 解析成最新 Release，所以**每次发版覆盖上传同一个名字**即可，不用带版本号。插件直接从包里取 `data/journals.json.gz`，**不需要额外单独上传数据文件**。
>
> 如果用了别的资产名，插件会退回 GitHub API 去问真实文件名 —— 功能照用，但会消耗一次 API 配额（未认证 60 次/小时/IP）。
>
> 为什么不走 GitHub API：未认证的 REST API 限额是 **60 次/小时/IP**，若大量用户共用出口 IP（公司/学校 NAT、代理、VPN），配额会被瞬间用光，插件就会收到 403。所以插件默认读发布页的重定向拿版本号、再按上面的命名约定直接下载 —— 这条路没有次数限制；只有命名不符合约定时，才回退到 API 查询真实文件名。

导入前会校验（必须是含 `rows` 数组的合法数据，且条数 ≥ 1000），校验不过直接拒绝，不会把库写坏。导入的数据存在 IndexedDB，**检索时优先于内置库，且无需重载扩展即可生效**。

### 换成自己的数据库

**路线一：改源码重新打包**（可版本化，适合长期维护）

改 `raw/` 下的 CSV，或直接改 `tools/build_db.py`，然后重建 + 重新打包 —— 见下方「数据与自定义」的完整流程。

**路线二：直接替换运行时数据库**（不碰代码、不用重装）

生成一份 `journals.json.gz`，用上面的「从本地更新」或「从 GitHub 更新」导入即可。

数据格式（`data/journals.json.gz` 解压后的 JSON）：

```json
{
  "v": 2,
  "meta": { "builtAt": "2026-09-29T02:14:32Z", "jcr": "2025", "cas": "2025升级版", "xinrui": "2026", "count": 1 },
  "rows": [ [ "刊名", "0210-7287", "", "3.5", "Q1", "SCIE", "学科|Q1|1/100", "1区", "计算机科学", "是", "小类|1区", "1区", "计算机科学", "是", "", "中文名", "", "出版商", "", "English" ] ],
  "prefix": { "02": [0] }
}
```

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

`prefix` 是「刊名规范化后前两个字符 → 行号列表」的前缀索引，**删掉也能用**，只是检索会退化成全表扫描。改完压缩成 gzip、放回 `data/journals.json.gz` 就是一份可直接导入的库。

想回到内置版本：卸载扩展后重新加载（IndexedDB 会一并清掉），或按「路线一」重新导入一份内置格式的数据。

## 数据与自定义

### 数据管线

安装包里带的是**编译好的离线数据库**，装上即可用：

```
raw/*.csv（原始分区表，仅仓库内，不进安装包）
        │  python tools/build_db.py
        ▼
data/journals.json.gz（约 1.5 MB，23059 刊）← 插件运行时只读这一份
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
  data/journals.json.gz  # 本地期刊库（编译产物）
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
