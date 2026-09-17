#!/usr/bin/env python3
"""Build compact gzipped journal DB for PublicationChecker extension."""
from __future__ import annotations

import csv
import gzip
import json
import re
from datetime import datetime, timezone
from pathlib import Path

BASE = Path(r"D:\Softwares\DataAnalysis\ChromePlugin\PublicationChecker")
RAW = BASE / "raw"
OUT_DIR = BASE / "data"
OUT_JSON = OUT_DIR / "journals.json"
OUT_GZ = OUT_DIR / "journals.json.gz"


def norm_issn(v: str | None) -> str:
    if not v:
        return ""
    s = re.sub(r"[^0-9Xx]", "", str(v)).upper()
    if len(s) == 8:
        return f"{s[:4]}-{s[4:]}"
    return ""


def split_issn_eissn(cell: str) -> tuple[str, str]:
    if not cell:
        return "", ""
    cell = cell.strip()
    if "/" in cell:
        a, b = cell.split("/", 1)
        return norm_issn(a), norm_issn(b)
    return norm_issn(cell), ""


def norm_name(name: str) -> str:
    s = (name or "").lower()
    s = s.replace("&amp;", "&").replace("&", " and ")
    s = re.sub(r"[^a-z0-9一-鿿]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def parse_zone_rank(cell: str) -> tuple[str, str]:
    cell = (cell or "").strip()
    if not cell:
        return "", ""
    m = re.match(r"([1-4])", cell)
    zone = f"{m.group(1)}区" if m else cell
    r = re.search(r"\[([^\]]+)\]", cell)
    return zone, (r.group(1) if r else "")


def pick_best(cats: list[tuple[str, str, str]]) -> str:
    order = {"Q1": 1, "Q2": 2, "Q3": 3, "Q4": 4, "": 9}
    if not cats:
        return ""
    return min(cats, key=lambda c: order.get(c[1], 9))[1]


def pack_pairs(items: list[tuple[str, str]]) -> str:
    return ";".join(f"{a}|{b}" for a, b in items if a or b)


def pack_cats(items: list[tuple[str, str, str]]) -> str:
    return ";".join(f"{a}|{b}|{c}" for a, b, c in items if a or b)


class Index:
    def __init__(self) -> None:
        self.by_key: dict[str, dict] = {}
        self.records: list[dict] = []

    def get_or_create(self, issn: str, eissn: str, name: str) -> dict:
        rec = None
        if issn and issn in self.by_key:
            rec = self.by_key[issn]
        elif eissn and eissn in self.by_key:
            rec = self.by_key[eissn]
        if rec is None:
            rec = {"name": (name or "").strip()}
            self.records.append(rec)
        else:
            name = (name or "").strip()
            if name and len(name) >= len(rec.get("name") or ""):
                rec["name"] = name
        if issn:
            rec["issn"] = issn
            self.by_key[issn] = rec
        if eissn:
            rec["eissn"] = eissn
            self.by_key[eissn] = rec
        return rec


def load_jcr(path: Path, index: Index) -> None:
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            issn = norm_issn(row.get("ISSN"))
            eissn = norm_issn(row.get("EISSN"))
            if not (issn or eissn):
                continue
            rec = index.get_or_create(issn, eissn, row.get("Journal") or "")
            cats = []
            for i in range(1, 7):
                cat = (row.get(f"Category_{i}") or "").strip()
                q = (row.get(f"IF Quartile(2025)_{i}") or "").strip().upper()
                rank = (row.get(f"IF Rank(2025)_{i}") or "").strip()
                if cat or q:
                    cats.append((cat, q, rank))
            rec["jcr"] = {
                "if": (row.get("IF(2025)") or "").strip(),
                "wos": (row.get("Web of Science") or "").strip(),
                "best": pick_best(cats),
                "cats": cats[:3],
            }


def load_cas(path: Path, index: Index) -> None:
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            name = (row.get("Journal") or "").strip()
            issn, eissn = split_issn_eissn(row.get("ISSN/EISSN") or "")
            if not (issn or eissn):
                continue
            rec = index.get_or_create(issn, eissn, name)
            major_zone, major_rank = parse_zone_rank(row.get("大类分区") or "")
            minors = []
            for i in range(1, 7):
                mname = (row.get(f"小类{i}") or "").strip()
                mcell = row.get(f"小类{i}分区") or ""
                if not mname and not mcell:
                    continue
                z, r = parse_zone_rank(mcell)
                minors.append((mname, z if not r else z))
            rec["cas"] = {
                "major": (row.get("大类") or "").strip(),
                "zone": major_zone,
                "rank": major_rank,
                "top": (row.get("Top") or "").strip(),
                "review": (row.get("Review") or "").strip(),
                "minors": minors[:3],
            }


def load_xinrui(path: Path, index: Index) -> None:
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            name = (row.get("刊名") or row.get("Journal") or "").strip()
            issn = norm_issn(row.get("ISSN"))
            eissn = norm_issn(row.get("EISSN"))
            if not (issn or eissn):
                continue
            rec = index.get_or_create(issn, eissn, name)
            minors = []
            for i in range(1, 7):
                mname = (
                    row.get(f"小类{i}中文名") or row.get(f"小类{i}英文名") or ""
                ).strip()
                mzone = (row.get(f"小类{i}新锐分区") or "").strip().replace(" ", "")
                if not mname and not mzone:
                    continue
                minors.append((mname, mzone))
            cn = (row.get("中文刊名") or "").strip()
            if cn:
                rec["cn"] = cn
            rec["xr"] = {
                "major": (row.get("大类中文名") or row.get("大类英文名") or "").strip(),
                "zone": (row.get("大类新锐分区") or "").strip().replace(" ", ""),
                "top": (row.get("Top") or "").strip(),
                "warn": (row.get("预警标记") or "").strip(),
                "publisher": (row.get("出版机构") or "").strip(),
                "lang": (row.get("语种") or "").strip(),
                "minors": minors[:3],
            }


def load_warnings(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.exists():
        return out
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            name = (row.get("Journal") or "").strip()
            reason = (row.get("预警原因（2025）") or "").strip()
            if name:
                out[norm_name(name)] = reason
    return out


def main() -> None:
    index = Index()
    load_jcr(RAW / "JCR2025-UTF8.csv", index)
    load_cas(RAW / "FQBJCR2025-UTF8.csv", index)
    load_xinrui(RAW / "XR2026-UTF8.csv", index)
    warnings = load_warnings(RAW / "GJQKYJMD2025.csv")

    rows = []
    # Prefix index: first 2 chars of normalized name -> row indices (small, speeds search)
    prefix: dict[str, list[int]] = {}

    for rec in index.records:
        name = (rec.get("name") or "").strip()
        if not name or len(name) < 2:
            continue
        if not any(k in rec for k in ("jcr", "cas", "xr")):
            continue

        jcr = rec.get("jcr") or {}
        cas = rec.get("cas") or {}
        xr = rec.get("xr") or {}
        warn = warnings.get(norm_name(name)) or ""

        # row layout
        # 0 name, 1 issn, 2 eissn, 3 if, 4 jcrQ, 5 wos, 6 jcrCats,
        # 7 casZ, 8 casMajor, 9 casTop, 10 casMinors,
        # 11 xrZ, 12 xrMajor, 13 xrTop, 14 warn, 15 cn, 16 xrMinors,
        # 17 publisher, 18 review(综述), 19 lang
        row = [
            name,
            rec.get("issn") or "",
            rec.get("eissn") or "",
            jcr.get("if") or "",
            jcr.get("best") or "",
            jcr.get("wos") or "",
            pack_cats(jcr.get("cats") or []),
            cas.get("zone") or "",
            cas.get("major") or "",
            cas.get("top") or "",
            pack_pairs(cas.get("minors") or []),
            xr.get("zone") or "",
            xr.get("major") or "",
            xr.get("top") or "",
            warn,
            rec.get("cn") or "",
            pack_pairs(xr.get("minors") or []),
            (xr.get("publisher") or "")[:80],
            cas.get("review") or "",
            xr.get("lang") or "",
        ]
        idx = len(rows)
        rows.append(row)

        for n in (name, rec.get("cn") or ""):
            nn = norm_name(n)
            if len(nn) >= 2:
                key = nn[:2]
                bucket = prefix.get(key)
                if bucket is None:
                    prefix[key] = [idx]
                elif idx not in bucket:
                    # avoid huge buckets; cap stored ids
                    if len(bucket) < 400:
                        bucket.append(idx)

    # sort rows by name for stable output (prefix indices stay valid)
    order = sorted(range(len(rows)), key=lambda i: rows[i][0].lower())
    remap = {old: new for new, old in enumerate(order)}
    rows2 = [rows[i] for i in order]
    prefix2: dict[str, list[int]] = {}
    for k, ids in prefix.items():
        new_ids = sorted({remap[i] for i in ids if i in remap})
        if new_ids:
            prefix2[k] = new_ids

    payload = {
        "v": 2,
        "meta": {
            "builtAt": datetime.now(timezone.utc).isoformat(),
            "jcr": "2025",
            "cas": "2025升级版",
            "xinrui": "2026",
            "source": "hitfyd/ShowJCR",
            "count": len(rows2),
        },
        "rows": rows2,
        "prefix": prefix2,
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode(
        "utf-8"
    )
    OUT_JSON.write_bytes(raw)
    with gzip.open(OUT_GZ, "wb", compresslevel=9) as gz:
        gz.write(raw)

    n_jcr = sum(1 for r in rows2 if r[4])
    n_cas = sum(1 for r in rows2 if r[7])
    n_xr = sum(1 for r in rows2 if r[11])
    print(f"journals={len(rows2)} jcr={n_jcr} cas={n_cas} xinrui={n_xr}")
    print(f"json={OUT_JSON.stat().st_size} gz={OUT_GZ.stat().st_size}")

    # sample
    for probe in ["Nature Communications", "Remote Sensing of Environment"]:
        pn = norm_name(probe)
        key = pn[:2]
        ids = prefix2.get(key, [])
        hits = []
        for i in ids:
            n = norm_name(rows2[i][0])
            if n == pn:
                hits.append(rows2[i])
        print(probe, "->", [(h[0], h[4], h[7], h[11], h[3]) for h in hits[:2]])


if __name__ == "__main__":
    main()
