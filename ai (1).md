# AI Usage Disclosure

[← Back to README](./README.md)

This separates AI tools used **to build** HireZap from AI **inside the product itself**. Only what could be confirmed is claimed; everything else is left as a placeholder for the team to fill in.

## Summary

| Question | Answer |
|---|---|
| Were AI tools used during development? | yes-Cryptile |
| Does the product use AI/ML at runtime? | Yes — an AI-generated candidate score is produced during the interview flow and shown to HR |
| Roughly how much of the code was AI-assisted? | 70-80% |

## 1. AI Tools Used During Development

| Tool | Model / plan | Used by | What it was used for |
|---|---|---|---|
| Claude (Anthropic), claude.ai chat | Not specified | Team | Drafting this submission's documentation (README, this file, architecture, constraints, setup, limitations, resource.md, decision log). No application code was written in this chat. |
| `<any other tool used to write the app itself>` | `<...>` | `<...>` | `<...>` |

## 2. Where AI Helped in the Codebase

AI assisstance was used during deployment for:
-frontend UI development
-Backend /API imlementation
-Debugging and error fixing
-project structure and architecture
-code suggestion and improvements
The final implementation was reviewed and integrated by the team.

## 3. AI Inside the Product (runtime)

**Yes — a candidate score.** Recent commits reference syncing "candidate AI score with HR panel", meaning the product produces an AI-assessed score for a candidate that HR sees. What is not yet documented here:

- Which model or service computes the score (a hosted LLM API, a Supabase edge function calling one, or a custom classifier).
- What inputs it uses (resume, interview video/audio/transcript, the tab-switch/face-tracking signals, or a combination).
- Whether scoring happens live during the interview or afterward.

`<Team: fill in the above from api/ or supabase/functions/ once reviewed.>`

## 4. Key Prompts

`<Not applicable unless the team kept a prompt history.>`

## 5. How AI Output Was Verified
AI-generated code and suggestions were reviewed and tested by the development team.

The team verified the output by:
- Running the application locally
- Testing the implemented features
- Checking API and database functionality
- Testing different user flows
- Fixing errors and modifying generated code where required
- Reviewing the final output before integration

AI-generated candidate assessments are intended to support HR evaluation rather than automatically make the final hiring decision.

## 6. What Was Deliberately Not Done With AI

AI was not given complete authority over the final hiring decision.

The final evaluation and hiring decision remain with the HR/recruitment team.

AI-generated output is treated as supporting information and should be reviewed by a human before making recruitment decisions.

---

**Note:** Section 3 is based on a commit message ("sync candidate AI score with HR panel"), not on reading the scoring code itself. Please confirm the details before submitting.
