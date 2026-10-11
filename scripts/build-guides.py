#!/usr/bin/env python3
"""Build /guides (index + one page per guide) from the guide drafts.

Usage: python3 scripts/build-guides.py <dir-of-guide-markdown>
The drafts live in second-brain `drafts/search-pages/<name>.md`. Each carries a
`## Header` block (Proposed slug, Title tag, Meta description) and a
`## Page body` section; only the page body is published. The brief, voice check
and sources above it are internal and never rendered.

Guides are buyer-facing answers to the problems that come up in AI roadmap
calls. One call to action each (the roadmap), no client names, no quotes from
calls, no prices. After building, run `npm run nav`, `npm run sitemap` and
`npm run llms`.
"""
import html, json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC_DIR = pathlib.Path(sys.argv[1])
SITE = "https://crads-ai.com"
PUBLISHED = "2026-10-11"
# Index order: the broadest problem first.
ORDER = ["ai-in-silos.md", "proposals-and-quotes.md", "social-media-posting.md"]
PROCESS_NOTE = "Built from what comes up in my AI roadmap calls, with Claude as a drafting partner."


def header_field(src, label):
    m = re.search(r"\*\*" + re.escape(label) + r"[^*]*:\*\*\s*(.+)", src)
    if not m:
        sys.exit(f"missing header field {label!r}")
    return m.group(1).strip().strip("`")


def smart(s):
    s = re.sub(r'"([^"]*)"', "“\\1”", s)
    return s.replace("'", "’")


def inline(s):
    links = []

    def keep(m):
        links.append((m.group(1), m.group(2)))
        return f"\x00{len(links) - 1}\x00"

    s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", keep, s)
    s = html.escape(smart(s), quote=False)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<em>\1</em>", s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    for i, (text, url) in enumerate(links):
        url = url.replace(SITE, "") if url.startswith(SITE) else url
        ext = url.startswith("http")
        attrs = ' target="_blank" rel="noopener"' if ext else ""
        s = s.replace(f"\x00{i}\x00", f'<a href="{html.escape(url)}"{attrs}>{html.escape(smart(text), quote=False)}</a>')
    return s


def render(md):
    """Headings, paragraphs, ordered and unordered lists. The guides use nothing else."""
    out = []
    for block in re.split(r"\n\s*\n", md.strip()):
        lines = block.strip().split("\n")
        first = lines[0]
        if first.startswith("## "):
            out.append(f"<h2>{inline(first[3:])}</h2>")
        elif first.startswith("### "):
            out.append(f"<h3>{inline(first[4:])}</h3>")
        elif re.match(r"\d+\. ", first):
            items = [re.sub(r"^\d+\.\s+", "", l) for l in lines]
            out.append("<ol>" + "".join(f"<li>{inline(i)}</li>" for i in items) + "</ol>")
        elif first.startswith("- "):
            out.append("<ul>" + "".join(f"<li>{inline(l[2:])}</li>" for l in lines) + "</ul>")
        elif re.fullmatch(r"\[[^\]]+\]\([^)]+\)", first) and len(lines) == 1:
            m = re.fullmatch(r"\[([^\]]+)\]\(([^)]+)\)", first)
            href = m.group(2).replace(SITE, "")
            out.append(f'<p class="guide-cta"><a class="cta-primary" href="{html.escape(href)}">{html.escape(smart(m.group(1)), quote=False)}</a></p>')
        else:
            out.append(f"<p>{inline(' '.join(l.strip() for l in lines))}</p>")
    return "\n".join(out)


def read_guide(path):
    src = path.read_text()
    body = src.split("## Page body", 1)[1]
    h1 = re.search(r"^# (.+)$", body, re.M).group(1).strip()
    body = body[body.index(h1) + len(h1):]
    if "—" in body:
        sys.exit(f"{path.name}: em dash in the page body")
    slug = header_field(src, "Proposed slug").rstrip("/").split("/")[-1]
    title = header_field(src, "Title tag")
    desc = header_field(src, "Meta description")
    words = len(re.findall(r"\w+", body))
    return dict(slug=slug, title=title, desc=desc, h1=h1, body=render(body), minutes=max(1, round(words / 220)))


NAV = '<nav class="site-nav-bar" aria-label="Primary"></nav>'  # `npm run nav` writes the static copy


def head(title, desc, path, ld, og_type="article"):
    url = SITE + path
    e = lambda s: html.escape(s, quote=True)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<link rel="icon" type="image/png" sizes="64x64" href="/lib/img/favicon.png">
<link rel="icon" type="image/x-icon" href="/lib/img/favicon.ico">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="stylesheet" href="/lib/site.css">
<script defer src="/lib/site.js"></script>
<link rel="canonical" href="{url}">
<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="Crads-AI">
<meta property="og:url" content="{url}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:image" content="{SITE}/lib/img/og-card.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="author" content="Sam Davis">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{e(title)}">
<meta name="twitter:description" content="{e(desc)}">
<meta name="twitter:image" content="{SITE}/lib/img/og-card.png">
<script type="application/ld+json">{json.dumps({"@context": "https://schema.org", "@graph": ld}, ensure_ascii=False).replace("</", "<\\/")}</script>
<link rel="stylesheet" href="/writing/essay.css">
<style>.guide-cta{{margin-top:2rem}} .essay-body li{{font-size:18px;line-height:1.65}} .guide-list{{list-style:none;padding:0;display:grid;gap:1.25rem;margin-top:2rem}} .guide-list a{{font-weight:600}} .guide-list p{{margin:.35rem 0 0}}</style>
</head>
<body class="essay-page">

{NAV}
"""


FOOTER = """
<footer class="site-footer wrap">
  <span class="wordmark">crads-<span class="accent">ai</span></span>
  <div><a href="mailto:cradsdavis@gmail.com">cradsdavis@gmail.com</a></div>
  <div><a href="https://linkedin.com/in/samuel-davis4" target="_blank" rel="noopener">linkedin.com/in/samuel-davis4</a></div>
  <div><a href="/writing">Writing</a></div>
  <div class="location">Coogee, Sydney.</div>
</footer>

</body>
</html>
"""

AUTHOR = {"@id": f"{SITE}/#sam-davis", "@type": "Person", "name": "Sam Davis", "url": f"{SITE}/about"}


def crumbs(*items):
    return {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": SITE + p} for i, (n, p) in enumerate(items)]}


def guide_page(g):
    path = f"/guides/{g['slug']}"
    ld = [
        {"@type": "Article", "headline": g["h1"], "description": g["desc"], "author": AUTHOR,
         "datePublished": PUBLISHED, "mainEntityOfPage": SITE + path, "image": f"{SITE}/lib/img/og-card.png",
         "about": {"@id": f"{SITE}/#crads-ai"}},
        crumbs(("Crads-AI", "/"), ("Guides", "/guides"), (g["h1"], path)),
    ]
    return head(g["title"], g["desc"], path, ld) + f"""<main class="essay">
  <header class="essay-head">
    <p class="eyebrow"><a href="/guides">Guides</a> · {g['minutes']} min read</p>
    <h1>{html.escape(smart(g['h1']), quote=False)}</h1>
    <p class="essay-byline"><img src="/lib/img/sam-photo.jpg" alt="" width="36" height="36"> Sam Davis · Sydney · October 2026</p>
    <p class="essay-process">{PROCESS_NOTE}</p>
  </header>
  <article class="essay-body">
{g['body']}
  </article>
</main>
""" + FOOTER


def index_page(guides):
    desc = "Practical ways to use AI on the problems small-business owners keep bringing to my roadmap calls, starting with what plain Claude can already do."
    ld = [{"@type": "CollectionPage", "name": "Guides", "description": desc, "url": f"{SITE}/guides",
           "hasPart": [{"@type": "Article", "headline": g["h1"], "url": f"{SITE}/guides/{g['slug']}"} for g in guides]},
          crumbs(("Crads-AI", "/"), ("Guides", "/guides"))]
    items = "\n".join(
        f'    <li><a href="/guides/{g["slug"]}">{html.escape(smart(g["h1"]), quote=False)}</a><p>{html.escape(smart(g["desc"]), quote=False)}</p></li>'
        for g in guides)
    return head("Guides: AI for the problems small businesses bring me · Crads-AI", desc, "/guides", ld, og_type="website") + f"""<main class="essay">
  <header class="essay-head">
    <h1>Guides</h1>
    <p class="essay-dek">{html.escape(smart(desc), quote=False)}</p>
  </header>
  <article class="essay-body">
  <ul class="guide-list">
{items}
  </ul>
  </article>
</main>
""" + FOOTER


guides = [read_guide(SRC_DIR / n) for n in ORDER]
for g in guides:
    out = ROOT / "guides" / g["slug"] / "index.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(guide_page(g))
(ROOT / "guides" / "index.html").write_text(index_page(guides))
print("guides:", ", ".join(g["slug"] for g in guides))
