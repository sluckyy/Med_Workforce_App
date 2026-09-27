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
- `docs/DEPLOY_AZURE.md` — how to put this live on Azure Container Apps so
  others can give feedback, including the one-click GitHub Actions path.

## Repository layout

```
docs/
  spec/                 founding specification set (source documents)
  addendum/              v0.3 addendum (this build's amendments)
  DEPLOY_AZURE.md         how to run this live on Azure
packages/
  canonical-model/       shared TypeScript enums/types (API + web apps)
services/
  api/                   Fastify + Prisma modular monolith
    prisma/schema.prisma  canonical data model — start here to understand the domain
    prisma/migrations/     versioned migration history (generated, applied and verified against a real Postgres before commit)
    src/modules/          one folder per bounded context (see below)
apps/
  doctor-web/             practitioner-facing PWA (React + Vite)
  hospital-web/           workforce/credentialling-facing web app (React + Vite)
infra/azure/main.bicep    Container Apps + PostgreSQL Flexible Server + ACR
.github/workflows/        provision-azure.yml (first deploy), deploy-azure.yml (every push to main)
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

## Deploying to Azure (so others can see it and give feedback)

See `docs/DEPLOY_AZURE.md` for the full walkthrough. Short version: add three
GitHub repository secrets (`AZURE_CREDENTIALS`, `PG_ADMIN_PASSWORD`,
`JWT_SECRET_KEY`), then run the **Provision Azure (first deployment)**
workflow from the Actions tab. It creates everything (Container Apps,
PostgreSQL, ACR), builds and deploys all three images, and prints the
doctor-web and hospital-web URLs in the job summary. After that, every push
to `main` deploys automatically via **Deploy to Azure Container Apps**.

I (the assistant) have no credentials into your Azure tenant and cannot
provision anything there directly — the GitHub Actions workflow does the
deploying, authenticated with a service principal you create yourself.

## Status

This is an initial scaffold: the canonical data model (`prisma/schema.prisma`)
is fleshed out to reflect the full v0.2/v1.0 spec plus the v0.3 addendum, and
has real migrations (`prisma/migrations/`) generated and applied against a
live PostgreSQL instance, not just written by hand; the API exposes a
health/readiness check (the latter verifies the database connection) and one
read endpoint; the web apps are routed placeholder screens citing the spec
section each will implement, each showing a live "API connectivity"
indicator, intended as a concrete starting point for co-design sessions
rather than a finished product. Nothing here has been through privacy,
security or clinical safety review — do not point it at real practitioner
data.

The **Identity & Access** bounded context (`services/api/src/modules/identity`)
is the first module built out past its stub: password auth, short-lived JWT
access tokens, rotating opaque refresh tokens (hashed at rest, reuse
detection on rotation), and coarse RBAC via `OrganisationMembership` against
the role vocabulary in the spec's §24 RBAC/ABAC table. Doctors self-register
(`POST /v1/auth/register`); organisation staff accounts are provisioned by an
existing `PLATFORM_SECURITY_ADMIN` (`POST /v1/organisations/:id/members`)
rather than self-serve, since an organisation role grants access to other
people's data. Every auth action is appended to the `audit` module's
`AuditEvent` stream. Known gaps, not silent omissions: MFA is modelled
(`User.mfaEnabled`) but not enforced (no TOTP flow yet), and staff
provisioning sets a temporary password directly rather than emailing an
invite link. The other eleven bounded contexts remain stubs.
