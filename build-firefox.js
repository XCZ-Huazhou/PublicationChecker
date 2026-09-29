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
const ZIP = 'D:\\Softwares\\DataAnalysis\\R\\Rtools\\rtools45\\usr\\bin\\zip.exe';
const ZEN_EXT = 'D:\\Softwares\\DailyWork\\ZenBrowser\\Profile\\extensions';
const GECKO_ID = 'publication-checker@cstai.local';
const XPI_OUT = path.join(SRC, '..', 'PublicationChecker-firefox.xpi');

// 1. staging：完整复制后剔除源数据与仓库元数据（raw/tools 为源数据，不进包）
fs.rmSync(STAGE, { recursive: true, force: true });
fs.cpSync(SRC, STAGE, { recursive: true });
for (const skip of ['.git', 'raw', 'tools', 'build-firefox.js', 'build-chrome.js', '.gitignore']) {
  fs.rmSync(path.join(STAGE, skip), { recursive: true, force: true });
}

// 2. MV2 清单覆盖 MV3，补 gecko id
// （注意：background-mv2.js 被 MV2 清单引用，必须保留在包内）
fs.copyFileSync(path.join(STAGE, 'manifest-mv2.json'), path.join(STAGE, 'manifest.json'));
fs.rmSync(path.join(STAGE, 'manifest-mv2.json'), { force: true });
const mPath = path.join(STAGE, 'manifest.json');
const m = JSON.parse(fs.readFileSync(mPath, 'utf8'));
m.browser_specific_settings = { gecko: { id: GECKO_ID, strict_min_version: '115.0' } };
fs.writeFileSync(mPath, JSON.stringify(m, null, 2) + '\n');

// 3. 打包 xpi（zip 正斜杠）
fs.rmSync(XPI_OUT, { force: true });
execFileSync(ZIP, ['-r', '-X', XPI_OUT, '.'], {
  cwd: STAGE,
  stdio: 'ignore',
});

// 4. 部署到 Zen
if (fs.existsSync(path.join(ZEN_EXT, GECKO_ID + '.xpi'))) {
  try {
    fs.copyFileSync(XPI_OUT, path.join(ZEN_EXT, GECKO_ID + '.xpi'));
    console.log('已部署到 Zen profile，重启 Zen 生效。');
  } catch {
    console.log('部署失败：Zen 运行中锁定了文件，请关闭 Zen 后重跑本脚本。');
  }
} else {
  console.log('未检测到 Zen profile，跳过部署。');
}
console.log('xpi: ' + XPI_OUT);
