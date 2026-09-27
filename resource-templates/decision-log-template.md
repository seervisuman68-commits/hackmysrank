# Decision Log — HireZap: AI-Scored Video Interview with HR Review

[← Back to resource.md](../resource.md)

---

**Project:** HireZap **Decision area:** Interview scoring & HR review flow **Date:** 27-09-2026 **Author(s):** HireZap team

## Q1. What approach did we take, and what did we consider instead?

**Our approach:** Run the candidate through a proctored video interview, produce an AI-assisted score, and give HR one panel where they see that score alongside the interview to make the final call.

`<3–4 sentences: inputs → logic → output. Name the specific files/functions — e.g. the "Before Interview" page, the tab-switch/face-tracking signal, and the Supabase edge function that computes the score.>`

**Alternative(s) considered:** Fully automated AI-based hiring decisions
- Manual interview evaluation without AI assistance
- Resume-only candidate screening

## Q2. Why this approach? What did we give up?

| Dimension | Our approach | Alternative(s) |
|---|---|---|
| Fairness | Use a consistent assessment process and provide the result to HR for review | Completely mannual evalution |
| Speed for HR | AI_assissted scoring provides an additional assessment signal | Fully mannual scoring |
| Candidate review | HR retains the final decision | 

`<2–3 sentences: which dimension decided it, and a real cost you accepted — e.g. the AI score can be wrong or biased, and HR still has to review every candidate.>`

## Q3. What breaks first at larger scale or in production, and how would it be fixed?

| What breaks first | Why (with a rough number if possible) | How it would be fixed |
|---|---|---|
| `<e.g. video SDK cost/limits at N concurrent interviews>` | `<...>` | `<...>` |
| `<e.g. AI scoring consistency across many candidates>` | `<...>` | `<...>` |

**First change to make:** Improve monitoring, error handling and scalability for the video interview and
AI assessment services before significantly increasing production usage.
