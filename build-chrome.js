'use strict';
// PublicationChecker → Chrome 包一键构建
// 运行：node build-chrome.js
//   1) ../PublicationChecker-chrome.zip —— 发布用，上传到 Release（名字固定，插件「从 GitHub 更新」按这个名字取）
//   2) ../PublicationChecker-chrome/    —— 解压好的运行时目录，chrome://extensions 里「加载已解压的扩展程序」指向它
// 两个产物都只含运行时文件（约 2.4 MB，其中 data/ 占 2.3 MB）：源数据 raw/、构建物料 tools/、
// 仓库元数据 .git 都不进包。**不要直接加载仓库目录**，那样会把 raw/、.git 一起算进扩展体积。
// Chrome 版用 MV3 清单 manifest.json（service worker），与 Firefox/MV2 通道互不影响。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SRC = __dirname;
const STAGE = path.join(SRC, '..', '.chrome-build-pubcheck');
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
const ZIP_OUT = path.join(SRC, '..', 'PublicationChecker-chrome.zip');
// Chrome 不能直接装 zip（不像 Firefox 能拖 xpi），只能加载已解压的扩展程序，
// 所以这里同步一份出来 —— 与 build-firefox.js 自动部署到 Zen profile 是对称的。
const EXT_OUT = path.join(SRC, '..', 'PublicationChecker-chrome');

/** 递归删掉手工备份文件（*.bak / *.bak-20261016-112511）：既不入库也不进包 */
function dropBak(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) dropBak(p);
    else if (/\.bak(-[\d-]+)?$/i.test(e.name)) fs.rmSync(p, { force: true });
  }
}

/** 目录总字节数，用来在日志里核对产物没有把源数据带进去 */
function dirBytes(dir) {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? dirBytes(p) : fs.statSync(p).size;
  }
  return total;
}

function fmtSize(n) {
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

// 1. staging：运行时文件进包，源数据(raw/tools)、仓库元数据与构建物料不进
fs.rmSync(STAGE, { recursive: true, force: true });
fs.cpSync(SRC, STAGE, { recursive: true });
for (const skip of [
  '.git', '.gitignore', 'raw', 'tools', 'docs',
  'build-firefox.js', 'build-chrome.js',
  'manifest-mv2.json', 'background-mv2.js',
  'data/journals.json'
]) {
  fs.rmSync(path.join(STAGE, skip), { recursive: true, force: true });
}
dropBak(STAGE);

// 2. 打包
fs.rmSync(ZIP_OUT, { force: true });
execFileSync(ZIP, ['-r', '-X', ZIP_OUT, '.'], { cwd: STAGE, stdio: 'ignore' });

// 3. 部署解压目录：整体替换，不留上次构建的陈旧文件
fs.rmSync(EXT_OUT, { recursive: true, force: true });
fs.cpSync(STAGE, EXT_OUT, { recursive: true });

fs.rmSync(STAGE, { recursive: true, force: true });

console.log('chrome zip     : ' + ZIP_OUT + '（' + fmtSize(fs.statSync(ZIP_OUT).size) + '）');
console.log('chrome 加载目录: ' + EXT_OUT + '（' + fmtSize(dirBytes(EXT_OUT)) + '）');
