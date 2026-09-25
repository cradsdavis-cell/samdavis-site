#!/usr/bin/env python3
"""Build writing/the-other-half-of-the-room/index.html from the essay markdown.

Usage: python3 scripts/build-essay-other-half.py <essay.md>
The markdown is Sam's edited text (source of truth: the Google Doc, mirrored in
second-brain ops/inbox/2026-09-25-other-half-of-the-room-draft.md). Everything from
"# The Other Half of the Room" to the end is rendered verbatim, except HTML comments and the
paragraphs in EXCLUDE (held back pending consent); re-run after any edit.
After building, run `npm run nav` so the static nav matches lib/site.js NAV_ITEMS.

Inline links (LINKS) are attached to exact phrases already in the text; the build
fails if a phrase is missing or appears more than once, so an edit that removes
one is caught. Photo slots (PHOTOS) are HTML comments until Sam supplies real
photos: uncomment the figure, set alt, caption and the real pixel size.
"""
import html, re, sys, pathlib

SLUG = "the-other-half-of-the-room"
SRC = pathlib.Path(sys.argv[1]).read_text()
OUT = pathlib.Path(__file__).resolve().parent.parent / "writing" / SLUG / "index.html"
DATE_PUBLISHED = "2026-09-25"

body_md = SRC[SRC.index("# The Other Half of the Room"):]
# Held back until the man concerned agrees (Sam asking him). Remove from EXCLUDE to publish it.
EXCLUDE = ["At a recent Wildly Calm retreat"]
_blocks = [b for b in re.split(r"\n\s*\n", body_md)]
_blocks = [b for b in _blocks if not b.strip().startswith("<!--") and not any(b.strip().startswith(x) for x in EXCLUDE)]
body_md = "\n\n".join(_blocks)

# ---------- inline links: (exact phrase in the markdown, url) ----------
LINKS = [
    ("In a 2025 survey across 30 countries", "https://www.kcl.ac.uk/news/gen-z-men-and-women-most-divided-on-gender-equality-global-study-shows"),
    ("young women have moved sharply to the left", "https://news.gallup.com/poll/609914/women-become-liberal-men-mostly-stable.aspx"),
    ("In one long-running US survey", "https://ifstudies.org/blog/the-sex-recession-the-share-of-americans-having-regular-sex-keeps-dropping"),
    ("a strong sense of belonging", "https://scanloninstitute.org.au/mapping-social-cohesion-2025/"),
    ("across 37 cultures", "https://doi.org/10.1017/S0140525X00023992"),
    ("Posts attacking the other side", "https://www.pnas.org/doi/10.1073/pnas.2024292118"),
    ("a 2025 study of Twitter", "https://academic.oup.com/pnasnexus/article/4/3/pgaf062/8052060"),
    ("In one UK experiment", "https://phys.org/news/2024-02-social-media-algorithms-amplify-misogynistic.html"),
    ("A 2025 study of 561 of them", "https://www.swansea.ac.uk/press-office/news-events/news/2025/05/major-new-study-reveals-key-insights-into-incel-community.php"),
    ("In one US survey, almost a third of men", "https://www.prnewswire.com/news-releases/virtual-valentines-nearly-1-in-5-adults-report-having-chatted-with-ai-romantic-partner-302376017.html"),
    ("take the edge off loneliness in the short term", "https://www.hbs.edu/ris/Publication%20Files/24-078_a3d2e2c7-eca1-4767-8543-122e818bf2e5.pdf"),
    ("in a four-week study", "https://www.media.mit.edu/publications/how-ai-and-human-behaviors-shape-psychosocial-effects-of-chatbot-use-a-longitudinal-controlled-study/"),
    ("Anthropic's published guidelines", "https://www.anthropic.com/constitution"),
    ("roll back an update", "https://openai.com/index/sycophancy-in-gpt-4o/"),
]
for phrase, _ in LINKS:
    n = body_md.count(phrase)
    if n != 1:
        sys.exit(f"link phrase {phrase!r} found {n} times (want exactly 1)")

def smart(s):
    s = re.sub(r'"([^"]*)"', "\u201c\\1\u201d", s)
    return s.replace("'", "\u2019")

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

# ---------- photos (Sam's own, from his Google Photos; never AI images, never stock) ----------
# Captured at screen resolution from Google Photos (24 Sep 2026); swap in the originals if Sam exports them.
def fig(fn, cls, w, h, alt, caption):
    lazy = "" if cls == "hero" else ' loading="lazy"'
    return (f'<figure class="essay-figure {cls} photo"><img src="/writing/{SLUG}/{fn}" alt="{alt}" '
            f'width="{w}" height="{h}"{lazy}><figcaption>{caption}</figcaption></figure>')

HERO = "  " + fig("campfire.jpg", "hero", 1216, 812,
    "A figure in a hooded jacket sitting alone on a log beside a campfire at night, sparks rising, a tent behind",
    "Tasmania, September 2023.")

PHOTOS = []
for anchor, _ in PHOTOS:
    if not re.search(r"(^|\n\n)" + re.escape(anchor), body_md):
        sys.exit(f"photo anchor {anchor!r} not found at the start of a paragraph")

# ---------- body ----------
blocks = [b.strip() for b in re.split(r"\n\s*\n", body_md) if b.strip()]
title_md = blocks.pop(0)  # "# The Other Half of the Room"
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
OG_IMG = f"https://crads-ai.com/writing/{SLUG}/og.jpg"
jsonld_desc = dek.replace("\\", "\\\\").replace('"', '\\"')

# ---------- references (rendered as a collapsible list, like which-love) ----------
def ref(rid, text, url=None):
    link = f' <a class="ref-link" href="{url}" target="_blank" rel="noopener">link</a>' if url else ""
    return f'<li id="ref-{rid}">{text}{link}</li>'

REF_GROUPS = [
    ("Men, women and the gap", [
        ref("buss1989", "Buss, D. M. (1989). Sex differences in human mate preferences: evolutionary hypotheses tested in 37 cultures. <em>Behavioral and Brain Sciences</em>, 12(1), 1-49.", "https://doi.org/10.1017/S0140525X00023992"),
        ref("gallup2024", "Gallup (2024). Women, more than men, adopt a liberal label.", "https://news.gallup.com/poll/609914/women-become-liberal-men-mostly-stable.aspx"),
        ref("ifs2025", "Bailey, L. and Wilcox, W. B. (2025). The sex recession. Institute for Family Studies (General Social Survey data).", "https://ifstudies.org/blog/the-sex-recession-the-share-of-americans-having-regular-sex-keeps-dropping"),
        ref("kcl2025", "King's College London Policy Institute and Ipsos (2025). Gen Z men and women most divided on gender equality, global study shows.", "https://www.kcl.ac.uk/news/gen-z-men-and-women-most-divided-on-gender-equality-global-study-shows"),
        ref("scanlon2025", "Scanlon Institute (2025). Mapping Social Cohesion 2025.", "https://scanloninstitute.org.au/mapping-social-cohesion-2025/"),
        ref("swansea2025", "Swansea University (2025). Major new study reveals key insights into incel community.", "https://www.swansea.ac.uk/press-office/news-events/news/2025/05/major-new-study-reveals-key-insights-into-incel-community.php"),
    ]),
    ("Feeds and algorithms", [
        ref("milli2025", "Milli, S. et al. (2025). Engagement, user satisfaction, and the amplification of divisive content on social media. <em>PNAS Nexus</em>, 4(3).", "https://academic.oup.com/pnasnexus/article/4/3/pgaf062/8052060"),
        ref("rathje2021", "Rathje, S., Van Bavel, J. J. and van der Linden, S. (2021). Out-group animosity drives engagement on social media. <em>PNAS</em>, 118(26).", "https://www.pnas.org/doi/10.1073/pnas.2024292118"),
        ref("russell2019", "Russell, S. (2019). <em>Human Compatible: Artificial Intelligence and the Problem of Control</em>. Viking."),
        ref("ucl2024", "Regehr, K. et al. (2024). Safer scrolling: how algorithms popularise and gamify online hate and misogyny for young people. UCL, University of Kent and ASCL; reported by Phys.org.", "https://phys.org/news/2024-02-social-media-algorithms-amplify-misogynistic.html"),
    ]),
    ("AI companions and AI values", [
        ref("anthropic2026", "Anthropic (2026). Claude's constitution.", "https://www.anthropic.com/constitution"),
        ref("defreitas2024", "De Freitas, J. et al. (2024). AI companions reduce loneliness. Harvard Business School Working Paper 24-078.", "https://www.hbs.edu/ris/Publication%20Files/24-078_a3d2e2c7-eca1-4767-8543-122e818bf2e5.pdf"),
        ref("mit2025", "Fang, C. M. et al. (2025). How AI and human behaviors shape psychosocial effects of chatbot use: a longitudinal controlled study. MIT Media Lab and OpenAI.", "https://www.media.mit.edu/publications/how-ai-and-human-behaviors-shape-psychosocial-effects-of-chatbot-use-a-longitudinal-controlled-study/"),
        ref("openai2025", "OpenAI (2025). Sycophancy in GPT-4o: what happened and what we're doing about it.", "https://openai.com/index/sycophancy-in-gpt-4o/"),
        ref("wheatley2025", "Wheatley Institute (2025). Counterfeit Connections: the rise of AI romantic companions.", "https://www.prnewswire.com/news-releases/virtual-valentines-nearly-1-in-5-adults-report-having-chatted-with-ai-romantic-partner-302376017.html"),
    ]),
]
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
<meta property="og:type" content="article">
<meta property="og:site_name" content="Crads-AI">
<meta property="og:url" content="{url}">
<meta property="og:title" content="{e_title} · Sam Davis">
<meta property="og:description" content="{e_dek}">
<!-- Share image: site default card until Sam's photos exist; switch to https://crads-ai.com/writing/{SLUG}/og.jpg (1200x630) when they land -->
<meta property="og:image" content="{OG_IMG}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="A figure sitting alone beside a campfire at night, Tasmania">
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
{chr(10).join(out)}{REFS_HTML}
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
if "\u2014" in PAGE:
    sys.exit("em dash in output")
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(PAGE)
print(f"wrote {OUT} ({words} words, {minutes} min, {PAGE.count('rel=\"noopener\">') - 1} inline links)")
