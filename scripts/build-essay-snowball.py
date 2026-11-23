#!/usr/bin/env python3
"""Build writing/snowball-or-napoleon/index.html from the essay markdown.

Usage: python3 scripts/build-essay-snowball.py <essay.md>
The markdown is mirrored in second-brain drafts/essay-snowball-or-napoleon.md.
Everything from "# Snowball or Napoleon?" up to "## References" is rendered
verbatim. [FIGURE: hours] becomes the hand-built hours chart (data below, from
Our World in Data). After building, run `npm run nav`, `npm run sitemap`,
`npm run llms` and `npm run feed`, then scripts/snap-figures.mjs for fig-1.png.

Inline links (LINKS) are attached to exact phrases already in the text; the build
fails if a phrase is missing or appears more than once.
"""
import html, re, sys, pathlib

SLUG = "snowball-or-napoleon"
SRC = pathlib.Path(sys.argv[1]).read_text()
OUT = pathlib.Path(__file__).resolve().parent.parent / "writing" / SLUG / "index.html"
DATE_PUBLISHED = "2026-11-24"

body_md = SRC[SRC.index("# Snowball or Napoleon?"):SRC.index("## References")]

# ---------- inline links: (exact phrase in the markdown, url, external) ----------
LINKS = [
    ("Which love?", "/writing/which-love", False),
]
text_only = "\n\n".join(b for b in re.split(r"\n\s*\n", body_md) if not b.strip().startswith("["))
for phrase, _, _ in LINKS:
    n = text_only.count(phrase)
    if n != 1:
        sys.exit(f"link phrase {phrase!r} found {n} times (want exactly 1)")

def smart(s):
    s = re.sub(r'"([^"]*)"', "\u201c\\1\u201d", s)
    s = re.sub(r"(^|[\s\u201c(])'", "\\1\u2018", s)   # opening single quote
    return s.replace("'", "\u2019")

def inline(s):
    tokens = {}
    for i, (phrase, url, ext) in enumerate(LINKS):
        if phrase in s:
            tok = f"\x00L{i}\x00"
            s = s.replace(phrase, tok)
            tokens[tok] = (phrase, url, ext)
    s = html.escape(smart(s), quote=False)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<em>\1</em>", s)
    for tok, (phrase, url, ext) in tokens.items():
        attrs = ' target="_blank" rel="noopener"' if ext else ""
        s = s.replace(tok, f'<a href="{url}"{attrs}>{html.escape(smart(phrase), quote=False)}</a>')
    return s

# ---------- the hours chart (hand-built; never AI images, never stock) ----------
# Working hours per worker per year. Huberman and Minns (2005) and Penn World Table 11.0,
# processed by Our World in Data (grapher/annual-working-hours-per-worker, updated
# 2025-08-05), fetched 24 Nov 2026.
HOURS = {
    "UK": [(1870, 2755), (1880, 2740), (1890, 2669), (1900, 2656), (1913, 2656), (1929, 2257), (1938, 2200), (1950, 2023), (1951, 2031), (1952, 2001), (1953, 2005), (1954, 2009), (1955, 2007), (1956, 1995), (1957, 1975), (1958, 1947), (1959, 1956), (1960, 1948), (1961, 1914), (1962, 1879), (1963, 1871), (1964, 1872), (1965, 1850), (1966, 1798), (1967, 1787), (1968, 1780), (1969, 1771), (1970, 1733), (1971, 1695), (1972, 1715), (1973, 1723), (1974, 1709), (1975, 1680), (1976, 1674), (1977, 1683), (1978, 1684), (1979, 1681), (1980, 1654), (1981, 1620), (1982, 1616), (1983, 1611), (1984, 1617), (1985, 1619), (1986, 1614), (1987, 1618), (1988, 1625), (1989, 1629), (1990, 1617), (1991, 1593), (1992, 1588), (1993, 1584), (1994, 1593), (1995, 1595), (1996, 1595), (1997, 1594), (1998, 1590), (1999, 1582), (2000, 1568), (2001, 1571), (2002, 1555), (2003, 1546), (2004, 1544), (2005, 1546), (2006, 1541), (2007, 1543), (2008, 1538), (2009, 1517), (2010, 1522), (2011, 1519), (2012, 1531), (2013, 1540), (2014, 1546), (2015, 1543), (2016, 1541), (2017, 1542), (2018, 1537), (2019, 1545), (2020, 1392), (2021, 1490), (2022, 1529), (2023, 1523)],
    "Australia": [(1870, 2792), (1880, 2647), (1890, 2501), (1900, 2385), (1913, 2214), (1929, 2186), (1938, 2109), (1950, 2030), (1951, 2011), (1952, 1992), (1953, 1974), (1954, 1955), (1955, 1937), (1956, 1919), (1957, 1902), (1958, 1884), (1959, 1867), (1960, 1849), (1961, 1846), (1962, 1843), (1963, 1839), (1964, 1836), (1965, 1832), (1966, 1829), (1967, 1826), (1968, 1822), (1969, 1819), (1970, 1816), (1971, 1798), (1972, 1779), (1973, 1767), (1974, 1783), (1975, 1770), (1976, 1780), (1977, 1782), (1978, 1783), (1979, 1788), (1980, 1785), (1981, 1771), (1982, 1751), (1983, 1734), (1984, 1754), (1985, 1746), (1986, 1750), (1987, 1748), (1988, 1745), (1989, 1755), (1990, 1741), (1991, 1728), (1992, 1725), (1993, 1740), (1994, 1745), (1995, 1746), (1996, 1749), (1997, 1746), (1998, 1735), (1999, 1724), (2000, 1738), (2001, 1716), (2002, 1698), (2003, 1694), (2004, 1686), (2005, 1686), (2006, 1677), (2007, 1674), (2008, 1678), (2009, 1672), (2010, 1655), (2011, 1660), (2012, 1662), (2013, 1653), (2014, 1656), (2015, 1650), (2016, 1644), (2017, 1642), (2018, 1634), (2019, 1632), (2020, 1601), (2021, 1598), (2022, 1588), (2023, 1611)],
}
# Categorical pair validated with the dataviz validator against --bg-soft #F1ECDC (all checks pass).
COLOURS = {"UK": "#2F6FA0", "Australia": "#C2703D"}
KEYNES = 750  # fifteen hours a week over 50 working weeks
X0, X1, YMAX = 1870, 2023, 3200

def chart_svg(w, h, left, right, top, bottom, cls, label_dy):
    pw, ph = w - left - right, h - top - bottom
    X = lambda yr: left + (yr - X0) / (X1 - X0) * pw
    Y = lambda v: top + (1 - v / YMAX) * ph
    p = [f'<svg class="{cls}" viewBox="0 0 {w} {h}" role="img" aria-label="Line chart: hours worked per worker per year fell from about 2,800 in 1870 to about 1,500 in the UK and 1,600 in Australia by 2023, still about twice the 750 hours of a fifteen-hour week." xmlns="http://www.w3.org/2000/svg">']
    p.append(f'<text class="d-label" x="{left - 8 - (34 if w > 400 else 30)}" y="16" style="font-size:15px">Hours worked per worker, per year</text>')
    for v in (0, 1000, 2000, 3000):
        y = Y(v)
        p.append(f'<line x1="{left}" y1="{y:.1f}" x2="{left + pw}" y2="{y:.1f}" stroke="var(--rule)" stroke-width="1"/>')
        p.append(f'<text class="d-small" x="{left - 8}" y="{y + 5:.1f}" text-anchor="end">{v:,}</text>')
    for yr in (1870, 1900, 1930, 1960, 1990, 2020):
        p.append(f'<text class="d-small" x="{X(yr):.1f}" y="{top + ph + 24}" text-anchor="middle">{yr}</text>')
    # 1930 marker: the year of Keynes's essay
    x30 = X(1930)
    p.append(f'<line x1="{x30:.1f}" y1="{top}" x2="{x30:.1f}" y2="{top + ph}" stroke="var(--ink-faint)" stroke-width="1" stroke-dasharray="2 4"/>')
    p.append(f'<text class="d-small" x="{x30 + 6:.1f}" y="{top + 14}">Keynes, 1930</text>')
    # Keynes's fifteen-hour week
    yk = Y(KEYNES)
    p.append(f'<line x1="{left}" y1="{yk:.1f}" x2="{left + pw}" y2="{yk:.1f}" stroke="var(--ink-deep)" stroke-width="1.5" stroke-dasharray="6 5"/>')
    p.append(f'<text class="d-small" x="{left + 6}" y="{yk - 8:.1f}">Fifteen-hour week</text>')
    # series
    for name, pts in HOURS.items():
        d = " ".join(f"{'M' if i == 0 else 'L'}{X(yr):.1f},{Y(v):.1f}" for i, (yr, v) in enumerate(pts))
        p.append(f'<path d="{d}" fill="none" stroke="{COLOURS[name]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>')
    for name, pts in HOURS.items():
        yr, v = pts[-1]
        p.append(f'<circle cx="{X(yr):.1f}" cy="{Y(v):.1f}" r="3.5" fill="{COLOURS[name]}" stroke="var(--bg-soft)" stroke-width="2"/>')
        p.append(f'<text class="d-label" x="{X(yr) + 9:.1f}" y="{Y(v) + 5 + label_dy[name]:.1f}" style="font-size:15px">{name} {v:,}</text>')
    # hover layer: generous invisible hit targets with native tooltips
    for name, pts in HOURS.items():
        for yr, v in pts:
            p.append(f'<circle cx="{X(yr):.1f}" cy="{Y(v):.1f}" r="7" fill="transparent"><title>{name}, {yr}: {v:,} hours</title></circle>')
    p.append("</svg>")
    return "".join(p)

def hours_figure():
    wide = chart_svg(720, 400, 58, 132, 40, 40, "only-wide", {"Australia": -7, "UK": 7})
    narrow = chart_svg(360, 330, 46, 120, 40, 40, "only-narrow", {"Australia": -8, "UK": 8})
    cap = ("Hours actually worked per worker each year, UK and Australia, 1870 to 2023. "
           "The dashed line is Keynes's fifteen-hour week, taken as 15 hours over 50 weeks (750 hours). "
           "Source: Huberman and Minns (2005) and Penn World Table 11.0, via Our World in Data.")
    return (f'<figure class="essay-figure diagram" aria-label="Chart: hours worked per worker per year, UK and Australia, 1870 to 2023, against a fifteen-hour week">'
            f'{wide}{narrow}<figcaption>{inline(cap)}</figcaption></figure>')

FIGURES = {"[FIGURE: hours]": hours_figure}

# ---------- body ----------
blocks = [b.strip() for b in re.split(r"\n\s*\n", body_md) if b.strip()]
title_md = blocks.pop(0)
TITLE = title_md.lstrip("#").strip()
dek = blocks.pop(0).strip("*")
out = []
for b in blocks:
    lines = [l for l in b.split("\n") if l.strip()]
    if b.startswith("## "):
        h = b[3:].strip()
        hid = re.sub(r"[^a-z0-9]+", "-", h.lower()).strip("-")
        out.append(f'<h2 id="{hid}">{inline(h)}</h2>')
    elif b in FIGURES:
        out.append(FIGURES[b]())
    elif b.startswith("["):
        sys.exit(f"unknown block {b!r}")
    else:
        out.append(f"<p>{inline(' '.join(lines))}</p>")

words = len(re.findall(r"\w+", text_only))
minutes = max(1, round(words / 230))
e_title = html.escape(TITLE)
e_dek = html.escape(smart(dek))
url = f"https://crads-ai.com/writing/{SLUG}"
OG_IMG = f"https://crads-ai.com/writing/{SLUG}/og.jpg"
jsonld_desc = smart(dek).replace("\\", "\\\\").replace('"', '\\"')

def ref(rid, text, url=None):
    link = f' <a class="ref-link" href="{url}" target="_blank" rel="noopener">link</a>' if url else ""
    return f'<li id="ref-{rid}">{text}{link}</li>'

_refs_md = SRC[SRC.index("## References"):]
_items = []
for _line in _refs_md.splitlines():
    if not _line.startswith("- "):
        continue
    _t = _line[2:].strip()
    _m = re.search(r"\s(https?://\S+)$", _t)
    _url = _m.group(1) if _m else None
    if _m:
        _t = _t[:_m.start()].strip()
    _t = html.escape(smart(_t), quote=False)
    _t = re.sub(r"\*(.+?)\*", r"<em>\1</em>", _t)
    _items.append(ref(f"r{len(_items)}", _t, _url))
REF_GROUPS = [("Sources", _items)]
REFS_HTML = (
    '\n    <section class="essay-refs" id="references">\n      <details>\n        <summary>References</summary>\n        '
    + "".join(f"<h3>{h}</h3><ul>{''.join(items)}</ul>" for h, items in REF_GROUPS)
    + "\n      </details>\n    </section>"
)

PAGE = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<link rel="icon" type="image/png" sizes="64x64" href="/lib/img/favicon.png">
<link rel="icon" type="image/x-icon" href="/lib/img/favicon.ico">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{e_title} · Sam Davis</title>
<meta name="description" content="{e_dek}">
<link rel="stylesheet" href="/lib/site.css">
<script defer src="/lib/site.js"></script>
<link rel="canonical" href="{url}">
<link rel="alternate" type="application/rss+xml" title="Sam Davis · Writing" href="/writing/feed.xml">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Crads-AI">
<meta property="og:url" content="{url}">
<meta property="og:title" content="{e_title} · Sam Davis">
<meta property="og:description" content="{e_dek}">
<meta property="og:image" content="{OG_IMG}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="The title Snowball or Napoleon? beside a line chart of hours worked per worker since 1870, still far above a fifteen-hour week">
<meta name="author" content="Sam Davis">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{e_title}">
<meta name="twitter:description" content="{e_dek}">
<meta name="twitter:image" content="{OG_IMG}">
<script type="application/ld+json">
{{"@context":"https://schema.org","@type":"Article","headline":"{TITLE}","description":"{jsonld_desc}",
"author":{{"@id":"https://crads-ai.com/#sam-davis","@type":"Person","name":"Sam Davis","url":"https://crads-ai.com/about"}},
"image":"{OG_IMG}","datePublished":"{DATE_PUBLISHED}","mainEntityOfPage":"{url}"}}
</script>
<link rel="stylesheet" href="/writing/essay.css">
</head>
<body class="essay-page">

<nav class="site-nav-bar" aria-label="Primary">
</nav>

<main class="essay">
  <header class="essay-head">
    <p class="eyebrow"><a href="/writing">Writing</a> · Essay · {minutes} min read</p>
    <h1>{e_title}</h1>
    <p class="essay-dek">{inline(dek)}</p>
    <p class="essay-byline"><img src="/lib/img/sam-photo.jpg" alt="" width="36" height="36"> Sam Davis · November 2026</p>
    <p class="essay-process">Built from my own ideas and stories, with Claude as a drafting partner.</p>
  </header>

  <article class="essay-body">
{chr(10).join(out)}{REFS_HTML}
  </article>
</main>

<footer class="site-footer wrap">
</footer>

</body>
</html>
"""
if "\u2014" in PAGE or "\u2013" in PAGE:
    sys.exit("em or en dash in output")
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(PAGE)
print(f"wrote {OUT} ({words} words, {minutes} min)")
