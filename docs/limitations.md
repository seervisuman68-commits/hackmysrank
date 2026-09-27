# Known Limitations

[← Back to README](../README.md)

## Fit with the hackathon theme

The submission template used for this documentation is built for a civic-governance ("Clean Mysuru") problem. HireZap is a recruitment platform, so parts of the template (especially the "Five Hard Constraints") don't naturally apply. See the note in [constraints.md](./constraints.md).

## Confirmed limitations

- **Interview integrity relies on a client-side signal.** Tab-switch detection (and, if used, face/pose tracking) runs in the browser. Like any client-side check, a determined candidate could potentially interfere with it; whether the server independently double-checks anything was not confirmed.
- **The AI scoring method is not documented.** Recent commits show a "candidate AI score" is synced to the HR panel, but what produces that score, what it's based on, and how HR is meant to interpret it are not written down anywhere yet.
- **Camera/microphone/network dependency.** The interview step needs a working camera, microphone and stable connection to the video SDK; there's no confirmed fallback if any of these fail mid-interview.
- **No offline mode.** The app needs a live connection to Supabase and the video SDK to function.

## Coverage gaps in this documentation

- Individual files under `src/pages/`, `src/components/`, `src/hooks/`, `src/integrations/`, `src/lib/` were not opened.
- `supabase/functions/` (edge functions) and `supabase/migrations/` (database schema) were not opened, so the real API behavior and data model are undocumented.
- No `.env.example` was found or confirmed, so the exact environment variables needed to run the project locally are not listed.
- Whether any automated tests exist and pass (there is a `src/test/` folder) was not confirmed.

## Suggested next step

Before submitting, have the team open `supabase/functions/`, `supabase/migrations/`, and `src/pages/`, and update this file, `architecture.md`, `constraints.md` and `setup.md` with the confirmed details — the same way Dhaara's docs were tightened once the real files were read.
