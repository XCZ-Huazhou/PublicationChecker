'use strict';
// PublicationChecker → Firefox 版一键构建
// 运行：node build-firefox.js → 直接产出可用 xpi 并自动部署到 Zen（若在运行请先关闭 Zen）
// 原理：仓库自带 manifest-mv2.json / background-mv2.js（Firefox/旧Chromium 后台页形态），
//       构建时以 MV2 清单为准打 xpi；Chrome 版继续用 manifest.json (MV3) 不受影响。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SRC = __dirname;
const STAGE = path.join(SRC, '..', '.ff-build-pubcheck');
// zip 可执行文件：优先用 PATH 里的 zip，找不到再退回本机 Rtools 自带的那份。
// 换机器时直接把 zip 加进 PATH 即可，也可以改下面这个候选列表。
const ZIP_CANDIDATES = [
  'zip',
  'D:\\Softwares\\DataAnalysis\\R\\Rtools\\rtools45\\usr\\bin\\zip.exe',
];

function resolveZip() {
  for (const c of ZIP_CANDIDATES) {
    try {
      execFileSync(c, ['-v'], { stdio: 'ignore' });
      return c;
    } catch (e) {
      // 这个候选不可用，试下一个
    }
  }
  console.error(
    '找不到 zip 命令。装一个 zip 并加进 PATH，或把它的完整路径写进 ZIP_CANDIDATES。'
  );
  process.exit(1);
}

const ZIP = resolveZip();
// Zen 的 profile 扩展目录：换 profile 就改这里，或设环境变量 PC_ZEN_EXT
const ZEN_EXT =
  process.env.PC_ZEN_EXT || 'D:\\Softwares\\DailyWork\\ZenBrowser\\Profile\\extensions';
const GECKO_ID = 'publication-checker@xcz-huazhou';
const XPI_OUT = path.join(SRC, '..', 'PublicationChecker-firefox.xpi');

/** 递归删掉手工备份文件（*.bak / *.bak-20261016-112511）：既不入库也不进包 */
function dropBak(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) dropBak(p);
    else if (/\.bak(-[\d-]+)?$/i.test(e.name)) fs.rmSync(p, { force: true });
  }
}

// 1. staging：完整复制后剔除源数据与仓库元数据（raw/tools 为源数据，不进包）
fs.rmSync(STAGE, { recursive: true, force: true });
fs.cpSync(SRC, STAGE, { recursive: true });
for (const skip of ['.git', '.gitignore', 'raw', 'tools', 'docs', 'build-firefox.js', 'build-chrome.js', 'data/journals.json']) {
  fs.rmSync(path.join(STAGE, skip), { recursive: true, force: true });
}
dropBak(STAGE);

// 2. MV2 清单覆盖 MV3，补 gecko id
// （注意：background-mv2.js 被 MV2 清单引用，必须保留在包内）
fs.copyFileSync(path.join(STAGE, 'manifest-mv2.json'), path.join(STAGE, 'manifest.json'));
fs.rmSync(path.join(STAGE, 'manifest-mv2.json'), { force: true });
const mPath = path.join(STAGE, 'manifest.json');
const m = JSON.parse(fs.readFileSync(mPath, 'utf8'));
// AMO 从 2025-11-03 起强制要求这个键：本插件只在本地检索 + 从 GitHub 下载公开数据包，
// 不收集、不上传任何用户数据，所以如实声明 none。
m.browser_specific_settings = {
  gecko: {
    id: GECKO_ID,
    strict_min_version: '115.0',
    data_collection_permissions: { required: ['none'], optional: [] },
  },
};
fs.writeFileSync(mPath, JSON.stringify(m, null, 2) + '\n');

// 3. 打包 xpi（zip 正斜杠）
fs.rmSync(XPI_OUT, { force: true });
execFileSync(ZIP, ['-r', '-X', XPI_OUT, '.'], {
  cwd: STAGE,
  stdio: 'ignore',
});
fs.rmSync(STAGE, { recursive: true, force: true }); // 别把 staging 残骸留在仓库外面

// 4. 部署到 Zen
const zenXpi = path.join(ZEN_EXT, GECKO_ID + '.xpi');
if (fs.existsSync(zenXpi)) {
  try {
    fs.copyFileSync(XPI_OUT, zenXpi);
    console.log('已部署到 Zen profile，重启 Zen 生效。');
  } catch {
    console.log(
      '部署失败：Zen 正在运行并锁定了 ' + zenXpi + '\n' +
        '  → 关闭 Zen 后重跑本脚本即可；xpi 已经打好，也可以手动复制过去。'
    );
  }
} else {
  console.log('未检测到 Zen profile，跳过部署。');
}
console.log('xpi: ' + XPI_OUT);
