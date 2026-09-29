'use strict';
// PublicationChecker → Chrome 包一键构建
// 运行：node build-chrome.js → 产出 ../PublicationChecker-chrome.zip（解压后加载已解压扩展即用）
// Chrome 版用 MV3 清单 manifest.json（service worker），与 Firefox/MV2 通道互不影响。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SRC = __dirname;
const STAGE = path.join(SRC, '..', '.chrome-build-pubcheck');
const ZIP = 'D:\\Softwares\\DataAnalysis\\R\\Rtools\\rtools45\\usr\\bin\\zip.exe';
const ZIP_OUT = path.join(SRC, '..', 'PublicationChecker-chrome.zip');

// 1. staging：运行时文件进包，源数据(raw/tools)、仓库元数据与构建物料不进
fs.rmSync(STAGE, { recursive: true, force: true });
fs.cpSync(SRC, STAGE, { recursive: true });
for (const skip of [
  '.git', '.gitignore', 'raw', 'tools',
  'build-firefox.js', 'build-chrome.js',
  'manifest-mv2.json', 'background-mv2.js'
]) {
  fs.rmSync(path.join(STAGE, skip), { recursive: true, force: true });
}

// 2. 打包
fs.rmSync(ZIP_OUT, { force: true });
execFileSync(ZIP, ['-r', '-X', ZIP_OUT, '.'], { cwd: STAGE, stdio: 'ignore' });
fs.rmSync(STAGE, { recursive: true, force: true });
console.log('chrome zip: ' + ZIP_OUT);
