// lib/certificates.js - the Crads AI completion certificate: what each program
// covers, how it's awarded, and the ID format. The one definition: the public
// check pages (scripts/certificate-page.js) and the PDF certificate (the brain's
// cockpit/tools/certificate.mjs) both read it from here.
//
// Rules (Sam, 2026-11-23 and 24, after Abbey's IC "completion certificate" tip):
// - It is a COMPLETION certificate. Never "accredited", "certification" or
//   "qualification": formal qualifications in Australia go through an RTO and ASQA.
// - It records that someone COMPLETED a program's live sessions with Sam. There is
//   no show-me step (Sam, 24 Nov: "they don't need to show me anything"), so the
//   pages say what the program covered, never what the holder showed or was
//   assessed on.
// - Walkthrough, group walkthrough, Guided Setup and the earlier coaching block.
//   Done for you and Bespoke get none: the client doesn't build it themselves.
// - Each certificate has an unlisted check page (noindex, reachable only by its ID)
//   with the holder's name; anyone can ask for theirs to be taken down.
// - No expiry.
'use strict';

const ISSUER = 'Crads AI';
const SIGNED_BY = 'Sam Davis, PhD';
const HOST = 'https://crads-ai.com';

// Shared by the two Walkthrough formats.
const RUNNING_COVERS = [
  'Setting up their own AI assistant (Crads AI, built on Claude) on their own server or computer.',
  'Building its picture of their work from an interview, and checking it.',
  'Using it day to day through the Crads AI app and Claude Code.',
  'Changing how it works, and backing it up to their own GitHub.',
];

const PROGRAMS = {
  'walkthrough': {
    title: 'Running your own AI assistant',
    offer: 'Walkthrough',
    format: 'Two live 1:1 sessions with Sam Davis, PhD, with practice between them.',
    covers: RUNNING_COVERS,
  },
  'group-walkthrough': {
    title: 'Running your own AI assistant',
    offer: 'Group walkthrough',
    format: 'Two live small-group sessions with Sam Davis, PhD, each person on their own assistant, with practice between them.',
    covers: RUNNING_COVERS,
  },
  'guided-setup': {
    title: 'Building your own AI assistant',
    offer: 'Guided Setup',
    format: 'Two live 1:1 sessions with Sam Davis, PhD (three hours), with practice between them.',
    covers: [
      'Building their own AI assistant (Crads AI, built on Claude) on a server in their own cloud account.',
      'Building its picture of their work from an interview, and checking it.',
      'Connecting it to their email, calendar and the tools they work in, on limits they choose.',
      'Building skills for jobs they repeat every week, and jobs that run on a schedule.',
      'Using and changing it day to day through the Crads AI app and Claude Code.',
    ],
  },
  // The four-session Coaching Block (May to Sep 2026, retired 7 Sep), built on
  // Claude Code before the Crads AI app existed.
  'coaching-block': {
    title: 'Building your own AI executive assistant',
    offer: 'AI coaching block',
    format: 'Four live 1:1 sessions with Sam Davis, PhD, over about a month, with practice between them.',
    covers: [
      'Setting up Claude Code and a working space for their own AI assistant.',
      'Building its model of who they are, what they do and what matters to them.',
      'Connecting it to the tools they work in, such as Google Workspace and their calendar.',
      'Building the layers that run their week (network, goals and workflow) and skills they use.',
    ],
  },
};

const AWARDED = 'Awarded on completing the program\'s live sessions with Sam Davis, PhD.';
const WHAT_IT_IS = 'A completion certificate from Crads AI. It is not an accredited or nationally recognised qualification.';
const EXPIRY = 'No expiry.';

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
  ISSUER, SIGNED_BY, HOST, PROGRAMS, AWARDED, WHAT_IT_IS, EXPIRY,
  ID_ALPHABET, ID_RE, normaliseId, isValidId, newId, checkUrl, linkedinAddUrl, cvLine,
};
