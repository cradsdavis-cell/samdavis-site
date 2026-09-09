# archive/

Retired code and engineering documents, kept as the paper trail. Nothing in
here is served (`.vercelignore`), linted (`eslint.config.mjs` ignores
`archive/**`) or tested. Git history is the real backup; this directory
exists so the story is readable without archaeology.

| Folder | What | Retired |
|---|---|---|
| `2026-09-01-self-host-pivot/` | The hosted-era control plane: `/app/*` portal, billing, invitations, pricing, the join/open/paid doors, mineral claim. Crads-AI became free, self-hosted and open source that day. | 2026-09-01 |
| `2026-09-01-account-retirement/` | App sign-in handoff (`app-login`, `app-handoff`, JWKS, `app-token`) and the directory client. The desktop app stopped needing a crads-ai.com account. | 2026-09-01 |
| `2026-09-01-open-download/` | The beta password gate that once sat in front of `/download`. | 2026-09-01 |
| `engineering/superpowers/` | Design specs, plans and reviews from the coaching-site era (May to Aug 2026). | 2026-09-09 |
| `engineering/audit/` | The UI-audit loop (rubric, loop prompt, ledger) that hill-climbed the coaching pages. | 2026-09-09 |
| `engineering/prepaid-booking.md` | A prepaid-booking design note that names a real client. | 2026-09-09 |

Deleted outright on 2026-09-09 rather than archived (git has them): six
publicly served `*.html.bak` files, three one-off KV backfill/seed scripts
(one carried client data and none had their dependency installed), the
`book/ea-basic-build` tombstone and the three meta-refresh stubs
(`onepager`, `build`, `build-onepager`; `vercel.json` already redirects).
