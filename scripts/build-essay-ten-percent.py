#!/usr/bin/env python3
"""Build writing/is-ten-percent-a-lot/index.html from the essay markdown.

Usage: python3 scripts/build-essay-ten-percent.py <essay.md>
The markdown is Sam's edited text (source of truth: the Google Doc, mirrored in
second-brain ops/inbox/2026-09-24-ten-percent-blog-draft.md). Everything from
"# Is Ten Percent a Lot?" to the end is rendered verbatim; re-run after any edit.
After building, run `npm run nav` so the static nav matches lib/site.js NAV_ITEMS.

Inline links (LINKS) are attached to exact phrases already in the text; the build
fails if a phrase is missing or appears more than once, so an edit that removes
one is caught. Photo slots (PHOTOS) are HTML comments until Sam supplies real
photos: uncomment the figure, set alt, caption and the real pixel size.
"""
import html, re, sys, pathlib

SLUG = "is-ten-percent-a-lot"
SRC = pathlib.Path(sys.argv[1]).read_text()
OUT = pathlib.Path(__file__).resolve().parent.parent / "writing" / SLUG / "index.html"
DATE_PUBLISHED = "2026-09-25"  # placeholder until Sam picks the publish day

body_md = SRC[SRC.index("# Is Ten Percent a Lot?"):]

# ---------- inline links: (exact phrase in the markdown, url) ----------
LINKS = [
    ("wrote publicly", "https://www.foxla.com/news/anthropic-researcher-ai-10-percent-chance-kill-humans"),
    ("The largest survey of AI researchers", "https://aiimpacts.org/wp-content/uploads/2026/09/ESPAI2024.pdf"),
    ("In a 2025 Australian survey", "https://aigovernance.org.au/survey/2025/sara_2025_technical_report"),
    ("the Forecasting Research Institute", "https://forecastingresearch.org/research/existential-risk-persuasion-tournament"),
    ("Joe Carlsmith", "https://arxiv.org/abs/2206.13353"),
    ("Diary of a CEO debate", "https://www.youtube.com/watch?v=0z0mWA8plRc"),
    ("Critics call these", "https://www.normaltech.ai/p/ai-existential-risk-probabilities"),
    ("American Alpine Club's accident report", "https://publications.americanalpineclub.org/articles/13199403102/Fall-on-Rock-Climbing-Alone-and-Unroped-WeatherProbably-California-Yosemite-Valley-Sentinel-Rock"),
    ('"on well-trafficked moderate routes"', "https://americanalpineclub.org/news/2025/8/12/the-prescription"),
    ("a Soviet submarine called B-59", "https://nsarchive.gwu.edu/briefing-book/russia-programs/2022-10-03/soviet-submarines-nuclear-torpedoes-cuban-missile-crisis"),
    ("International AI Safety Report", "https://internationalaisafetyreport.org/publication/2026-report-extended-summary-policymakers"),
]
for phrase, _ in LINKS:
    n = body_md.count(phrase)
    if n != 1:
        sys.exit(f"link phrase {phrase!r} found {n} times (want exactly 1)")

def smart(s):
    s = re.sub(r'"([^"]*)"', "“\\1”", s)
    return s.replace("'", "’")

def inline(s):
    # swap each link phrase for a token first, so quote-curling and escaping
    # cannot break the match, then put the anchor back around the rendered phrase
    tokens = {}
    for i, (phrase, url) in enumerate(LINKS):
        if phrase in s:
            tok = f"\x00L{i}\x00"
            s = s.replace(phrase, tok)
            tokens[tok] = (phrase, url)
    s = html.escape(smart(s), quote=False)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<em>\1</em>", s)
    for tok, (phrase, url) in tokens.items():
        s = s.replace(tok, f'<a href="{url}" target="_blank" rel="noopener">{html.escape(smart(phrase), quote=False)}</a>')
    return s

# ---------- photo slots (empty until Sam supplies real photos; never AI images, never stock) ----------
def slot(n, desc, fn, cls, caption):
    lazy = "" if cls == "hero" else " loading=\"lazy\""
    return (f"<!-- PHOTO SLOT {n}: {desc} | file: /writing/{SLUG}/{fn} -->\n"
            "<!--\n"
            f'<figure class="essay-figure {cls} photo">\n'
            f'  <img src="/writing/{SLUG}/{fn}" alt="DESCRIBE THE PHOTO" width="1500" height="1125"{lazy}>\n'
            f"  <figcaption>{caption}</figcaption>\n"
            "</figure>\n"
            "Set alt, caption, and width/height to the real pixel size, then remove this comment wrapper.\n"
            "-->")

HERO = slot(1, "the Candlestick sea stack, Cape Hauy, Tasmania, September 2023", "candlestick.jpg", "hero",
            "The Candlestick, Cape Hauy, Tasmania, September 2023.")

# anchor = start of the paragraph the slot follows
PHOTOS = [
    ("I abseiled down the cliff on the mainland side",
     slot(2, "Sam on the cliff edge at Cape Hauy with the rope, sea stacks behind", "cape-hauy-rope.jpg", "wide",
          "Cape Hauy, Tasmania, September 2023.")),
    ("On the rock, understanding a risk lowers it.",
     slot(3, "hands on the rope and belay device", "belay-hands.jpg", "wide", "CAPTION")),
    ("If Steven Bartlett turned to me",
     slot(4, "(optional) alpine snow ridge", "alpine-ridge.jpg", "wide", "CAPTION")),
]
for anchor, _ in PHOTOS:
    if not re.search(r"(^|\n\n)" + re.escape(anchor), body_md):
        sys.exit(f"photo anchor {anchor!r} not found at the start of a paragraph")

# ---------- body ----------
blocks = [b.strip() for b in re.split(r"\n\s*\n", body_md) if b.strip()]
title_md = blocks.pop(0)  # "# Is Ten Percent a Lot?"
TITLE = title_md.lstrip("#").strip()
dek = blocks.pop(0).strip("*")
out = []
for b in blocks:
    lines = [l for l in b.split("\n") if l.strip()]
    if b.startswith("## "):
        h = b[3:].strip()
        hid = re.sub(r"[^a-z0-9]+", "-", h.lower()).strip("-")
        out.append(f'<h2 id="{hid}">{inline(h)}</h2>')
    else:
        out.append(f"<p>{inline(' '.join(lines))}</p>")
    for anchor, fig in PHOTOS:
        if b.startswith(anchor):
            out.append(fig)

words = len(re.findall(r"\w+", body_md))
minutes = max(1, round(words / 230))
e_title = html.escape(TITLE)
e_dek = html.escape(dek)
url = f"https://crads-ai.com/writing/{SLUG}"
# Share image: the site default card until photos exist. Switch to
# /writing/is-ten-percent-a-lot/og.jpg (1200x630) when they land.
OG_IMG = "https://crads-ai.com/lib/img/og-card.png"
jsonld_desc = dek.replace("\\", "\\\\").replace('"', '\\"')

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
<meta property="og:type" content="article">
<meta property="og:site_name" content="Crads-AI">
<meta property="og:url" content="{url}">
<meta property="og:title" content="{e_title} · Sam Davis">
<meta property="og:description" content="{e_dek}">
<!-- Share image: site default card until Sam's photos exist; switch to https://crads-ai.com/writing/{SLUG}/og.jpg (1200x630) when they land -->
<meta property="og:image" content="{OG_IMG}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Crads-AI card: the crads-ai wordmark beside a line-drawn leaf">
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
  <a href="/" class="brand" aria-label="crads-ai home">
    <img src="/lib/img/sam-illustration-sm.png" alt="">
    <span class="wordmark">crads-<span class="accent">ai</span></span>
  </a>
  <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav-links" aria-label="Open menu">
    <span class="nav-toggle-bar"></span><span class="nav-toggle-bar"></span><span class="nav-toggle-bar"></span>
  </button>
  <div class="nav-links" id="site-nav-links">
    <a href="/docs" class="nav-simple">Docs</a>
    <a href="/how-it-works" class="nav-simple">How it works</a>
    <a href="/offer" class="nav-simple">Setup and support</a>
    <a href="/about" class="nav-simple">About</a>
    <a href="/writing" class="nav-simple current">Writing</a>
    <a href="/book" class="nav-simple nav-book">Book a call</a>
    <a href="/download" class="nav-simple nav-cta">Download</a>
  </div>
</nav>

<main class="essay">
  <header class="essay-head">
    <p class="eyebrow"><a href="/writing">Writing</a> · Essay · {minutes} min read</p>
    <h1>{e_title}</h1>
    <p class="essay-dek">{inline(dek)}</p>
    <p class="essay-byline"><img src="/lib/img/sam-photo.jpg" alt="" width="36" height="36"> Sam Davis · Sydney · September 2026</p>
  </header>

{HERO}

  <article class="essay-body">
{chr(10).join(out)}
  </article>
</main>

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
if "—" in PAGE:
    sys.exit("em dash in output")
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(PAGE)
print(f"wrote {OUT} ({words} words, {minutes} min, {PAGE.count('rel=\"noopener\">') - 1} inline links)")
