# Medical Workforce Passport & Exchange

A staged digital platform to reduce friction in mobilising South Australia's
medical workforce: a practitioner-owned credential passport, organisation-
owned scope decisions, procurement-compliant locum sourcing, and measurable
clinician experience. Initial implementation context: Yorke and Northern
Local Health Network (YNLHN), South Australia.

> Portable evidence is not portable clinical authority. Credential, evidence,
> verification and organisation-issued scope are always separate. Eligibility
> is deterministic and explainable — missing data resolves to
> `INDETERMINATE`, never an optimistic `ELIGIBLE`.

## Programme and ownership

This is a ground-up build by SA Health/YNLHN, not a vendor pitch. IP is held
one-third each by the founding developer, SA Health, and the Department of
the Premier and Cabinet — see `docs/addendum/v0.3-addendum.md` §5 for the
legal review trip-wires this arrangement implies as the programme scales
(a second LHN, a second state, grant funding, Commonwealth co-investment).
Governance is deliberately lightweight at pilot scale and is expected to be
developed further alongside the project as real risks are exposed, not
imposed upfront — see the same document, §6.

## Documents

- `docs/spec/` — the founding v0.2/v1.0 specification set (master spec,
  technical architecture & data model, MVP product spec, business cases,
  implementation & evaluation plan, ADHA/Commonwealth partnership
  proposals). Start with `docs/spec/README.md`.
- `docs/addendum/v0.3-addendum.md` — agreed additions to that baseline:
  cross-organisation fatigue and safety, IMG/visa/Area-of-Need workforce,
  rural generalist procedural pathways, telehealth/virtual care, a
  multi-jurisdiction legal framework, and the adaptive governance approach
  actually being used for this build.

## Repository layout

```
docs/
  spec/                 founding specification set (source documents)
  addendum/              v0.3 addendum (this build's amendments)
packages/
  canonical-model/       shared TypeScript enums/types (API + web apps)
services/
  api/                   Fastify + Prisma modular monolith
    prisma/schema.prisma  canonical data model — start here to understand the domain
    src/modules/          one folder per bounded context (see below)
apps/
  doctor-web/             practitioner-facing PWA (React + Vite)
  hospital-web/           workforce/credentialling-facing web app (React + Vite)
```

### Bounded contexts (`services/api/src/modules/`)

Each module's `index.ts` states what it owns and does not own, per
`docs/spec/01-technical-architecture-data-model-v0.2.docx` §4:

`identity` · `passport` · `assurance` · `scope` · `eligibility` · `exchange`
· `commercial` · `timesheet` · `experience` · `sharing` · `audit`, plus two
added by the v0.3 addendum: `fatigue` (cross-organisation safety) and
`workforceAccess` (IMG/visa/Area-of-Need).

## Running locally

```bash
cp .env.example .env      # adjust if needed
docker compose up -d postgres
npm install
npm run prisma:migrate --workspace services/api
npm run dev:api            # http://localhost:8000
npm run dev:doctor-web      # http://localhost:5173
npm run dev:hospital-web    # http://localhost:5174
```

## Status

This is an initial scaffold: the canonical data model (`prisma/schema.prisma`)
is fleshed out to reflect the full v0.2/v1.0 spec plus the v0.3 addendum: the
API exposes a health check and one read endpoint; the web apps are routed
placeholder screens citing the spec section each will implement, intended as
a concrete starting point for co-design sessions rather than a finished
product. Nothing here has been through privacy, security or clinical safety
review — do not point it at real practitioner data.
