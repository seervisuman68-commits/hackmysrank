# Setup & Run

[← Back to README](../README.md)

## Try the live app

Open https://hackmysrank.vercel.app/. `<Add demo candidate and HR logins here once confirmed — do not publish real accounts.>`

## Prerequisites

- **Node.js** and **npm** (or `bun`, since a `bun.lock` file is present in the repo).
- **A Supabase project** — this app's backend (database, auth, edge functions) runs on Supabase.
- **A camera and microphone** — needed for the video interview step.
- **Git**, to clone the repository.

## Getting the code

```bash
git clone https://github.com/seervisuman68-commits/hackmysrank.git
cd hackmysrank
```

## Environment variables

No `.env.example` was confirmed in this repository. At minimum, a Supabase URL and public/anon key are almost certainly required by `src/integrations/` — check that folder and `supabase/config.toml` for the exact variable names, and any key needed by the video-call SDK. Create a `.env` file with those values; do not commit it.

## Install dependencies

```bash
npm install
```

## Run

```bash
npm run dev
```

This starts the Vite dev server. `<Confirm the exact script name and port from package.json's "scripts" block.>`

## Supabase (local or hosted)

`supabase/migrations/` defines the database schema, and `supabase/functions/` holds edge functions (very likely including the candidate AI scoring). To run against your own Supabase project:

1. Create a Supabase project and note its URL and keys.
2. Apply the migrations in `supabase/migrations/` to that project.
3. Deploy the functions in `supabase/functions/` to that project.
4. Put the resulting URL/keys in your `.env`.

`<Team: confirm these steps against supabase/config.toml.>`

## Deployment

The live app is hosted on Vercel at https://hackmysrank.vercel.app/. `<Confirm whether a vercel.json exists and what it configures.>`

## Demo accounts

`<Not confirmed — add candidate and HR demo logins here if the app seeds any, the way Dhaara's setup.md did.>`

## Not specified in the repository

- No `.env.example` was confirmed.
- No test command was confirmed, despite a `src/test/` folder existing.
- Offline behavior: not supported, as far as confirmed.

See also [architecture.md](./architecture.md).
