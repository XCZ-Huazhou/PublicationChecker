# PublicationChecker

浏览器扩展：选中期刊名后**右键**，当前页浮层直接查询

- **JCR 分区**（2025，含 IF 与学科四分位）
- **中科院分区**（2025 升级版，大类 / 小类 / Top）
- **新锐分区**（2026）

内置约 2.3 万刊离线库（约 1.3 MB，gzip），**无需联网、无需登录**。

## 功能

| 操作 | 行为 |
|------|------|
| 选中文字 | 不打扰（方便复制粘贴） |
| 右键 →「查询期刊分区」 | 当前页弹出结果浮层 |
| 工具栏图标 | 手动输入期刊名 / ISSN |

兼容 **Chrome / Edge**，以及 **360 极速** 等旧版 Chromium 浏览器（MV2 清单）。

## 安装（开发者模式）

### Chrome / Edge（推荐，Manifest V3）

1. 下载或克隆本仓库
2. Chrome 打开 `chrome://extensions`（Edge 为 `edge://extensions`）
3. 打开「开发者模式」
4. 「加载已解压的扩展程序」→ 选择本仓库根目录

### 360 极速 / 旧版 Chromium（Manifest V2）

若提示 **「requires version 109 or greater」** 或无法加载清单：

1. 备份根目录的 `manifest.json`（可改名为 `manifest-mv3.json`）
2. 把 `manifest-mv2.json` **复制或重命名**为 `manifest.json`
3. 再在扩展管理页加载 / 重新加载

部分浏览器需在设置中允许「未知来源扩展」或切换到极速内核。

## 使用

1. 在任意 **http/https** 网页选中英文期刊名或 ISSN
2. 右键 → **查询期刊分区：xxx**
3. 浮层展示 JCR / 中科院 / 新锐分区与影响因子

说明：

- 部分 **ESCI** 刊未收录进中科院分区表，界面会显示「未收录」
- `chrome://` 等受限页面无法注入浮层时，会自动打开完整结果页

## 体积与性能

- 扩展运行体积约 **1.3 MB**
- 数据：`data/journals.json.gz`（紧凑数组 + gzip）
- 检索：前缀索引 + 兜底扫描，首次解压后缓存

## 更新数据

原始 CSV 来自开源项目 [hitfyd/ShowJCR](https://github.com/hitfyd/ShowJCR)，置于 `raw/`（可选，重建时使用）。

```bash
python tools/build_db.py
```

然后在扩展管理页点击重新加载。

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
  data/journals.json.gz  # 本地期刊库
  tools/build_db.py      # 数据重建脚本
  raw/                   # 原始 CSV（可选）
```

## 技术栈

- Chrome Extension（Manifest V3 + V2 双清单，JavaScript）
- 数据构建：Python

## 免责声明

分区与影响因子数据来自社区整理（ShowJCR 等），仅供科研检索参考，不构成投稿建议。数据版权与准确性以原始发布方为准。

## License

[MIT](./LICENSE)
