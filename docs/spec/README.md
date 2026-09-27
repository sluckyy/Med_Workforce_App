# Specification set (v0.2 / v1.0 baseline)

These are the founding documents for the Medical Workforce Passport & Exchange
programme, produced September 2026. They are the source of truth for the
canonical data model, staging, governance intent and roadmap referenced
throughout this repository. Treat them as living documents to be revised as
co-design and pilot evidence accumulate — see `docs/addendum/` for material
that extends or amends them.

| # | Document | Primary audience | What it defines |
|---|---|---|---|
| 00 | Master Specification v0.2 | Programme-wide | End-to-end vision, staged roadmap (YNLHN → statewide → national), product domains, principles |
| 01 | Technical Architecture & Data Model v0.2 | Engineering, architecture | Bounded contexts, canonical entities, state machines, eligibility engine, FHIR mapping, ADRs |
| 02 | YNLHN MVP Product Spec & Data Model v1.0 | Product, engineering, delivery | Build-ready MVP scope, functional requirements, screens, canonical data dictionary, acceptance tests |
| 03 | YNLHN Pilot Business Case v0.2 | YNLHN executive | Why YNLHN should pilot the programme |
| 04 | YNLHN Implementation & Evaluation Plan v0.2 | Pilot steering group | How the pilot is governed, delivered and evaluated |
| 05 | SA Health Statewide Business Case v0.2 | SA Health / DHW executive | Statewide workforce and credential interoperability case |
| 06 | ADHA Technical & Strategic Partnership Proposal v0.2 | Australian Digital Health Agency | National identity/standards alignment (HPI-I, PCA, FHIR) |
| 07 | Commonwealth Partnership Proposal v0.2 | Cwlth Dept of Health, Disability and Ageing | National workforce mobility proposition |

## Non-negotiable design invariant (repeated in every document)

> Portable evidence is not portable clinical authority. Credential, evidence,
> verification and organisation-issued scope are always separate. Eligibility
> is deterministic and explainable, and missing data must never resolve to an
> optimistic pass (`INDETERMINATE`, never a false `ELIGIBLE`).

Every module in `services/api` is built to preserve this invariant even where
functionality is still a stub.

## Relationship to `docs/addendum/`

The addendum captures material developed after v0.2/v1.0 — additions agreed
during initial critique and scoping (fatigue/cross-organisation safety,
IMG/visa/Area-of-Need workforce, rural generalist procedural pathways,
telehealth/virtual care, and a multi-jurisdiction legal framework). Where the
addendum and the original spec differ, the addendum takes precedence for
current build decisions until a formal v0.3 spec revision consolidates them.
