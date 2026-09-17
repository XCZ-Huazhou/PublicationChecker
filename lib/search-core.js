/**
 * 离线检索核心（经典脚本）
 * 加载 data/journals.json.gz（紧凑数组格式 + 前缀索引）
 */
(function (root) {
  "use strict";

  let cachePromise = null;

  function runtimeGetURL(path) {
    const api =
      typeof root.browser !== "undefined" && root.browser?.runtime
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

  function rowToJournal(row) {
    return {
      name: row[0],
      issn: row[1],
      eissn: row[2],
      jcr: {
        if: row[3],
        best: row[4],
        wos: row[5],
        cats: unpackCats(row[6]),
      },
      cas: row[7]
        ? {
            zone: row[7],
            major: row[8],
            top: row[9],
            minors: unpackPairs(row[10]),
          }
        : null,
      xr: row[11]
        ? {
            zone: row[11],
            major: row[12],
            top: row[13],
            minors: unpackPairs(row[16] || ""),
          }
        : null,
      warn: row[14] || "",
      cn: row[15] || "",
      names: row[15] ? [row[0], row[15]] : [row[0]],
    };
  }

  // restore xr minors from packed if we stored them - actually we skipped packing xr minors in row
  // Fix: pack xr minors into row[13] is top; we need minors. Update row layout usage:
  // Keep as-is for size; expand xr minors from empty - better pack them.
  // We'll repack: row[12] major, row[13] top - minors missing.
  // Re-parse from a dedicated field if present in v2 - see build: we should add xr minors.
  // For now expand from packed string if we put it in row[13] as top|we'll fix build.

  function loadDatabase() {
    if (cachePromise) return cachePromise;

    cachePromise = (async function () {
      const url = runtimeGetURL("data/journals.json.gz");
      const res = await fetch(url);
      if (!res.ok) {
        // fallback uncompressed
        const res2 = await fetch(runtimeGetURL("data/journals.json"));
        if (!res2.ok) throw new Error("无法加载本地期刊库");
        const data = await res2.json();
        return normalizePayload(data);
      }
      const buf = await res.arrayBuffer();
      const data = await gunzip(buf);
      return normalizePayload(data);
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

  function candidateIds(db, qNorm) {
    if (!qNorm) return null;
    const key = qNorm.slice(0, 2);
    const ids = db.prefix && db.prefix[key];
    if (ids && ids.length) return ids;
    return null; // scan all
  }

  function scoreName(nNorm, qNorm) {
    if (!nNorm || !qNorm) return 0;
    if (nNorm === qNorm) return 100;
    if (nNorm.startsWith(qNorm) || qNorm.startsWith(nNorm)) return 85;
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

      function consider(row, score, matched) {
        if (score >= 55) {
          hits.push({
            score: score,
            matchedName: matched || row[0],
            journal: rowToJournal(row),
          });
        }
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
          const seen = new Set(hits.map(function (h) {
            return h.journal.name;
          }));
          for (let i = 0; i < n && hits.length < 20; i++) {
            const row = rows[i];
            const best = scoreName(normName(row[0]), qNorm);
            if (best >= 70 && !seen.has(row[0])) {
              seen.add(row[0]);
              consider(row, best, row[0]);
            }
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

  function letpubSearchUrl(name) {
    return (
      "https://www.letpub.com.cn/index.php?page=journalapp&view=search&searchname=" +
      encodeURIComponent(name || "")
    );
  }

  root.PublicationChecker = {
    normName: normName,
    cleanQuery: cleanQuery,
    loadDatabase: loadDatabase,
    searchJournals: searchJournals,
    letpubSearchUrl: letpubSearchUrl,
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
