/**
 * 离线检索核心（经典脚本）
 * 加载 data/journals.json.gz（紧凑数组格式 + 前缀索引）
 */
(function (root) {
  "use strict";

  let cachePromise = null;

  // ---- 覆盖数据库（IndexedDB）----
  // 内置库随扩展发布；用户可用本地文件或 GitHub Release 覆盖它。
  // 覆盖库存 IndexedDB：1.5MB 二进制放 storage.local 要 base64 且受配额限制。
  const IDB_NAME = "publication-checker";
  const IDB_STORE = "db";
  const IDB_KEY = "override";
  const MIN_ROWS = 1000;

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

  /** gzip 优先，失败则按未压缩 JSON 文本解析 */
  async function decodePayload(buf) {
    try {
      return await gunzip(buf);
    } catch (e) {
      return JSON.parse(new TextDecoder().decode(buf));
    }
  }

  function validatePayload(data) {
    if (!data || !Array.isArray(data.rows)) {
      throw new Error("数据格式不对：缺少 rows 数组");
    }
    if (data.rows.length < MIN_ROWS) {
      throw new Error("数据条数异常（" + data.rows.length + "），已拒绝导入");
    }
    return data;
  }

  async function loadOverride() {
    let rec;
    try {
      rec = await idbGet(IDB_KEY);
    } catch (e) {
      return null;
    }
    if (!rec || !rec.bytes) return null;
    const data = await decodePayload(rec.bytes);
    const db = normalizePayload(data);
    db.source = "override";
    db.origin = rec.source || "local";
    db.importedAt = rec.importedAt || "";
    return db;
  }

  /** 用一份新的 journals 数据覆盖内置库；buf 可为 gzip 或纯 JSON */
  async function importDatabase(buf, source) {
    const data = validatePayload(await decodePayload(buf));
    const rec = {
      bytes: buf,
      source: source || "local",
      importedAt: new Date().toISOString(),
      count: data.rows.length,
      builtAt: (data.meta && data.meta.builtAt) || "",
    };
    await idbPut(IDB_KEY, rec);
    reloadDatabase();
    return {
      count: rec.count,
      importedAt: rec.importedAt,
      builtAt: rec.builtAt,
      source: rec.source,
    };
  }

  async function clearOverride() {
    await idbDel(IDB_KEY);
    reloadDatabase();
  }

  function reloadDatabase() {
    cachePromise = null;
  }

  async function getDbInfo() {
    const db = await loadDatabase();
    const rows = db.rows ? db.rows.length : db.legacy ? db.legacy.length : 0;
    return {
      source: db.source || "builtin",
      origin: db.origin || "",
      importedAt: db.importedAt || "",
      count: rows,
      builtAt: (db.meta && db.meta.builtAt) || "",
      jcr: (db.meta && db.meta.jcr) || "",
      cas: (db.meta && db.meta.cas) || "",
      xinrui: (db.meta && db.meta.xinrui) || "",
    };
  }

  function runtimeGetURL(path) {
    const api =
      typeof root.browser !== "undefined" && root.browser && root.browser.runtime
        ? root.browser
        : root.chrome;
    return api.runtime.getURL(path);
  }

  function normName(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/&amp;/g, "&")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9一-鿿]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
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
   * 例：COMPUTER SCIENCE, INTERDISCIPLINARY APPLICATIONS 计算机：跨学科应用
   *  → Computer Science, Interdisciplinary Applications 计算机：跨学科应用
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
      // ALL CAPS
      const lower = w.toLowerCase();
      if (small[lower]) return lower;
      if (w.length <= 4 && /^[A-Z]{2,4}$/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    });
  }

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
  // For now expand from packed string if we put it in row[13] as top|we'll fix build.

  function loadDatabase() {
    if (cachePromise) return cachePromise;

    cachePromise = (async function () {
      // 用户导入的覆盖库优先；没有才回退到扩展内置库
      const ov = await loadOverride();
      if (ov) return ov;

      const url = runtimeGetURL("data/journals.json.gz");
      const res = await fetch(url);
      if (!res.ok) {
        // fallback uncompressed
        const res2 = await fetch(runtimeGetURL("data/journals.json"));
        if (!res2.ok) throw new Error("无法加载本地期刊库");
        const data = await res2.json();
        const norm = normalizePayload(data);
        norm.source = "builtin";
        return norm;
      }
      const buf = await res.arrayBuffer();
      const data = await gunzip(buf);
      const norm = normalizePayload(data);
      norm.source = "builtin";
      return norm;
    })();

    return cachePromise;
  }

  function normalizePayload(data) {
    if (data && data.rows) {
      const rows = data.rows;
      return {
        meta: data.meta || {},
        rows: rows,
        prefix: data.prefix || {},
      };
    }
    // legacy object format
    const journals = (data && data.journals) || [];
    return {
      meta: (data && data.meta) || {},
      legacy: journals,
      prefix: {},
    };
  }

  /**
   * 运行时补建「词 → 行号」索引。
   * 数据自带的前缀索引只看刊名开头，覆盖不到中间/末尾的词
   * （如 "Remote Sensing of Environment" 里的 Environment）。
   */
  function buildTokenIndex(db) {
    if (db.tokenIndex || !db.rows) return db.tokenIndex || null;
    const idx = Object.create(null);
    const rows = db.rows;
    for (let i = 0; i < rows.length; i++) {
      const toks = normName(rows[i][0]).split(" ");
      const seen = Object.create(null);
      for (let k = 0; k < toks.length; k++) {
        const t = toks[k];
        if (t.length < 2 || seen[t]) continue;
        seen[t] = 1;
        if (!idx[t]) idx[t] = [];
        idx[t].push(i);
      }
    }
    db.tokenIndex = idx;
    return idx;
  }

  function candidateIds(db, qNorm) {
    if (!qNorm) return null;

    // 1) 数据自带的前缀索引：按刊名开头的前两个字符取候选（快）
    const head = (db.prefix && db.prefix[qNorm.slice(0, 2)]) || null;

    // 2) 查询的第一个词作为「完整词」出现在哪些刊名里
    const first = qNorm.split(" ")[0];
    const idx = buildTokenIndex(db);
    const byWord = (idx && first && idx[first]) || null;

    if (head && head.length) {
      if (!byWord || !byWord.length) return head;
      const merged = new Set(head);
      for (let i = 0; i < byWord.length; i++) merged.add(byWord[i]);
      return Array.from(merged);
    }
    if (byWord && byWord.length) return byWord;
    return null; // 两者都没有 → 扫全表
  }

  function scoreName(nNorm, qNorm) {
    if (!nNorm || !qNorm) return 0;
    if (nNorm === qNorm) return 100;
    if (nNorm.startsWith(qNorm) || qNorm.startsWith(nNorm)) return 85;
    // 查询词正好是刊名里的一个完整词：
    //   Remote Sensing of Environment  ←  只输入 Environment
    // 给得比前缀匹配（85）高：用户输入一个词时，它常常正是刊名中间/末尾的词
    if (
      qNorm.indexOf(" ") < 0 &&
      (nNorm.indexOf(" " + qNorm + " ") >= 0 || nNorm.endsWith(" " + qNorm))
    ) {
      return 90;
    }
    if (nNorm.indexOf(qNorm) >= 0 || qNorm.indexOf(nNorm) >= 0) return 70;
    // cheap token overlap only if lengths similar
    if (qNorm.length >= 4 && nNorm.length >= 4) {
      const ta = nNorm.split(" ");
      const tb = qNorm.split(" ");
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
  }

  function searchJournals(query, limit) {
    limit = limit || 12;
    return loadDatabase().then(function (db) {
      const qRaw = cleanQuery(query);
      const qNorm = normName(qRaw);
      if (!qNorm && !qRaw) {
        return { meta: db.meta, query: qRaw, hits: [], total: 0 };
      }

      const hits = [];
      const issnRe = /^\d{4}-?\d{3}[\dX]$/i;
      const qIssn = qRaw.replace(/\s+/g, "").toUpperCase();
      let issnHit = "";

      // 统一在这里按原始刊名去重：前缀桶扫描与兜底扫描可能命中同一行
      const seenNames = Object.create(null);

      function consider(row, score, matched) {
        if (score < 55) return;
        const key = row[0];
        if (seenNames[key]) return;
        seenNames[key] = 1;
        hits.push({
          score: score,
          matchedName: formatJournalName(matched || row[0]),
          journal: rowToJournal(row),
        });
      }

      if (db.legacy) {
        for (let i = 0; i < db.legacy.length; i++) {
          const j = db.legacy[i];
          let best = 0;
          let matched = "";
          const names = j.names || [j.name];
          for (let k = 0; k < names.length; k++) {
            const s = scoreName(normName(names[k]), qNorm);
            if (s > best) {
              best = s;
              matched = names[k];
            }
          }
          if (issnRe.test(qIssn)) {
            const formatted =
              qIssn.length === 8
                ? qIssn.slice(0, 4) + "-" + qIssn.slice(4)
                : qIssn;
            if (
              (j.issn && j.issn.toUpperCase() === formatted) ||
              (j.eissn && j.eissn.toUpperCase() === formatted)
            ) {
              best = 110;
              matched = j.name;
            }
          }
          if (best >= 55) {
            hits.push({ score: best, matchedName: matched, journal: j });
          }
        }
      } else {
        const ids = candidateIds(db, qNorm);
        const rows = db.rows;
        const n = rows.length;
        const scan = ids || null;
        const len = scan ? scan.length : n;
        for (let i = 0; i < len; i++) {
          const idx = scan ? scan[i] : i;
          const row = rows[idx];
          if (!row) continue;

          let best = scoreName(normName(row[0]), qNorm);
          let matched = row[0];
          if (row[15]) {
            const s2 = scoreName(normName(row[15]), qNorm);
            if (s2 > best) {
              best = s2;
              matched = row[15];
            }
          }

          if (issnRe.test(qIssn)) {
            const formatted =
              qIssn.length === 8
                ? qIssn.slice(0, 4) + "-" + qIssn.slice(4)
                : qIssn;
            if (
              (row[1] && row[1].toUpperCase() === formatted) ||
              (row[2] && row[2].toUpperCase() === formatted)
            ) {
              best = 110;
              matched = row[0];
            }
          }

          // If prefix index used a weak key, also allow exact issn scan miss:
          // when qNorm is short and no hits yet, fall back handled below.
          if (best >= 55) consider(row, best, matched);
        }

        // ISSN: if prefix path missed, scan by issn (cheap)
        if (issnRe.test(qIssn) && !hits.length) {
          const formatted =
            qIssn.length === 8
              ? qIssn.slice(0, 4) + "-" + qIssn.slice(4)
              : qIssn;
          for (let i = 0; i < n; i++) {
            const row = rows[i];
            if (
              (row[1] && row[1].toUpperCase() === formatted) ||
              (row[2] && row[2].toUpperCase() === formatted)
            ) {
              consider(row, 110, row[0]);
              break;
            }
          }
        }

        // If prefix index too narrow and few hits, scan remaining for short queries
        if (hits.length < 3 && qNorm.length >= 3) {
          for (let i = 0; i < n && hits.length < 20; i++) {
            const row = rows[i];
            const best = scoreName(normName(row[0]), qNorm);
            if (best >= 70) consider(row, best, row[0]);
          }
        }
      }

      hits.sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return String(a.journal.name || "").localeCompare(
          String(b.journal.name || "")
        );
      });

      return {
        meta: db.meta,
        query: qRaw,
        hits: hits.slice(0, limit),
        total: hits.length,
      };
    });
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
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
