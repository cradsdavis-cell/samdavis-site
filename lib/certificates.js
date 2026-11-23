// lib/certificates.js - the Crads AI completion certificate: what each program
// certifies, the pass mark, and the ID format. The one definition: the public
// check pages (scripts/certificate-page.js) and the PDF certificate (the brain's
// cockpit/tools/certificate.mjs) both read it from here.
//
// Rules (Sam, 2026-11-23, after Abbey's IC "completion certificate" tip):
// - It is a COMPLETION certificate. Never "accredited", "certification" or
//   "qualification": formal qualifications in Australia go through an RTO and ASQA.
// - It means something: every criterion is shown live to Sam (in session 2, or a
//   short call or recording afterwards). All of them, or no certificate. "Afterwards"
//   (Sam, 2026-11-23, was "before the support window ends") lets past setup clients
//   earn it on a 15-minute show-me call.
// - Walkthrough, group walkthrough and Guided Setup only. Done for you and Bespoke
//   get none: the client doesn't build it themselves.
// - Each certificate has a public check page with the holder's name, so it is only
//   issued with their yes.
// - No expiry. It records what they showed on the issue date.
'use strict';

const ISSUER = 'Crads AI';
const SIGNED_BY = 'Sam Davis, PhD';
const HOST = 'https://crads-ai.com';

// Shared by the two Walkthrough formats.
const RUNNING_CRITERIA = [
  'Set up their own AI assistant (Crads AI, built on Claude) on their own server or computer.',
  'Built its picture of their work from their own interview, and checked it.',
  'Ran a real task from their week with it, live.',
  'Changed how it works themselves, unaided, and ran it again.',
];

const PROGRAMS = {
  'walkthrough': {
    title: 'Running your own AI assistant',
    offer: 'Walkthrough',
    format: 'Two live 1:1 sessions with Sam Davis, PhD, with practice between them.',
    criteria: RUNNING_CRITERIA,
  },
  'group-walkthrough': {
    title: 'Running your own AI assistant',
    offer: 'Group walkthrough',
    format: 'Two live small-group sessions with Sam Davis, PhD, each person on their own assistant, with practice between them.',
    criteria: RUNNING_CRITERIA,
  },
  'guided-setup': {
    title: 'Building your own AI assistant',
    offer: 'Guided Setup',
    format: 'Two live 1:1 sessions with Sam Davis, PhD (three hours), with practice between them.',
    criteria: [
      'Built their own AI assistant (Crads AI, built on Claude) on a server in their own cloud account.',
      'Built its picture of their work from their own interview, and checked it.',
      'Connected it to their email, calendar and the tools they work in, on limits they chose.',
      'Built a skill for a job they repeat every week, and ran it on real work, live.',
      'Changed that skill themselves, unaided, and ran it again.',
    ],
  },
};

const PASS_MARK = 'Every item above, shown live to Sam Davis: in the second session, or in a short call or recording afterwards.';
const WHAT_IT_IS = 'A completion certificate from Crads AI. It is not an accredited or nationally recognised qualification.';
const EXPIRY = 'No expiry. It records what the holder showed on the issue date.';

// IDs: "CA-" + 6 characters from an alphabet with no 0/O or 1/I/L, so one read
// off paper can be typed back. 31^6 is about 890 million: not guessable in bulk.
const ID_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const ID_RE = /^CA-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;

// What someone types into the check box: any case, with or without "CA-".
function normaliseId(raw) {
  const s = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
  if (s.startsWith('CA-')) return s;
  if (s.length === 8 && s.startsWith('CA')) return 'CA-' + s.slice(2);
  return 'CA-' + s;
}

function isValidId(id) { return ID_RE.test(id); }

function newId(randomInt) {
  let s = 'CA-';
  for (let i = 0; i < 6; i++) s += ID_ALPHABET[randomInt(ID_ALPHABET.length)];
  return s;
}

function checkUrl(id) { return `${HOST}/certificates/${id}`; }

// LinkedIn's "Add to profile" form for Licenses & certifications, prefilled.
function linkedinAddUrl({ id, program, issued }) {
  const p = PROGRAMS[program];
  const [y, m] = issued.split('-').map(Number);
  const q = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: `${p.title} (completion certificate)`,
    organizationName: ISSUER,
    issueYear: String(y),
    issueMonth: String(m),
    certUrl: checkUrl(id),
    certId: id,
  });
  return `https://www.linkedin.com/profile/add?${q}`;
}

function cvLine({ program, issued }) {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const [y, m] = issued.split('-').map(Number);
  return `${PROGRAMS[program].title}, completion certificate, ${ISSUER}, ${months[m - 1]} ${y}`;
}

module.exports = {
  ISSUER, SIGNED_BY, HOST, PROGRAMS, PASS_MARK, WHAT_IT_IS, EXPIRY,
  ID_ALPHABET, ID_RE, normaliseId, isValidId, newId, checkUrl, linkedinAddUrl, cvLine,
};
