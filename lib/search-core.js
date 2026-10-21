/**
 * 离线检索核心（经典脚本）
 *
 * 数据分两半（v3）：
 *   data/journals.idx.json.gz    索引：刊名、中文名、词索引、前缀桶
 *   data/chunks/NNN.json.gz      完整行，每块 chunkSize 行
 *   data/journals.issn.json.gz   ISSN，只在 ISSN 查询时才加载
 *
 * 匹配只用索引；确定命中哪几行之后，才去取这几行所在的块。
 * 于是第一次查询不必解压 + 解析整个库（原先约 290ms），只要索引 + 一块（约 90ms）。
 *
 * 用户导入的覆盖库存在 IndexedDB，形态与内置库一致（索引 + 分块），
 * 两条路径共用同一套检索代码；旧版导入的单文件（含 rows）也仍能读。
 * 规范化刊名不占用存储：只在需要时用逐字符版 normName 现算（全表约 17ms）。
 */
(function (root) {
  "use strict";

  const IDB_NAME = "publication-checker";
  const IDB_STORE = "db";
  const OV_KEY = "override";
  const MIN_ROWS = 1000;
  const DEFAULT_CHUNK = 500;

  /** 当前库（索引已解析）与已取的块，reloadDatabase() 时整体失效 */
  let dbPromise = null;
  const chunkCache = new Map();

  // ---------- IndexedDB ----------

  function idbOpen() {
    return new Promise(function (resolve, reject) {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
  }

  function idbRun(mode, fn) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        let out;
        let tx;
        try {
          tx = db.transaction(IDB_STORE, mode);
          out = fn(tx.objectStore(IDB_STORE));
        } catch (e) {
          db.close();
          reject(e);
          return;
        }
        tx.oncomplete = function () {
          db.close();
          resolve(out && out.result);
        };
        tx.onerror = function () {
          db.close();
          reject(tx.error);
        };
        tx.onabort = function () {
          db.close();
          reject(tx.error);
        };
      });
    });
  }

  function idbGet(key) {
    return idbRun("readonly", function (store) {
      return store.get(key);
    });
  }

  function idbPut(key, val) {
    return idbRun("readwrite", function (store) {
      return store.put(val, key);
    });
  }

  function idbDel(key) {
    return idbRun("readwrite", function (store) {
      return store.delete(key);
    });
  }

  function chunkKey(n) {
    return "chunk:" + n;
  }

  // ---------- 通用 ----------

  async function gunzip(buf) {
    if (typeof DecompressionStream === "undefined") {
      // 回退：未压缩 JSON
      const text = new TextDecoder().decode(buf);
      return JSON.parse(text);
    }
    const ds = new DecompressionStream("gzip");
    const stream = new Blob([buf]).stream().pipeThrough(ds);
    const text = await new Response(stream).text();
    return JSON.parse(text);
  }

  /** gzip 优先，失败则按未压缩 JSON 文本解析 */
  async function decodePayload(buf) {
    try {
      return await gunzip(buf);
    } catch (e) {
      return JSON.parse(new TextDecoder().decode(buf));
    }
  }

  function runtimeGetURL(path) {
    const api =
      typeof root.browser !== "undefined" && root.browser && root.browser.runtime
        ? root.browser
        : root.chrome;
    return api.runtime.getURL(path);
  }

  /**
   * 刊名规范化：逐字符实现，语义与
   *   toLowerCase() → &amp;→& → &→" and " → 非[ a-z0-9中文 ]→空格 → 压缩 → trim
   * 完全一致（已对全部 23059 条刊名逐条比对，0 处差异），但比正则链快 4 倍：
   * 全表 74ms → 17ms。库是懒加载的，这个函数是热路径，只对候选行调用。
   */
  function normName(name) {
    const s = String(name || "");
    let out = "";
    let pending = false; // 有待补的分隔空格
    for (let i = 0; i < s.length; i++) {
      const c0 = s.charCodeAt(i);
      if (c0 === 38 /* & */) {
        if (
          s.charCodeAt(i + 1) === 97 &&
          s.charCodeAt(i + 2) === 109 &&
          s.charCodeAt(i + 3) === 112 &&
          s.charCodeAt(i + 4) === 59
        ) {
          i += 4; // 吃掉 "amp;"
        }
        if (out) out += " ";
        out += "and";
        pending = true;
        continue;
      }
      const c = c0 >= 65 && c0 <= 90 ? c0 + 32 : c0;
      if ((c >= 97 && c <= 122) || (c >= 48 && c <= 57) || (c >= 0x4e00 && c <= 0x9fff)) {
        if (pending && out) out += " ";
        pending = false;
        out += String.fromCharCode(c);
      } else {
        pending = true;
      }
    }
    return out;
  }

  function cleanQuery(raw) {
    if (!raw) return "";
    let q = String(raw).trim();
    q = q
      .replace(/^[\"'“”‘’«»《》\[\(（]+|[\"'“”‘’«»《》\[\)\)）]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    q = q.replace(/[.,;:]+$/, "").trim();
    return q.slice(0, 160);
  }

  /**
   * 展示用刊名：全大写转 Title Case（如 APPLIED COMPUTING AND INFORMATICS
   * → Applied Computing and Informatics）；已是混合大小写则原样保留。
   */
  function formatJournalName(name) {
    const s = String(name || "").trim();
    if (!s) return "";
    if (s !== s.toUpperCase()) return s;
    const small = {
      of: 1, and: 1, the: 1, for: 1, in: 1, on: 1, at: 1, to: 1,
      vs: 1, or: 1, a: 1, an: 1, by: 1, per: 1, from: 1, with: 1,
    };
    const tokens = s.split(/\s+/);
    return tokens
      .map(function (token, i) {
        if (!token) return token;
        const lower = token.toLowerCase();
        // 小词（介词/连词）一律小写，首词除外
        if (i > 0 && small[lower]) return lower;
        // 短缩写保留：IEEE、ACS、JCR、SIAM 等
        if (/^[A-Z0-9]{2,5}$/.test(token) && token.length <= 4 && !small[lower]) {
          return token;
        }
        return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
      })
      .join(" ");
  }

  /**
   * 学科/小类名：把其中的全大写英文词转为 Title Case，中文原样保留。
   */
  function formatCategoryName(name) {
    const s = String(name || "").trim();
    if (!s) return "";
    const small = {
      of: 1, and: 1, the: 1, for: 1, in: 1, on: 1, at: 1, to: 1,
      vs: 1, or: 1, a: 1, an: 1, by: 1, per: 1, from: 1, with: 1,
    };
    return s.replace(/[A-Za-z][A-Za-z0-9&./-]*/g, function (w) {
      if (w !== w.toUpperCase() && w !== w.toLowerCase()) return w;
      if (w === w.toLowerCase()) return w;
      const lower = w.toLowerCase();
      if (small[lower]) return lower;
      if (w.length <= 4 && /^[A-Z]{2,4}$/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    });
  }

  function unpackPairs(s) {
    if (!s) return [];
    return String(s)
      .split(";")
      .filter(Boolean)
      .map(function (p) {
        const i = p.indexOf("|");
        return i < 0 ? [p, ""] : [p.slice(0, i), p.slice(i + 1)];
      });
  }

  function unpackCats(s) {
    if (!s) return [];
    return String(s)
      .split(";")
      .filter(Boolean)
      .map(function (p) {
        const parts = p.split("|");
        return [parts[0] || "", parts[1] || "", parts[2] || ""];
      });
  }

  // 出版商名美化：源数据全大写（SPRINGER/WILEY），仅对全大写值做首字母大写；
  // 本身混写的（如 PubMed）保持原样。
  var PUB_KEEP_UPPER = {
    MDPI: 1, BMC: 1, IEEE: 1, AIP: 1, IOP: 1, ACS: 1, RSC: 1, APS: 1,
    OSA: 1, SIAM: 1, AGU: 1, ECS: 1, SAGE: 1, AG: 1, SA: 1, SAS: 1,
    LLC: 1, USA: 1, UK: 1
  };
  var PUB_WORD_MAP = {
    GMBH: "GmbH",
    SPRINGERNATURE: "Springer Nature",
    PERGAMONELSEVIER: "Pergamon-Elsevier",
    KEAI: "KeAi"
  };
  var PUB_SMALL_WORDS = {
    OF: 1, AND: 1, THE: 1, FOR: 1, IN: 1, ON: 1,
    DE: 1, DER: 1, DI: 1, VAN: 1, VON: 1, Y: 1
  };

  function formatPublisher(s) {
    s = (s || "").trim();
    if (!s || s !== s.toUpperCase() || !/[A-Z]/.test(s)) return s;
    return s.split(/\s+/).map(function (word, wi) {
      return word.replace(/[A-Za-z]+/g, function (seg) {
        var up = seg.toUpperCase();
        if (PUB_KEEP_UPPER[up]) return up;
        if (PUB_WORD_MAP[up]) return PUB_WORD_MAP[up];
        var lower = seg.toLowerCase();
        if (wi > 0 && PUB_SMALL_WORDS[up]) return lower;
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      });
    }).join(" ");
  }

  function rowToJournal(row) {
    const display = formatJournalName(row[0]);
    return {
      name: display,
      rawName: row[0],
      issn: row[1],
      eissn: row[2],
      publisher: formatPublisher(row[17]),
      lang: row[19] || "",
      review: row[18] || "",
      jcr: {
        if: row[3],
        best: row[4],
        wos: row[5],
        cats: unpackCats(row[6]).map(function (c) {
          return [formatCategoryName(c[0]), c[1], c[2]];
        }),
      },
      cas: row[7]
        ? {
            zone: row[7],
            major: formatCategoryName(row[8]),
            top: row[9],
            minors: unpackPairs(row[10]).map(function (m) {
              return [formatCategoryName(m[0]), m[1]];
            }),
          }
        : null,
      xr: row[11]
        ? {
            zone: row[11],
            major: formatCategoryName(row[12]),
            top: row[13],
            minors: unpackPairs(row[16] || "").map(function (m) {
              return [formatCategoryName(m[0]), m[1]];
            }),
          }
        : null,
      warn: row[14] || "",
      cn: row[15] || "",
      names: row[15] ? [display, row[15]] : [display],
    };
  }

  // ---------- 库 ----------

  function chunkPath(n) {
    const s = n < 10 ? "00" + n : n < 100 ? "0" + n : "" + n;
    return "data/chunks/" + s + ".json.gz";
  }

  async function fetchGz(path) {
    const res = await fetch(runtimeGetURL(path));
    if (!res.ok) throw new Error("无法加载 " + path);
    return await decodePayload(await res.arrayBuffer());
  }

  /** 索引进来的对象包装成运行时库 */
  function makeDb(idx, extra) {
    const db = {
      meta: idx.meta || {},
      chunkSize: idx.chunkSize || DEFAULT_CHUNK,
      names: idx.names || [],
      cns: idx.cns || {},
      tokens: idx.tokens || {},
      prefix: idx.prefix || {},
      count: (idx.names || []).length,
    };
    if (extra) for (const k in extra) db[k] = extra[k];
    return db;
  }

  /** 旧版（v2）完整数据 → 运行时库：索引在内存里补齐，行本来就在手上 */
  function makeDbFromRows(data, extra) {
    const rows = data.rows || [];
    const names = new Array(rows.length);
    const cns = Object.create(null);
    const tokens = Object.create(null);
    for (let i = 0; i < rows.length; i++) {
      names[i] = rows[i][0];
      if (rows[i][15]) cns[i] = rows[i][15];
      const toks = normName(rows[i][0]).split(" ");
      const seen = Object.create(null);
      for (let k = 0; k < toks.length; k++) {
        const t = toks[k];
        if (t.length < 2 || seen[t]) continue;
        seen[t] = 1;
        (tokens[t] || (tokens[t] = [])).push(i);
      }
    }
    const db = makeDb(
      { meta: data.meta, names: names, cns: cns, tokens: tokens, prefix: data.prefix },
      extra
    );
    db.rows = rows;
    db.count = rows.length;
    return db;
  }

  function readOverride() {
    return idbGet(OV_KEY).catch(function () {
      return null;
    });
  }

  function loadDatabase() {
    if (dbPromise) return dbPromise;

    dbPromise = (async function () {
      // 用户导入的覆盖库优先；没有才用扩展内置的
      const rec = await readOverride();
      if (rec) {
        if (rec.kind === "v3") {
          const idx = await decodePayload(rec.idxBytes);
          const db = makeDb(idx, {
            source: "override",
            origin: rec.origin || "local",
            importedAt: rec.importedAt || "",
            ov: true,
            issnBytes: rec.issnBytes || null,
          });
          if (rec.count) db.count = rec.count;
          return db;
        }
        if (rec.bytes) {
          // 旧版导入的完整单文件
          const data = await decodePayload(rec.bytes);
          return makeDbFromRows(data, {
            source: "override",
            origin: rec.source || "local",
            importedAt: rec.importedAt || "",
            ov: true,
          });
        }
      }

      const idx = await fetchGz("data/journals.idx.json.gz");
      return makeDb(idx, { source: "builtin", origin: "", importedAt: "", ov: false });
    })();

    const p = dbPromise;
    p.catch(function () {
      if (dbPromise === p) dbPromise = null; // 失败不要缓存住，下次重试
    });
    return p;
  }

  /** 取第 n 块完整行（覆盖库从 IndexedDB，内置库从文件） */
  function loadChunk(db, n) {
    const cached = chunkCache.get(n);
    if (cached) return cached;

    const p = (async function () {
      if (db.ov) {
        const rec = await idbGet(chunkKey(n));
        if (!rec || !rec.bytes) throw new Error("覆盖库缺少数据块 " + n);
        return await decodePayload(rec.bytes);
      }
      return await fetchGz(chunkPath(n));
    })();

    chunkCache.set(n, p);
    p.catch(function () {
      chunkCache.delete(n); // 失败不要缓存住
    });
    return p;
  }

  /** 把命中行号换成完整行：只取它们所在的那几块 */
  async function resolveRows(db, ids) {
    if (db.rows) return ids.map(function (i) {
      return db.rows[i];
    });

    const size = db.chunkSize;
    const out = new Array(ids.length);
    const byChunk = new Map();
    for (let k = 0; k < ids.length; k++) {
      const c = Math.floor(ids[k] / size);
      if (!byChunk.has(c)) byChunk.set(c, []);
      byChunk.get(c).push(k);
    }

    await Promise.all(
      Array.from(byChunk, function (entry) {
        const c = entry[0];
        const ks = entry[1];
        return loadChunk(db, c).then(function (rows) {
          for (let j = 0; j < ks.length; j++) {
            out[ks[j]] = rows[ids[ks[j]] - c * size];
          }
        });
      })
    );
    return out;
  }

  /** ISSN 表：只在按 ISSN 查询时才加载 */
  function loadIssns(db) {
    if (db.issnPromise) return db.issnPromise;
    db.issnPromise = (async function () {
      if (db.rows) {
        return db.rows.map(function (r) {
          return [r[1], r[2]];
        });
      }
      if (db.ov) {
        if (!db.issnBytes) return null; // 没带 ISSN 表就只做文本匹配
        return await decodePayload(db.issnBytes);
      }
      return await fetchGz("data/journals.issn.json.gz");
    })();
    return db.issnPromise;
  }

  // ---------- 匹配 ----------

  function titleOf(db, i) {
    return db.rows ? db.rows[i][0] : db.names[i];
  }

  function cnOf(db, i) {
    return db.rows ? db.rows[i][15] : db.cns[i] || "";
  }

  /** 全表规范化刊名：只在对不上候选、需要兜底扫描时才建 */
  function normsOf(db) {
    if (!db.norms) {
      const n = new Array(db.count);
      for (let i = 0; i < n.length; i++) n[i] = normName(titleOf(db, i));
      db.norms = n;
    }
    return db.norms;
  }

  function normOf(db, i) {
    return db.norms ? db.norms[i] : normName(titleOf(db, i));
  }

  function candidateIds(db, qNorm) {
    if (!qNorm) return null;

    // 1) 前缀桶：按刊名开头的前两个字符取候选（支持只输入开头几个字母）
    const head = (db.prefix && db.prefix[qNorm.slice(0, 2)]) || null;

    // 2) 查询的第一个词作为「完整词」出现在哪些刊名里（支持中间词）
    const first = qNorm.split(" ")[0];
    const byWord = (db.tokens && first && db.tokens[first]) || null;

    if (head && head.length) {
      if (!byWord || !byWord.length) return head;
      const merged = new Set(head);
      for (let i = 0; i < byWord.length; i++) merged.add(byWord[i]);
      return Array.from(merged);
    }
    if (byWord && byWord.length) return byWord;
    return null; // 两者都没有 → 扫全表
  }

  /**
   * 把查询预编译成评分函数。qNorm 在一次检索里固定不变，而兜底扫描要跑两万多行，
   * 所以 " "+qNorm+" " 这类拼接、空格判断、查询分词都提到循环外只做一次。
   * 判定顺序与阈值与原实现逐条对应，评分结果不变。
   */
  function makeScorer(qNorm) {
    const mid = " " + qNorm + " ";
    const tail = " " + qNorm;
    const singleWord = qNorm.indexOf(" ") < 0;
    const tb = qNorm.length >= 4 ? qNorm.split(" ") : null;
    return function (nNorm) {
      if (!nNorm) return 0;
      if (nNorm === qNorm) return 100;
      if (nNorm.startsWith(qNorm) || qNorm.startsWith(nNorm)) return 85;
      // 查询词正好是刊名里的一个完整词：
      //   Remote Sensing of Environment  ←  只输入 Environment
      // 给得比前缀匹配（85）高：用户输入一个词时，它常常正是刊名中间/末尾的词
      if (singleWord && (nNorm.indexOf(mid) >= 0 || nNorm.endsWith(tail))) {
        return 90;
      }
      if (nNorm.indexOf(qNorm) >= 0 || qNorm.indexOf(nNorm) >= 0) return 70;
      // cheap token overlap only if lengths similar
      if (tb && nNorm.length >= 4) {
        const ta = nNorm.split(" ");
        if (ta.length > 1 && tb.length > 1) {
          const setA = Object.create(null);
          for (let i = 0; i < ta.length; i++) setA[ta[i]] = 1;
          let inter = 0;
          for (let i = 0; i < tb.length; i++) if (setA[tb[i]]) inter += 1;
          const union = ta.length + tb.length - inter;
          const jac = union ? inter / union : 0;
          if (jac >= 0.5) return jac * 80;
        }
      }
      return 0;
    };
  }

  // 同一次检索里 qNorm 不变，评分函数只编译一次
  let scorerQuery = null;
  let scorerFn = null;

  function scoreName(nNorm, qNorm) {
    if (!nNorm || !qNorm) return 0;
    if (scorerQuery !== qNorm) {
      scorerQuery = qNorm;
      scorerFn = makeScorer(qNorm);
    }
    return scorerFn(nNorm);
  }

  async function searchJournals(query, limit) {
    limit = limit || 12;
    const db = await loadDatabase();

    const qRaw = cleanQuery(query);
    const qNorm = normName(qRaw);
    if (!qNorm && !qRaw) {
      return { meta: db.meta, query: qRaw, hits: [], total: 0 };
    }

    const n = db.count;
    const hits = [];
    const issnRe = /^\d{4}-?\d{3}[\dX]$/i;
    const qIssn = qRaw.replace(/\s+/g, "").toUpperCase();
    const qIssnFmt =
      qIssn.length === 8 ? qIssn.slice(0, 4) + "-" + qIssn.slice(4) : qIssn;
    const wantsIssn = issnRe.test(qIssn);
    const issns = wantsIssn ? await loadIssns(db) : null;

    // 统一按原始刊名去重：前缀桶扫描与兜底扫描可能命中同一行
    const seenNames = Object.create(null);

    // 只记轻量记录：rowToJournal / formatJournalName 留到排序之后，
    // 只对真正要展示的那几条做。否则像「a」这种两万多条命中的查询，
    // 会白白构造两万个完整对象（含正则格式化），只为最后取前 8 条。
    function consider(i, score, matched) {
      if (score < 55) return;
      const key = titleOf(db, i);
      if (seenNames[key]) return;
      seenNames[key] = 1;
      hits.push({
        score: score,
        matched: matched || key,
        sortName: formatJournalName(key),
        i: i,
      });
    }

    function issnHit(i) {
      if (!issns) return false;
      const e = issns[i];
      return !!(
        e &&
        ((e[0] && e[0].toUpperCase() === qIssnFmt) ||
          (e[1] && e[1].toUpperCase() === qIssnFmt))
      );
    }

    const ids = candidateIds(db, qNorm);
    const len = ids ? ids.length : n;
    for (let k = 0; k < len; k++) {
      const i = ids ? ids[k] : k;

      let best = scoreName(normOf(db, i), qNorm);
      let matched = titleOf(db, i);
      const cn = cnOf(db, i);
      if (cn) {
        const s2 = scoreName(normName(cn), qNorm);
        if (s2 > best) {
          best = s2;
          matched = cn;
        }
      }
      if (issnHit(i)) {
        best = 110;
        matched = titleOf(db, i);
      }
      if (best >= 55) consider(i, best, matched);
    }

    // ISSN 命中若被前缀桶漏掉，再按 ISSN 找一次
    if (wantsIssn && issns && !hits.length) {
      for (let i = 0; i < n; i++) {
        if (issnHit(i)) {
          consider(i, 110, titleOf(db, i));
          break;
        }
      }
    }

    // 候选太窄且几乎没命中：扫全表兜底（只输入前几个字母、或刊名里有特殊写法时会走到）
    if (hits.length < 3 && qNorm.length >= 3) {
      const norms = normsOf(db);
      for (let i = 0; i < n && hits.length < 20; i++) {
        const best = scoreName(norms[i], qNorm);
        if (best >= 70) consider(i, best, titleOf(db, i));
      }
    }

    hits.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.sortName || "").localeCompare(String(b.sortName || ""));
    });

    const top = hits.slice(0, limit);
    const rows = await resolveRows(
      db,
      top.map(function (h) {
        return h.i;
      })
    );

    return {
      meta: db.meta,
      query: qRaw,
      hits: top.map(function (h, k) {
        return {
          score: h.score,
          matchedName: formatJournalName(h.matched),
          journal: rowToJournal(rows[k]),
        };
      }),
      total: hits.length,
    };
  }

  function reloadDatabase() {
    dbPromise = null;
    chunkCache.clear();
  }

  async function getDbInfo() {
    const db = await loadDatabase();
    return {
      source: db.source || "builtin",
      origin: db.origin || "",
      importedAt: db.importedAt || "",
      count: db.count || 0,
      builtAt: (db.meta && db.meta.builtAt) || "",
      jcr: (db.meta && db.meta.jcr) || "",
      cas: (db.meta && db.meta.cas) || "",
      xinrui: (db.meta && db.meta.xinrui) || "",
    };
  }

  /**
   * 导入一份期刊库。两种输入：
   *  - v3：{ idxBytes, chunks, issnBytes } —— 索引/ISSN 的 gzip 字节 + 每个数据块的字节
   *  - v2：ArrayBuffer / Uint8Array —— 旧版含 rows 的完整单文件（gzip 或纯 JSON）
   * 校验不过直接抛错，不会把现有的库写坏。
   */
  async function importDatabase(input, source) {
    const src = source || "local";
    const now = new Date().toISOString();

    if (input && input.idxBytes) {
      const idx = await decodePayload(input.idxBytes);
      const count = (idx && idx.names && idx.names.length) || 0;
      if (!idx || !idx.names || !idx.tokens) {
        throw new Error("数据格式不对：缺少索引结构");
      }
      if (count < MIN_ROWS) {
        throw new Error("数据条数异常（" + count + "），已拒绝导入");
      }
      const chunks = input.chunks || [];
      if (!chunks.length) throw new Error("数据格式不对：没有数据块");

      const prev = await readOverride();
      await idbPut(OV_KEY, {
        kind: "v3",
        idxBytes: input.idxBytes,
        issnBytes: input.issnBytes || null,
        chunkCount: chunks.length,
        count: count,
        origin: src,
        importedAt: now,
      });
      for (let i = 0; i < chunks.length; i++) {
        await idbPut(chunkKey(i), { bytes: chunks[i] });
      }
      // 上一份库的块可能比这次多，清掉多余的
      for (let i = chunks.length; i < ((prev && prev.chunkCount) || 0); i++) {
        await idbDel(chunkKey(i));
      }

      reloadDatabase();
      const db = await loadDatabase();
      return {
        count: db.count,
        importedAt: now,
        builtAt: (db.meta && db.meta.builtAt) || "",
        source: src,
      };
    }

    // 旧版：完整单文件
    const data = await decodePayload(input);
    if (!data || !Array.isArray(data.rows)) {
      throw new Error("数据格式不对：缺少 rows 数组");
    }
    if (data.rows.length < MIN_ROWS) {
      throw new Error("数据条数异常（" + data.rows.length + "），已拒绝导入");
    }
    await idbPut(OV_KEY, {
      bytes: input,
      source: src,
      importedAt: now,
      count: data.rows.length,
      builtAt: (data.meta && data.meta.builtAt) || "",
    });
    reloadDatabase();
    const db2 = await loadDatabase();
    return {
      count: db2.count,
      importedAt: now,
      builtAt: (db2.meta && db2.meta.builtAt) || "",
      source: src,
    };
  }

  async function clearOverride() {
    const prev = await readOverride();
    for (let i = 0; i < ((prev && prev.chunkCount) || 0); i++) {
      await idbDel(chunkKey(i));
    }
    await idbDel(OV_KEY);
    reloadDatabase();
  }

  /** 预热：把索引加载好（第一次查询就不必再等它）。不依赖它也能快，纯属锦上添花 */
  async function warmUp() {
    return await loadDatabase();
  }

  root.PublicationChecker = {
    normName: normName,
    cleanQuery: cleanQuery,
    formatJournalName: formatJournalName,
    formatCategoryName: formatCategoryName,
    loadDatabase: loadDatabase,
    searchJournals: searchJournals,
    reloadDatabase: reloadDatabase,
    getDbInfo: getDbInfo,
    importDatabase: importDatabase,
    clearOverride: clearOverride,
    decodePayload: decodePayload,
    warmUp: warmUp,
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
