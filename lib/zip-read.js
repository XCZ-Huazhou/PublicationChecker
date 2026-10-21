/**
 * 最小 zip 读取器（经典脚本，挂到 root.PCZipRead）
 *
 * 用途：Firefox 下从 .xpi（本质是 zip）里取出 data/journals.json.gz。
 * 项目零依赖，所以自己走 EOCD → central directory → local file header。
 * 支持 stored(0) 与 deflate(8)；不支持 zip64 —— 扩展包用不到。
 */
(function (root) {
  "use strict";

  function findEocd(view, len) {
    // EOCD 签名 0x06054b50，注释最长 65535，所以从尾部往回找 22+65535 字节
    const floor = Math.max(0, len - 22 - 65535);
    for (let i = len - 22; i >= floor; i--) {
      if (view.getUint32(i, true) === 0x06054b50) return i;
    }
    throw new Error("不是有效的 zip/xpi：找不到 EOCD");
  }

  /** 列出 zip 内的条目名 */
  function listEntries(buf) {
    const u8 = new Uint8Array(buf);
    const view = new DataView(buf);
    const dec = new TextDecoder();

    const eocd = findEocd(view, u8.length);
    const total = view.getUint16(eocd + 10, true);
    let off = view.getUint32(eocd + 16, true);

    const names = [];
    for (let i = 0; i < total; i++) {
      if (off + 46 > u8.length) break;
      if (view.getUint32(off, true) !== 0x02014b50) break;
      const nameLen = view.getUint16(off + 28, true);
      const extraLen = view.getUint16(off + 30, true);
      const commentLen = view.getUint16(off + 32, true);
      names.push(dec.decode(u8.subarray(off + 46, off + 46 + nameLen)));
      off += 46 + nameLen + extraLen + commentLen;
    }
    return names;
  }

  async function inflateRaw(u8) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("当前环境不支持解压 zip（缺少 DecompressionStream）");
    }
    const ds = new DecompressionStream("deflate-raw");
    const stream = new Blob([u8]).stream().pipeThrough(ds);
    return await new Response(stream).arrayBuffer();
  }

  /** 取出指定条目，返回解压后的 ArrayBuffer */
  async function readEntry(buf, wantName) {
    const u8 = new Uint8Array(buf);
    const view = new DataView(buf);
    const dec = new TextDecoder();

    const eocd = findEocd(view, u8.length);
    const total = view.getUint16(eocd + 10, true);
    let off = view.getUint32(eocd + 16, true);

    for (let i = 0; i < total; i++) {
      if (off + 46 > u8.length) break;
      if (view.getUint32(off, true) !== 0x02014b50) break;

      const method = view.getUint16(off + 10, true);
      const compSize = view.getUint32(off + 20, true);
      const nameLen = view.getUint16(off + 28, true);
      const extraLen = view.getUint16(off + 30, true);
      const commentLen = view.getUint16(off + 32, true);
      const localOff = view.getUint32(off + 42, true);
      const name = dec.decode(u8.subarray(off + 46, off + 46 + nameLen));

      if (name === wantName) {
        if (compSize === 0xffffffff) {
          throw new Error("该条目用了 zip64，暂不支持");
        }
        if (view.getUint32(localOff, true) !== 0x04034b50) {
          throw new Error("zip 局部文件头损坏");
        }
        // local header 里的名称/扩展区长度未必与 central directory 一致，要用它自己的
        const lNameLen = view.getUint16(localOff + 26, true);
        const lExtraLen = view.getUint16(localOff + 28, true);
        const start = localOff + 30 + lNameLen + lExtraLen;
        const raw = u8.subarray(start, start + compSize);

        if (method === 0) {
          return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
        }
        if (method === 8) return await inflateRaw(raw);
        throw new Error("不支持的 zip 压缩方式：" + method);
      }
      off += 46 + nameLen + extraLen + commentLen;
    }
    throw new Error("压缩包里没有 " + wantName);
  }

  root.PCZipRead = { listEntries: listEntries, readEntry: readEntry };
})(typeof globalThis !== "undefined" ? globalThis : self);
