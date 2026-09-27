# Presentation Outline — HireZap

[← Back to resource.md](../resource.md)

**Project:** HireZap **Team:** Cryptile **Length:** 10
**Live app:** https://hackmysrank.vercel.app/ **Repository:** https://github.com/seervisuman68-commits/hackmysrank

---

## Slide 1. Title
- HireZap: "Hire Smarter. Not Harder." — AI does the work, HR makes the decisions, candidates get fairness.
- cryptile.

## Slide 2. The problem
- Resume screening and interview evaluation are manual and inconsistent between candidates.
- `<one concrete example or number, if you have one>`

## Slide 3. Users
| User | What HireZap gives them |
|---|---|
| Candidate | A clear application and proctored interview flow |
| HR / recruiter | A candidate AI score alongside the interview, in one panel |

## Slide 4. The solution
- **One line:** an AI-scored video interview with an HR review panel.
- **Flow:** `<Apply> → Before Interview → Video Interview (proctored) → AI Score → HR Review → Decision`

## Slide 5. Live demo
1. `<candidate applies>`
2. `<Before Interview step>`
3. `<video interview, with the tab-switch/proctoring signal visible>`
4. `<HR panel showing the score>`

*Keep screenshots as a backup.*

## Slide 6. Architecture
- React + Vite SPA → Supabase (database, auth, edge functions).
- Video-call SDK for the interview; face/pose-tracking library for proctoring.
- `<one line on why these tools>`

## Slide 7. Key decisions and trade-offs
| Decision | Alternative considered | What we gave up |
|---|---|---|
| `<...>` | `<...>` | `<...>` |

## Slide 8. AI usage
- **Used to build it:** `<tools>`
- **Inside the product:** the candidate AI score. `<how it's computed>`

## Slide 9. Limitations and what's next
- `<top 2–3 limitations, from docs/limitations.md>`
- **First change to make:** `<...>`

## Slide 10. Team and links
- Team, live app, repository, documents.

---

### Before presenting
- [ ] The AI usage slide matches `ai.md`.
- [ ] At least one real trade-off or limitation is stated.
- [ ] Confirm this presentation format/length against the actual track rules — this outline follows the same shape used for a different (civic) project's submission.
