#!/usr/bin/env python3
"""
!!! PLEASE ONLY MANUALLY RUN THIS AND DONT AUTOMATICALLY SCRAPE FTC-EVENTS !!!

Convert an FTC Events pit map page into ApiV3PitMap JSON.

Spec: https://github.com/maths22/ftc-api-v3-client-ruby/blob/master/docs/ApiV3PitMap.md
      (keys use the API's camelCase names from the client's attribute_map)

The pit map page (https://ftc-events.firstinspires.org/<season>/<EVENT>/pitMap)
embeds its data in `window.pitMapConfig`; team names come from the
"Participating Teams" table on the same page.

Usage:
  python3 pitmap_to_json.py 2025 FPEEUR                 # -> FPEEUR_pitmap.json
  python3 pitmap_to_json.py 2025 FPEEUR USCHSCMP -o out/ # several events, into a folder
  python3 pitmap_to_json.py https://ftc-events.firstinspires.org/2025/FPEEUR/pitMap
  python3 pitmap_to_json.py --html saved_page.html       # offline, from a saved page
  python3 pitmap_to_json.py 2025 FPEEUR --stdout         # print instead of writing

Options:
  -o, --out PATH        Output file (one event) or directory (several events).
  --include-nulls       Write optional fields that have no value as null
                        (default: omit them).
  --compact             Write minified JSON instead of indented.

Requires Python 3.8+, no third-party packages.
"""

import argparse
import html
import json
import os
import re
import sys
import urllib.error
import urllib.request

BASE_URL = "https://ftc-events.firstinspires.org"

# Order of ApiV3PitMapCellType in the client library; the page stores the index.
CELL_TYPES = ["EMPTY", "BOUNDARY", "PIT", "HORIZONTAL_FIELD",
              "VERTICAL_FIELD", "OBJECT", "LABEL"]


class PitMapError(Exception):
    pass


# ---------------------------------------------------------------- fetching

def fetch_html(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": "pitmap_to_json/1.0 (+https://github.com/maths22/ftc-api-v3-client-ruby)",
        "Accept": "text/html",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            charset = resp.headers.get_content_charset() or "utf-8"
            return resp.read().decode(charset, errors="replace")
    except urllib.error.HTTPError as e:
        hint = (" (the site returns this for events without a pit map, "
                "or a wrong season/event code)") if e.code in (404, 500) else ""
        raise PitMapError(f"{url}: HTTP {e.code}{hint}") from None
    except urllib.error.URLError as e:
        raise PitMapError(f"{url}: {e.reason}") from None


def pitmap_url(season, event):
    return f"{BASE_URL}/{season}/{event}/pitMap"


# ----------------------------------------------------------------- parsing

def _config_source(page):
    m = re.search(r"window\.pitMapConfig\s*=\s*\{", page)
    if not m:
        raise PitMapError("no window.pitMapConfig on the page "
                          "(event has no published pit map, or wrong URL)")
    end = page.find("</script>", m.end())
    return page[m.end() - 1: end if end != -1 else None]


def _json_after(src, key, opener):
    """Decode the JSON value ([...] or {...}) that follows `key:` in src."""
    m = re.search(r"\b" + re.escape(key) + r"\s*:\s*", src)
    if not m or not src.startswith(opener, m.end()):
        return None
    value, _ = json.JSONDecoder().raw_decode(src, m.end())
    return value


def _js_bool(src, key):
    m = re.search(r"\b" + re.escape(key) + r"\s*:\s*([^,\n}]+)", src)
    if not m:
        return None
    expr = m.group(1).strip()
    # Server renders e.g.  numbers: 'True' === 'True'
    cmp = re.fullmatch(r"""(['"])(.*?)\1\s*===?\s*(['"])(.*?)\3""", expr)
    if cmp:
        return cmp.group(2) == cmp.group(4)
    if expr in ("true", "false"):
        return expr == "true"
    raise PitMapError(f"cannot interpret {key}: {expr!r}")


def parse_config(page):
    src = _config_source(page)
    data = _json_after(src, "data", "[")
    if data is None:
        raise PitMapError("pitMapConfig has no data array")
    width_m = re.search(r"\bwidth\s*:\s*['\"]?(\d+)", src)
    return {
        "data": data,
        "width": int(width_m.group(1)) if width_m else None,
        "displayNumbers": _json_after(src, "displayNumbers", "{") or {},
        "numbers": _js_bool(src, "numbers"),
        "address": _js_bool(src, "address"),
    }


_ROW_RE = re.compile(r"<tr\b[^>]*\bteamRow\b.*?</tr>", re.S | re.I)
_TEAM_RE = re.compile(r'data-team="([^"]+)"')
_NAME_RE = re.compile(r'<td\b[^>]*\bteamnamecol\b[^>]*>(.*?)</td>', re.S | re.I)
_TAG_RE = re.compile(r"<[^>]+>")


def parse_team_names(page):
    names = {}
    for row in _ROW_RE.findall(page):
        t, n = _TEAM_RE.search(row), _NAME_RE.search(row)
        if t and n:
            names[t.group(1).strip()] = html.unescape(_TAG_RE.sub("", n.group(1))).strip()
    return names


# -------------------------------------------------------------- conversion

def convert(cfg, names, include_nulls=False):
    display = {str(k): str(v) for k, v in cfg["displayNumbers"].items()}
    elements = []
    for i, e in enumerate(cfg["data"]):
        t = e.get("type")
        if not isinstance(t, int) or not 0 <= t < len(CELL_TYPES):
            raise PitMapError(f"element {i}: unknown cell type {t!r}")

        team = None
        if e.get("team") is not None:
            num = str(e["team"])
            team = {"number": num,
                    "name": names.get(num),
                    "displayNumber": display.get(num, num)}

        label = e.get("label")
        el = {
            "type": CELL_TYPES[t],
            "x": e["x"], "y": e["y"],
            "width": e["w"], "height": e["h"],
            "label": label,
            "labelOrientation": (("VERTICAL" if e.get("labelRotated") else "HORIZONTAL")
                                 if label is not None else None),
            "index": e.get("ind"),
            "team": team,
            "address": e.get("address"),
            "addressGroup": e.get("addressGroup"),
            "color": e.get("color"),
        }
        if not include_nulls:
            el = {k: v for k, v in el.items() if v is not None}
        elements.append(el)

    if elements:
        min_x = min(e["x"] for e in elements)
        min_y = min(e["y"] for e in elements)
        width = max(e["x"] + e["width"] for e in elements) - min_x
        height = max(e["y"] + e["height"] for e in elements) - min_y
    else:
        min_x = min_y = width = height = 0
    # The page's configured grid width can be larger than the drawn content.
    if cfg["width"] and min_x == 0:
        width = max(width, cfg["width"])

    return {
        "minX": min_x, "minY": min_y,
        "width": width, "height": height,
        "showPitNumbers": bool(cfg["numbers"]) if cfg["numbers"] is not None else True,
        "showPitAddresses": bool(cfg["address"]) if cfg["address"] is not None else False,
        "elements": elements,
    }


def pitmap_from_html(page, include_nulls=False):
    cfg = parse_config(page)
    names = parse_team_names(page)
    pm = convert(cfg, names, include_nulls)
    missing = sorted({e["team"]["number"] for e in pm["elements"]
                      if e.get("team") and not e["team"].get("name")}, key=int)
    if missing:
        print(f"  warning: no team name found for {', '.join(missing)}", file=sys.stderr)
    return pm


# --------------------------------------------------------------------- CLI

def _targets(args):
    """Yield (label, url) from positional args: a season + event codes, or URLs."""
    pos = list(args.targets)
    if pos and re.fullmatch(r"\d{4}", pos[0]):
        season = pos.pop(0)
        if not pos:
            raise PitMapError("give at least one event code after the season")
        for code in pos:
            if code.startswith("http"):
                raise PitMapError("don't mix a season with URLs")
            yield code.upper(), pitmap_url(season, code.upper())
    else:
        for u in pos:
            m = re.search(r"/(\d{4})/([^/]+)/?(?:pitMap)?/?$", u, re.I)
            if not u.startswith("http") or not m:
                raise PitMapError(f"not a season+event or pitMap URL: {u}")
            yield m.group(2).upper(), pitmap_url(m.group(1), m.group(2))


def main(argv=None):
    p = argparse.ArgumentParser(
        description="Convert FTC Events pit map pages to ApiV3PitMap JSON.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="examples:\n  %(prog)s 2025 FPEEUR\n  %(prog)s 2025 FPEEUR USCHSCMP -o out/\n"
               "  %(prog)s --html saved.html -o map.json")
    p.add_argument("targets", nargs="*",
                   help="SEASON EVENT [EVENT ...], or one or more pitMap URLs")
    p.add_argument("--html", metavar="FILE", help="parse a saved page instead of downloading")
    p.add_argument("-o", "--out", help="output file (one event) or directory (several)")
    p.add_argument("--stdout", action="store_true", help="print JSON instead of writing files")
    p.add_argument("--include-nulls", action="store_true",
                   help="write empty optional fields as null instead of omitting them")
    p.add_argument("--compact", action="store_true", help="minified JSON")
    args = p.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # team names can be non-ASCII

    dump = (lambda o, f: json.dump(o, f, ensure_ascii=False, separators=(",", ":"))) \
        if args.compact else (lambda o, f: json.dump(o, f, ensure_ascii=False, indent=2))

    try:
        if args.html:
            with open(args.html, encoding="utf-8") as f:
                jobs = [(os.path.splitext(os.path.basename(args.html))[0], f.read())]
        else:
            if not args.targets:
                p.error("give SEASON EVENT, a pitMap URL, or --html FILE")
            jobs = [(label, url) for label, url in _targets(args)]
    except PitMapError as e:
        p.error(str(e))

    many = len(jobs) > 1
    if many and args.out and not args.stdout:
        os.makedirs(args.out, exist_ok=True)

    failures = 0
    for label, src in jobs:
        try:
            if args.html:
                page = src
            else:
                print(f"{label}: fetching {src}", file=sys.stderr)
                page = fetch_html(src)
            pm = pitmap_from_html(page, args.include_nulls)
        except (PitMapError, json.JSONDecodeError) as e:
            failures += 1
            print(f"{label}: ERROR {e}", file=sys.stderr)
            continue

        if args.stdout:
            dump(pm, sys.stdout)
            sys.stdout.write("\n")
        else:
            if many:
                path = os.path.join(args.out or ".", f"{label}_pitmap.json")
            else:
                path = args.out or f"{label}_pitmap.json"
                if os.path.isdir(path):
                    path = os.path.join(path, f"{label}_pitmap.json")
            with open(path, "w", encoding="utf-8") as f:
                dump(pm, f)
                f.write("\n")
            pits = sum(1 for e in pm["elements"] if e["type"] == "PIT")
            teams = sum(1 for e in pm["elements"] if e.get("team"))
            print(f"{label}: {len(pm['elements'])} elements, {pits} pits, "
                  f"{teams} teams, {pm['width']}x{pm['height']} -> {path}", file=sys.stderr)

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
