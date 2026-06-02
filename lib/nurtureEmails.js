// lib/nurtureEmails.js — Nurture sequence emails 2/3/4
// Per coaching co-primary spec § 5.3.
//
// Email 1 (welcome) is sent immediately by api/lead-capture.js
// (see lib/leadCapture.js). Emails 2/3/4 are sent by the daily
// Vercel Cron job at api/cron/nurture.js, gated on days-since-signup
// + Sheet column state (Email2Sent / Email3Sent / Email4Sent).
'use strict';

const nurtureEmails = {
  email2: {
    subject: 'What Abbey actually built — a 30-second case study',
    html: `<p>Hi,</p>
<p>Quick case from someone I worked with recently — Abbey runs Impact Collab. We built her an AI assistant that's now drafting her email replies in her voice + organising her CRM by interest signal.</p>
<p>The thing that surprised her wasn't the time-saving (though it's real — she said ~5 hours/week). It was that she could finally see what her brain was telling her about her business, because the EA was capturing it.</p>
<p>That's the part I think most people don't expect: the EA isn't a tool you operate, it's a mirror that runs while you work.</p>
<p>Tomorrow's email walks through what working with me actually looks like — the 4-session arc + what you'd expect in week 1.</p>
<p>— Sam</p>
<p style="font-size:0.9em;color:#666">P.S. If you want to skip the rest of these emails: <a href="https://crads-ai.com/book/discovery">book a discovery call</a>.</p>`,
  },
  email3: {
    subject: 'What working with me actually looks like',
    html: `<p>Hi,</p>
<p>The 4-session arc I walk most clients through:</p>
<p><strong>Session 1:</strong> install + foundation. Stack working on your machine in 60 min.<br>
<strong>Session 2:</strong> first workflow built. You operate it live.<br>
<strong>Session 3:</strong> second workflow + integrations.<br>
<strong>Session 4:</strong> review + graduation. Some clients continue with a $600/mo retainer; some don't need to.</p>
<p>Full walkthrough on the site: <a href="https://crads-ai.com/how-it-works">crads-ai.com/how-it-works</a></p>
<p>Last email next week — I'll send you a free install guide so you can start building before we even talk if you want.</p>
<p>— Sam</p>`,
  },
  email4: {
    subject: 'Free install guide (Karpathy + Nate Herk distilled)',
    html: `<p>Hi,</p>
<p>As promised — here's the install guide I built from coaching sessions. It distills Karpathy's LLM Wiki approach + Nate Herk's EA-skills build prompt into the shortest working stack:</p>
<p><a href="https://crads-ai.com/install-guide.pdf"><strong>Download the install guide (PDF)</strong></a></p>
<p>If you read it and want help making it real, the offer's at <a href="https://crads-ai.com/offer">crads-ai.com/offer</a>. If not, that's fine — I won't email you again.</p>
<p>Either way — good luck with the build.</p>
<p>— Sam</p>`,
  },
};

module.exports = { nurtureEmails };
