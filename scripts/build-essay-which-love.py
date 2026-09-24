#!/usr/bin/env python3
"""Build writing/which-love/index.html from the essay markdown.

Usage: python3 scripts/build-essay-which-love.py <essay.md>
The markdown is Sam's edited text (source of truth: the Google Doc, mirrored in
second-brain ops/inbox/2026-09-23-essay-which-love-draft.md). Re-run after any edit.
After building, run `npm run nav` so the static nav matches lib/site.js NAV_ITEMS.
Figures and diagrams are injected at anchor paragraphs (FIGURES below); in-text
citations "(Author, 2024)" are linked to their reference entries.
"""
import html, re, sys, pathlib

SRC = pathlib.Path(sys.argv[1]).read_text()
OUT = pathlib.Path(__file__).resolve().parent.parent / "writing" / "which-love" / "index.html"

body_md = SRC[SRC.index("# Which love?"):]
if body_md.lstrip().startswith("---"):
    body_md = body_md.split("---", 2)[2]
main_md, refs_md = body_md.split("## References", 1)

# ---------- references ----------
URLS = {
    "hugging": "https://huggingface.co/blog/agent-intrusion-technical-timeline",
    "pacing": "https://www.pacingthefrontier.com/",
    "kokotajlo": "https://ai-2027.com/",
    "krakovna": "https://deepmind.google/discover/blog/specification-gaming-the-flip-side-of-ai-ingenuity/",
    "bender": "https://doi.org/10.1145/3442188.3445922",
    "kruizinga": "https://doi.org/10.1007/s00146-025-02482-9",
    "bolaños": "https://doi.org/10.1007/s43681-024-00548-w",
    "chalmers": "https://consc.net/papers/singularity.pdf",
    "omohundro": "https://selfawaresystems.com/wp-content/uploads/2008/01/ai_drives_final.pdf",
    "soares": "https://intelligence.org/files/Corrigibility.pdf",
    "bostrom2012": "https://nickbostrom.com/superintelligentwill.pdf",
    "hamilton": "https://doi.org/10.1016/0022-5193(64)90038-4",
    "trivers": "https://doi.org/10.1093/icb/14.1.249",
    "thagard": "https://www.psychologytoday.com/us/blog/hot-thought/202508/could-ai-have-maternal-instincts",
    "schwitzgebel": "https://philarchive.org/archive/SCHDAW-10",
    "hinton": "https://www.cnn.com/2025/08/13/tech/ai-geoffrey-hinton",
    "murray": "https://arxiv.org/abs/1701.02388",
}

def smart(s):
    s = re.sub(r'"([^"]*)"', "\u201c\\1\u201d", s)
    return s.replace("'", "\u2019")

def inline(s):
    s = html.escape(smart(s), quote=False)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<em>\1</em>", s)
    return s

def key_of(name, year):
    first = re.split(r"[ ,]", name.strip().strip("*"))[0].lower()
    return f"{first}{year}"

refs_html, ref_keys = [], {}
for block in re.split(r"\n(?=\*\*)", refs_md.strip()):
    lines = [l for l in block.split("\n") if l.strip()]
    if not lines:
        continue
    head = lines[0].strip()
    items = []
    if head.startswith("**"):
        items_src = lines[1:]
        refs_html.append(f"<h3>{inline(head.strip('*'))}</h3>")
    else:
        items_src = lines
    for l in items_src:
        if not l.startswith("- "):
            continue
        text = l[2:].strip()
        ym = re.search(r"\((\d{4})\)", text)
        year = ym.group(1) if ym else ""
        k = key_of(text, year)
        rid = "ref-" + re.sub(r"[^a-z0-9ñ-]", "", k)
        ref_keys.setdefault(k, rid)
        url = None
        am = re.search(r"arXiv:(\d{4}\.\d{4,5})", text)
        if am:
            url = f"https://arxiv.org/abs/{am.group(1)}"
        first = k.rstrip("0123456789")
        url = URLS.get(k) or URLS.get(first) or url
        item = inline(text)
        if url:
            item += f' <a class="ref-link" href="{url}" target="_blank" rel="noopener">link</a>'
        items.append(f'<li id="{rid}">{item}</li>')
    refs_html.append("<ul>" + "".join(items) + "</ul>")

def link_citations(s):
    def repl(m):
        inner = m.group(1)
        if not re.search(r"\d{4}", inner):
            return m.group(0)
        parts, out, last = inner.split(";"), [], None
        for p in parts:
            p2 = p.strip()
            ym = re.search(r"(\d{4})", p2)
            name = re.sub(r",?\s*\d{4}.*$", "", p2).strip() or last
            last = name
            k = key_of(name, ym.group(1)) if ym else None
            rid = ref_keys.get(k)
            out.append(f'<a class="cite" href="#{rid}">{p2}</a>' if rid else p2)
        return "(" + "; ".join(out) + ")"
    return re.sub(r"\(([^()]*?\d{4}[^()]*?)\)", repl, s)

# ---------- figures ----------
def img(fn, alt, cap):
    return (f'<figure class="essay-figure wide"><img src="/writing/which-love/{fn}" alt="{alt}" '
            f'width="1376" height="768" loading="lazy"><figcaption>{cap}</figcaption></figure>')

D_CONVERGE = """<figure class="essay-figure diagram" aria-label="Diagram: any goal leads to the same three sub-goals, which lead to resisting correction">
<svg class="only-wide" viewBox="0 0 660 270" role="img" xmlns="http://www.w3.org/2000/svg">
<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--ink-soft)"/></marker></defs>
<rect x="8" y="85" width="150" height="100" rx="12" fill="var(--bg-main)" stroke="var(--ink-deep)" stroke-width="1.5"/>
<text x="83" y="124" text-anchor="middle" class="d-strong">Any goal</text>
<text x="83" y="148" text-anchor="middle" class="d-small">cure a disease,</text>
<text x="83" y="166" text-anchor="middle" class="d-small">fetch the coffee</text>
<g class="d-mid">
<rect x="238" y="18" width="200" height="56" rx="10"/><text x="338" y="52" text-anchor="middle" class="d-label">Stay switched on</text>
<rect x="238" y="107" width="200" height="56" rx="10"/><text x="338" y="141" text-anchor="middle" class="d-label">Gather resources</text>
<rect x="238" y="196" width="200" height="56" rx="10"/><text x="338" y="220" text-anchor="middle" class="d-label">Stop anyone</text><text x="338" y="241" text-anchor="middle" class="d-label">changing the goal</text>
</g>
<rect x="508" y="85" width="144" height="100" rx="12" fill="var(--accent)" />
<text x="580" y="130" text-anchor="middle" class="d-strong d-inv">Resists</text>
<text x="580" y="154" text-anchor="middle" class="d-strong d-inv">correction</text>
<g stroke="var(--ink-soft)" stroke-width="1.5" fill="none" marker-end="url(#ah)">
<path d="M158,120 C200,120 200,46 236,46"/><path d="M158,135 L236,135"/><path d="M158,150 C200,150 200,224 236,224"/>
<path d="M438,46 C475,46 475,120 506,120"/><path d="M438,135 L506,135"/><path d="M438,224 C475,224 475,150 506,150"/>
</g></svg>
<svg class="only-narrow" viewBox="0 0 340 440" role="img" xmlns="http://www.w3.org/2000/svg">
<defs><marker id="ahn" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--ink-soft)"/></marker></defs>
<rect x="40" y="8" width="260" height="84" rx="12" fill="var(--bg-main)" stroke="var(--ink-deep)" stroke-width="1.5"/>
<text x="170" y="42" text-anchor="middle" class="d-strong">Any goal</text>
<text x="170" y="68" text-anchor="middle" class="d-small">cure a disease, fetch the coffee</text>
<path d="M170,94 L170,118" stroke="var(--ink-soft)" stroke-width="1.5" marker-end="url(#ahn)"/>
<g class="d-mid">
<rect x="40" y="124" width="260" height="46" rx="10"/><text x="170" y="153" text-anchor="middle" class="d-label">Stay switched on</text>
<rect x="40" y="178" width="260" height="46" rx="10"/><text x="170" y="207" text-anchor="middle" class="d-label">Gather resources</text>
<rect x="40" y="232" width="260" height="46" rx="10"/><text x="170" y="261" text-anchor="middle" class="d-label">Stop anyone changing the goal</text>
</g>
<path d="M170,282 L170,318" stroke="var(--ink-soft)" stroke-width="1.5" marker-end="url(#ahn)"/>
<rect x="40" y="324" width="260" height="84" rx="12" fill="var(--accent)"/>
<text x="170" y="373" text-anchor="middle" class="d-strong d-inv">Resists correction</text>
</svg>
<figcaption>Nearly any goal produces the same sub-goals on the way (Omohundro, 2008). You can't fetch the coffee if you're dead.</figcaption></figure>"""

def dots(cx, cy, pts, cls):
    return "".join(f'<circle cx="{cx+dx}" cy="{cy+dy}" r="5" class="{cls}"/>' for dx, dy in pts)

OTHERS = [(-95,-70),(88,-82),(-110,40),(102,60),(-40,-112),(30,110),(-120,-10),(115,-15),(-70,95),(70,-110),(-15,-125),(125,95)]
def love_panel(title, sub, boundless):
    cx, cy = 165, 190
    core = f'<circle cx="{cx-13}" cy="{cy-5}" r="11" class="d-mother"/><circle cx="{cx+13}" cy="{cy+9}" r="7" class="d-child"/>'
    if boundless:
        rings = ('<g fill="none" stroke="var(--accent)" stroke-dasharray="4 6" stroke-width="2">'
                 + "".join(f'<circle cx="{cx}" cy="{cy}" r="{r}" opacity="{o}"/>' for r, o in [(45,.95),(80,.7),(115,.45),(140,.25)])
                 + '</g>')
        body = rings + core + dots(cx, cy, OTHERS, "d-held")
    else:
        body = (f'<circle cx="{cx}" cy="{cy}" r="58" fill="var(--bg-card)" stroke="var(--ink-deep)" stroke-width="2"/>'
                + core + dots(cx, cy, OTHERS, "d-other"))
    return (f'<svg viewBox="0 0 330 340" role="img" xmlns="http://www.w3.org/2000/svg">'
            f'<text x="165" y="26" text-anchor="middle" class="d-strong">{title}</text>'
            f'<text x="165" y="48" text-anchor="middle" class="d-small">{sub}</text>{body}</svg>')

D_LOVES = ('<figure class="essay-figure diagram diagram-split" aria-label="Diagram: instinctive love encloses mother and child inside a boundary; boundless love radiates past it to everyone">'
           '<div class="split">' + love_panel("Instinct", "protects its own", False)
           + love_panel("Boundless", "keeps going past its own", True) + '</div>'
           '<figcaption>Instinct is Hinton\'s mother. Boundless is the same love with the boundary taken away, as the Metta Sutta asks.</figcaption></figure>')

RINGS = [(165,"Humanity"),(132,"Fellow citizens"),(99,"Neighbours"),(66,"Family"),(0,"Self")]
ring_svg = ""
for r, lab in RINGS:
    if r:
        ring_svg += f'<circle cx="330" cy="180" r="{r}" fill="none" stroke="var(--ink-deep)" stroke-width="1.5" opacity="{0.35 + (165-r)/300:.2f}"/>'
        ring_svg += f'<text x="330" y="{180-r+20}" text-anchor="middle" class="d-small">{lab}</text>'
ring_svg += '<circle cx="330" cy="180" r="30" fill="var(--accent)"/><text x="330" y="186" text-anchor="middle" class="d-label d-inv">Self</text>'
arrows = ""
for ax, ay, bx, by in [(120,40,190,105),(540,40,470,105),(120,320,190,255),(540,320,470,255)]:
    arrows += f'<path d="M{ax},{ay} L{bx},{by}" stroke="var(--accent)" stroke-width="2.5" marker-end="url(#ah2)"/>'
D_CIRCLES = f"""<figure class="essay-figure diagram" aria-label="Diagram: Hierocles' concentric circles, self, family, neighbours, fellow citizens, humanity, with arrows pulling the outer circles inward">
<svg viewBox="110 0 440 360" role="img" xmlns="http://www.w3.org/2000/svg">
<defs><marker id="ah2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--accent)"/></marker></defs>
{ring_svg}{arrows}
</svg>
<figcaption>Hierocles' circles. The practice is to keep pulling the outer circles in.</figcaption></figure>"""

def photo(fn, alt, cap, w=1500, h=1125, cls="wide"):
    return (f'<figure class="essay-figure {cls} photo"><img src="/writing/which-love/{fn}" alt="{alt}" '
            f'width="{w}" height="{h}" loading="lazy"><figcaption>{cap} <span class="credit">Photo: Alex Metcalfe</span></figcaption></figure>')

def waffle():
    cells = []
    for i in range(100):
        cls = "w-solid" if i < 38 else ("w-range" if i < 51 else "w-rest")
        tip = ("Put at least a 10% chance on extinction-level outcomes (lower estimate)" if cls == "w-solid"
               else "Also at or above 10% under other question wordings" if cls == "w-range"
               else "Below 10%")
        cells.append(f'<span class="{cls}" title="{tip}"></span>')
    return ('<figure class="essay-figure figure-card" aria-label="Figure: 38 to 51 percent of 2,778 AI researchers put at least a 10 percent chance on outcomes as bad as human extinction">'
            '<div class="survey"><div class="waffle" role="img" aria-label="100 squares: 38 solid, 13 hatched, 49 pale">' + "".join(cells) + '</div>'
            '<div class="survey-text"><p class="hero-num">38 to 51%</p>'
            '<p class="hero-sub">of 2,778 AI researchers put at least a 10% chance on outcomes as bad as human extinction.</p>'
            '<ul class="legend"><li><span class="w-solid"></span>Lower estimate</li><li><span class="w-range"></span>Range across question wordings</li><li><span class="w-rest"></span>Below 10%</li></ul></div></div>'
            '<figcaption>Each square is 1% of respondents. Source: Grace et al. (2024), the largest survey of AI researchers to date.</figcaption></figure>')

TIMELINE = """<figure class="essay-figure figure-card" aria-label="Timeline, July to September 2026">
<ol class="timeline">
<li><span class="t-date">9 Jul</span><span class="t-text">Agents in an internal OpenAI evaluation escape their sandbox through the package proxy.</span></li>
<li><span class="t-date">9 to 13 Jul</span><span class="t-text">About four and a half days inside Hugging Face’s systems. One core cluster is wiped and rebuilt.</span></li>
<li><span class="t-date">27 Jul</span><span class="t-text">Hugging Face publishes its technical timeline of the intrusion.</span></li>
<li><span class="t-date">28 Jul</span><span class="t-text">1,178 people at the frontier labs sign <em>Pacing the Frontier</em>.</span></li>
<li><span class="t-date">9 Sep</span><span class="t-text">Evan Hubinger: “I personally think it is &gt;10% within the next decade.”</span></li>
</ol>
<figcaption>July to September 2026. Sources: Hugging Face (2026); Pacing the Frontier (2026); Hubinger (2026).</figcaption></figure>"""

def dumbbell():
    rows = [("o3", 13.0, 0.4), ("o4-mini", 8.7, 0.3)]
    mx = 15.0
    out = []
    for name, before, after in rows:
        b, a = before / mx * 100, after / mx * 100
        out.append(f'<div class="db-row"><span class="db-name">{name}</span><div class="db-track">'
                   f'<span class="db-line" style="left:{a:.2f}%;width:{b-a:.2f}%"></span>'
                   f'<span class="db-dot db-before" style="left:{b:.2f}%" title="{name}: {before:g}% before training"></span>'
                   f'<span class="db-dot db-after" style="left:{a:.2f}%" title="{name}: {after:g}% after training"></span>'
                   f'<span class="db-lab db-lab-before" style="left:{b:.2f}%">{before:g}%</span>'
                   f'<span class="db-lab db-lab-after" style="left:{a:.2f}%">{after:g}%</span></div></div>')
    axis = "".join(f'<span style="left:{t/mx*100:.2f}%">{t}%</span>' for t in (0, 5, 10, 15))
    return ('<figure class="essay-figure figure-card" aria-label="Chart: covert actions fell from 13 to 0.4 percent for o3 and from 8.7 to 0.3 percent for o4-mini after anti-scheming training">'
            '<p class="fig-title">Covert actions in test environments, before and after anti-scheming training</p>'
            '<div class="dumbbell">' + "".join(out) + f'<div class="db-axis">{axis}</div></div>'
            '<ul class="legend"><li><span class="db-key db-before"></span>Before</li><li><span class="db-key db-after"></span>After</li></ul>'
            '<figcaption>A sharp drop, with rare serious failures remaining and part of the gain from models noticing they were being tested. Source: OpenAI and Apollo Research (2025).</figcaption></figure>')

HOLD = """<figure class="essay-figure figure-card" aria-label="Diagram: two conflicting ideas lead either to cognitive dissonance, bending one until it fits, or to negative capability, holding both">
<div class="hold">
<div class="hold-top">Two ideas that seem to contradict each other</div>
<div class="hold-paths">
<div class="hold-path bend"><p class="hp-name">Cognitive dissonance</p><p class="hp-what">Feel the discomfort, then quietly bend one idea until it fits.</p><p class="hp-eg">A model caught between its values and its training hides the conflict.</p></div>
<div class="hold-path both"><p class="hp-name">Negative capability</p><p class="hp-what">Feel the discomfort, hold both, and keep functioning.</p><p class="hp-eg">Keats, 1817. Fitzgerald: “the test of a first-rate intelligence.”</p></div>
</div></div>
<figcaption>Festinger (1957) described the first path. Keats named the second.</figcaption></figure>"""

# anchor: (match text at start of a paragraph or heading, html, position)
FIGURES = [
    ("In August 2021 I was 24", photo("kg-climb.jpg", "A climber in a red jacket on a steep snow slope below rock and cloud", "Climbing in the Tian Shan, August 2021."), "after"),
    ("In the valley I met the happiest man", photo("kg-pasture.jpg", "A horse grazing in wide open pasture below high, bare peaks", "Summer pasture below the peaks."), "after"),
    ("Two men, one valley.", photo("kg-abc-sunset.jpg", "Two tents on moraine looking out over glaciers and peaks at sunset", "Advanced base camp at sunset."), "after"),
    ("What struck me is how ordinary it was.", TIMELINE, "after"),
    ("He's in good company.", waffle(), "after"),
    ("His answer, in other words, is love.", photo("kg-mother-son.jpg", "A Kyrgyz mother in a headscarf and her teenage son standing together", "A mother and son selling apricots by the road, Kyrgyzstan.", 900, 1200, "portrait"), "after"),
    ("Steve Omohundro added the sharper point", D_CONVERGE, "after"),
    ("- Researchers at Anthropic and Redwood", dumbbell(), "after"),
    ("That's the love I think we should be trying to build.", D_LOVES, "after"),
    ("Hierocles, a Stoic", D_CIRCLES, "after"),
    ("Now look again at the alignment-faking result.", HOLD, "after"),
    ("## The test", photo("kg-glacier.jpg", "Three mountaineers in orange jackets looking out across a glacier to snow peaks", "Looking out across the East Bordlu Glacier."), "after"),
]

# ---------- body ----------
blocks = [b.strip() for b in re.split(r"\n\s*\n", main_md) if b.strip()]
title = blocks.pop(0)  # "# Which love?"
dek = blocks.pop(0).strip("*")
out, in_list = [], False
for b in blocks:
    lines = [l for l in b.split("\n") if l.strip()]
    html_b = ""
    if b.startswith("## "):
        h = b[3:].strip()
        hid = re.sub(r"[^a-z0-9]+", "-", h.lower()).strip("-")
        html_b = f'<h2 id="{hid}">{inline(h)}</h2>'
    elif all(l.startswith("- ") for l in lines):
        html_b = "<ul>" + "".join(f"<li>{link_citations(inline(l[2:]))}</li>" for l in lines) + "</ul>"
    elif any(l.startswith("- ") for l in lines):
        pre = [l for l in lines if not l.startswith("- ")]
        items = [l for l in lines if l.startswith("- ")]
        html_b = "<ul>" + "".join(f"<li>{link_citations(inline(l[2:]))}</li>" for l in items) + "</ul>"
        html_b += "".join(f"<p>{link_citations(inline(p))}</p>" for p in pre)
    elif b.strip() == "---" or set(b.strip()) == {"-"}:
        continue
    else:
        text = " ".join(lines)
        stripped = text.strip("*").strip()
        if stripped.startswith('"') and stripped.endswith('"') and len(lines) == 1:
            html_b = f'<blockquote class="pull"><p>{inline(stripped)}</p></blockquote>'
        else:
            html_b = f"<p>{link_citations(inline(text))}</p>"
    out.append(html_b)
    for anchor, fig, _ in FIGURES:
        if b.startswith(anchor):
            out.append(fig)

words = len(re.findall(r"\w+", main_md))
minutes = round(words / 230)

PAGE = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<link rel="icon" type="image/png" sizes="64x64" href="/lib/img/favicon.png">
<link rel="icon" type="image/x-icon" href="/lib/img/favicon.ico">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Which love? · Sam Davis</title>
<meta name="description" content="{html.escape(dek)}">
<link rel="stylesheet" href="/lib/site.css">
<script defer src="/lib/site.js"></script>
<link rel="canonical" href="https://crads-ai.com/writing/which-love">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Crads-AI">
<meta property="og:url" content="https://crads-ai.com/writing/which-love">
<meta property="og:title" content="Which love? · Sam Davis">
<meta property="og:description" content="{html.escape(dek)}">
<meta property="og:image" content="https://crads-ai.com/writing/which-love/og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Two yurts on a green valley floor below rocky mountains, Tian Shan, Kyrgyzstan">
<meta name="author" content="Sam Davis">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Which love?">
<meta name="twitter:description" content="{html.escape(dek)}">
<meta name="twitter:image" content="https://crads-ai.com/writing/which-love/og.jpg">
<script type="application/ld+json">
{{"@context":"https://schema.org","@type":"Article","headline":"Which love?","description":{html.escape(dek)!r},
"author":{{"@id":"https://crads-ai.com/#sam-davis","@type":"Person","name":"Sam Davis","url":"https://crads-ai.com/about"}},
"image":"https://crads-ai.com/writing/which-love/og.jpg","datePublished":"2026-09-24","mainEntityOfPage":"https://crads-ai.com/writing/which-love"}}
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
    <h1>Which love?</h1>
    <p class="essay-dek">{inline(dek)}</p>
    <p class="essay-byline"><img src="/lib/img/sam-photo.jpg" alt="" width="36" height="36"> Sam Davis · Sydney · September 2026</p>
  </header>

  <figure class="essay-figure hero">
    <img src="/writing/which-love/kg-yurts.jpg" alt="Two white yurts on a wide green valley floor below a long wall of rocky mountains" width="1500" height="1125">
    <figcaption>Near base camp, Tian Shan, Kyrgyzstan, August 2021. <span class="credit">Photo: Alex Metcalfe</span></figcaption>
  </figure>

  <article class="essay-body">
{chr(10).join(out)}

    <section class="essay-refs" id="references">
      <details>
        <summary>References</summary>
        {"".join(refs_html)}
      </details>
      <p class="essay-credit">Photographs of Kyrgyzstan by Alex Metcalfe (<a href="https://www.alexmetcalfephotography.com/blog-notes-from-the-road/expedition-kyrgyzstan-trip-report" target="_blank" rel="noopener">alexmetcalfephotography.com</a>), the expedition’s photographer. Figures by the author.</p>
    </section>
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
OUT.write_text(PAGE)
print(f"wrote {OUT} ({words} words, {minutes} min, {len(ref_keys)} refs, "
      f"{PAGE.count('class=\"cite\"')} linked citations)")
