# HireZap — Hire Smarter. Not Harder.

> HackMysuru 1.0 · Phase 1
> Team `<Team Name>` (`<Team ID>`)
> **Live app:** https://hackmysrank.vercel.app/ · **Repository:** https://github.com/seervisuman68-commits/hackmysrank

| 📎 Submission links | 📋 Templates | 🏗️ Architecture | 🛡️ Constraints | ⚙️ Setup | 🤖 AI usage | ⚠️ Limitations |
|---|---|---|---|---|---|---|
| [resource.md](./resource.md) | [resource-templates/](./resource-templates) | [docs/architecture.md](./docs/architecture.md) | [docs/constraints.md](./docs/constraints.md) | [docs/setup.md](./docs/setup.md) | [ai.md](./ai.md) | [docs/limitations.md](./docs/limitations.md) |

---

## A note on fit with the hackathon theme

The HackMysuru submission template this documentation set follows is built around a **civic-governance / clean-Mysuru** problem (waste routing, jurisdiction, citizen complaints). **HireZap is an AI-powered recruitment platform** — a different domain. If HireZap is being submitted to a general or open track of the same hackathon, that's fine; if the track requires a civic-governance solution, please confirm with the organizers before submitting this project under this template. Nothing below has been softened to disguise this mismatch.

---

## 1. Problem Understanding

**Chosen sub-problem:** Hiring is slow and inconsistent. Recruiters manually screen resumes, schedule interviews and compare candidates with no consistent scoring, while candidates get little visibility into where they stand and no fair, uniform evaluation.

- **The gap we saw:** resume screening and interview evaluation are manual and inconsistent between candidates.
- **Why it matters:** slow, biased hiring costs good candidates a fair shot and costs HR teams time.
- **What "solved" looks like for us:** a candidate is screened and interviewed through one flow, gets a clear AI-assisted score, and an HR reviewer sees that score alongside the interview in one panel to make the final call.

## 2. Target Users & Context

| User | Their situation | What they need from HireZap |
|---|---|---|
| Candidate | Applies for a role, wants a fair, transparent evaluation | A clear application and interview flow, and visibility into their status |
| HR / recruiter | Reviews many candidates, needs consistent signals to compare them | An AI-assisted candidate score, and the interview recording/notes, in one panel |

**What's confirmed in the code:** a "Before Interview" screen with routing and tab-switch detection (an anti-cheating signal during a timed step), a candidate AI score that is synced to the HR panel, and a live video component alongside face/pose tracking — consistent with a proctored, on-screen interview step.

## 3. Solution Overview

HireZap takes a candidate from application through an AI-assisted interview to an HR decision, with a score that both sides can see.

**Core flow (as far as confirmed):**
1. Candidate reaches a "Before Interview" step (instructions/checks) before the interview starts.
2. Candidate takes a video interview; tab-switching and, likely, face/pose signals are tracked during it.
3. An AI-generated candidate score is produced and synced to the HR panel.
4. HR reviews the score and the interview in their panel and makes the hiring decision.

**Not yet confirmed:** the exact resume-screening step, onboarding step (implied by the page's own meta description, "from resume screening to onboarding"), and the exact page names beyond "Before Interview" were not read file-by-file. See [docs/limitations.md](./docs/limitations.md).

**Screenshots:** not included yet — add 2–4 from the live app under `docs/images/`.

## 4. Architecture

A React + Vite + TypeScript single-page app (shadcn/ui components) talking to Supabase, which also hosts serverless edge functions and its own database migrations — so, unlike a purely client-side app, real logic (such as the AI scoring) likely runs server-side in Supabase functions.

➡️ Diagram, components, data model and APIs: **[docs/architecture.md](./docs/architecture.md)**

## 5. Tech Stack & AI Usage

**Stack:** React, Vite, TypeScript, shadcn/ui · Supabase (database, auth, edge functions, migrations) · a video-call SDK for the interview · a face/pose-tracking library · `jspdf` / `html2pdf.js` for generated documents (e.g. reports or offer letters) · `react-hook-form` and `zod` for forms and validation.

**AI tools used in development:** `<add here — e.g. which AI tool helped write this code>`
**AI inside the product:** an AI-generated candidate score is core to the product. `<add how it's produced — e.g. which model or service scores the interview>`

➡️ Full disclosure: **[ai.md](./ai.md)**

## 6. Decision Log (Summary)

- **Chose:** an AI-scored video interview with an HR review panel, **over:** `<the alternative you considered>`.
- **Because:** `<the trade-off in one line>`
- **First thing to break at scale:** `<one line>`

➡️ Full decision log: **[resource-templates/decision-log-template.md](./resource-templates/decision-log-template.md)**

## 7. Setup & Run

```bash
git clone https://github.com/seervisuman68-commits/hackmysrank.git
cd hackmysrank
npm install
# create a .env based on Supabase project settings — see docs/setup.md
npm run dev
```

Or try the deployed app at https://hackmysrank.vercel.app/.

➡️ Prerequisites, environment variables and demo accounts: **[docs/setup.md](./docs/setup.md)**

## 8. Known Limitations

- Interview integrity relies on tab-switch (and likely face/pose) detection, which is a signal, not proof, of a candidate's conduct.
- The exact scoring method behind the "candidate AI score" is not documented yet.
- Several pages, API routes and the database schema were not reviewed file-by-file for this document.

➡️ Full list: **[docs/limitations.md](./docs/limitations.md)**

---

## Team

| Name | Role | GitHub |
|---|---|---|
| `<...>` | `<...>` | `@seervisuman68-commits` |

## License

`<MIT / Apache-2.0 / None>`
