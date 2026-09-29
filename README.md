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
- 若只选中刊名的一部分，扩展会列出相关候选，需要你自己点选。
- 也支持用 **ISSN** 查询。

## 功能

| 操作 | 行为 |
|------|------|
| 选中文字 | 不打扰（方便复制粘贴） |
| 右键 → 点菜单「查询期刊分区」 | 当前页弹出结果浮层 |
| 工具栏图标 | 手动输入期刊名 / ISSN |

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
  lib/search-core.js     # 离线检索核心
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

## 免责声明

分区与影响因子数据来自社区整理（ShowJCR 等），仅供科研检索参考，不构成投稿建议。数据版权与准确性以原始发布方为准。

## License

[MIT](./LICENSE)
