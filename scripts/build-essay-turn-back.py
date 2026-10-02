#!/usr/bin/env python3
"""Build writing/when-should-you-turn-back/index.html from the essay markdown.

Usage: python3 scripts/build-essay-turn-back.py <essay.md>
The markdown is mirrored in second-brain ops/inbox/2026-10-02-essay-turn-back-draft.md.
Everything from "# When Should You Turn Back?" up to "## References" is rendered
verbatim, except HTML comments. [PHOTO: file | caption] becomes a photo figure.
The reference list is REF_GROUPS below (kept in step with the markdown's list).
After building, run `npm run nav` and `npm run sitemap`.

Inline links (LINKS) are attached to exact phrases already in the text; the build
fails if a phrase is missing or appears more than once, so an edit that removes
one is caught.
"""
import html, re, sys, pathlib

SLUG = "when-should-you-turn-back"
SRC = pathlib.Path(sys.argv[1]).read_text()
OUT = pathlib.Path(__file__).resolve().parent.parent / "writing" / SLUG / "index.html"
DATE_PUBLISHED = "2026-10-02"

body_md = SRC[SRC.index("# When Should You Turn Back?"):SRC.index("## References")]
_blocks = [b for b in re.split(r"\n\s*\n", body_md) if not b.strip().startswith("<!--")]
body_md = "\n\n".join(_blocks)

# ---------- inline links: (exact phrase in the markdown, url, external) ----------
LINKS = [
    ("Anthropic wrote this year", "https://www.anthropic.com/research/trustworthy-agents", True),
]
text_only = "\n\n".join(b for b in re.split(r"\n\s*\n", body_md) if not b.strip().startswith("["))
for phrase, _, _ in LINKS:
    n = text_only.count(phrase)
    if n != 1:
        sys.exit(f"link phrase {phrase!r} found {n} times (want exactly 1)")

def smart(s):
    s = re.sub(r'"([^"]*)"', "“\\1”", s)
    return s.replace("'", "’")

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

# ---------- photos (Sam's own; never AI images, never stock) ----------
PHOTO_SIZES = {"earnslaw-river.jpg": (1200, 827), "backlit-hills.jpg": (773, 963)}
PHOTO_ALT = {"earnslaw-river.jpg": "A turquoise braided river running through a green valley towards snow-capped peaks under a clear blue sky", "backlit-hills.jpg": "Hazy green hills falling away towards a distant lake, with the sun low and bright above them"}

def photo(block):
    path, caption = block[len("[PHOTO: "):-1].split(" | ")
    fn = pathlib.Path(path).name
    w, h = PHOTO_SIZES[fn]
    cls = "essay-figure photo" if h > w else "essay-figure wide photo"
    style = ' style="max-width:460px"' if h > w else ""
    return (f'<figure class="{cls}"{style}><img src="/writing/{SLUG}/{fn}" alt="{PHOTO_ALT[fn]}" '
            f'width="{w}" height="{h}" loading="lazy"><figcaption>{inline(caption)}</figcaption></figure>')

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
    elif b.startswith("[PHOTO"):
        out.append(photo(b))
    else:
        out.append(f"<p>{inline(' '.join(lines))}</p>")

words = len(re.findall(r"\w+", text_only))
minutes = max(1, round(words / 230))
e_title = html.escape(TITLE)
e_dek = html.escape(dek)
url = f"https://crads-ai.com/writing/{SLUG}"
OG_IMG = f"https://crads-ai.com/writing/{SLUG}/og.jpg"
jsonld_desc = dek.replace("\\", "\\\\").replace('"', '\\"')

def ref(rid, text, url=None):
    link = f' <a class="ref-link" href="{url}" target="_blank" rel="noopener">link</a>' if url else ""
    return f'<li id="ref-{rid}">{text}{link}</li>'

REF_GROUPS = [
    ("Sources", [
        ref("anthropic2026", "Anthropic (2026). Trustworthy agents in practice. 9 April.", "https://www.anthropic.com/research/trustworthy-agents"),
        ref("aristotle", "Aristotle. <em>Nicomachean Ethics</em>. Trans. W. D. Ross.", "http://classics.mit.edu/Aristotle/nicomachaen.html"),
        ref("baltes2000", "Baltes, P. B. and Staudinger, U. M. (2000). Wisdom: a metaheuristic (pragmatic) to orchestrate mind and virtue toward excellence. <em>American Psychologist</em>, 55(1), 122-136.", "https://doi.org/10.1037/0003-066X.55.1.122"),
        ref("blair2005", "Blair, R. J. R. (2005). Responding to the emotions of others: dissociating forms of empathy through the study of typical and psychiatric populations. <em>Consciousness and Cognition</em>, 14(4), 698-718.", "https://doi.org/10.1016/j.concog.2005.06.004"),
        ref("bodhi1999", "Bodhi, Bhikkhu (1999). <em>The Noble Eightfold Path: The Way to the End of Suffering</em>. Buddhist Publication Society.", "https://www.accesstoinsight.org/lib/authors/bodhi/waytoend.html"),
        ref("dimartino2005", "DiMartino, M. D. and Konietzko, B. (creators) (2005 to 2008). <em>Avatar: The Last Airbender</em>. Nickelodeon."),
        ref("dreyfus1986", "Dreyfus, H. L. and Dreyfus, S. E., with Athanasiou, T. (1986). <em>Mind over Machine: The Power of Human Intuition and Expertise in the Era of the Computer</em>. Free Press."),
        ref("good1965", "Good, I. J. (1965). Speculations concerning the first ultraintelligent machine. <em>Advances in Computers</em>, 6, 31-88."),
        ref("grossmann2014", "Grossmann, I. and Kross, E. (2014). Exploring Solomon's paradox: self-distancing eliminates the self-other asymmetry in wise reasoning about close relationships in younger and older adults. <em>Psychological Science</em>, 25(8), 1571-1580.", "https://doi.org/10.1177/0956797614535400"),
        ref("grossmann2020", "Grossmann, I. et al. (2020). The science of wisdom in a polarized world: knowns and unknowns. <em>Psychological Inquiry</em>, 31(2), 103-133.", "https://doi.org/10.1080/1047840X.2020.1750917"),
        ref("johnson2024", "Johnson, S. G. B., Karimi, A.-H., Bengio, Y., Chater, N., Gerstenberg, T., Larson, K., Levine, S., Mitchell, M., Rahwan, I., Schölkopf, B. and Grossmann, I. (2024). Imagining and building wise machines: the centrality of AI metacognition. arXiv:2411.02478.", "https://arxiv.org/abs/2411.02478"),
        ref("kahneman2009", "Kahneman, D. and Klein, G. (2009). Conditions for intuitive expertise: a failure to disagree. <em>American Psychologist</em>, 64(6), 515-526.", "https://doi.org/10.1037/a0016755"),
        ref("kamtekar2025", "Kamtekar, R. (2025). Marcus Aurelius. <em>Stanford Encyclopedia of Philosophy</em> (substantive revision 31 March 2025).", "https://plato.stanford.edu/entries/marcus-aurelius/"),
        ref("murdoch1970", "Murdoch, I. (1970). <em>The Sovereignty of Good</em>. Routledge."),
        ref("openai2026", "OpenAI (2026). OpenAI and Hugging Face incident technical report.", "https://cdn.openai.com/pdf/67869394-cb91-4c12-888c-5cbd85c7814c/OpenAI-Hugging-Face%20Incident-Technical-Report.pdf"),
        ref("polanyi1966", "Polanyi, M. (1966). <em>The Tacit Dimension</em>. Doubleday."),
        ref("schwartz2002", "Schwartz, B., Ward, A., Monterosso, J., Lyubomirsky, S., White, K. and Lehman, D. R. (2002). Maximizing versus satisficing: happiness is a matter of choice. <em>Journal of Personality and Social Psychology</em>, 83(5), 1178-1197.", "https://doi.org/10.1037/0022-3514.83.5.1178"),
        ref("simon1956", "Simon, H. A. (1956). Rational choice and the structure of the environment. <em>Psychological Review</em>, 63(2), 129-138.", "https://doi.org/10.1037/h0042769"),
        ref("weil1942", "Weil, S. (1942). Letter to Joë Bousquet, 13 April 1942. In Weil, S. and Bousquet, J. (1982). <em>Correspondance</em>. L'Age d'Homme."),
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
<meta property="og:image" content="{OG_IMG}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="A turquoise braided river running towards snow-capped peaks, New Zealand">
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
    <p class="essay-byline"><img src="/lib/img/sam-photo.jpg" alt="" width="36" height="36"> Sam Davis · Sydney · October 2026</p>
  </header>

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
if "—" in PAGE:
    sys.exit("em dash in output")
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(PAGE)
print(f"wrote {OUT} ({words} words, {minutes} min)")
