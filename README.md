# DockFlow — Job Board

A single-page job board meant to live on a monitor. Reads and writes a shared
Supabase table, so it stays in sync across every screen that has it open.

## Run it locally

```
npm install
cp .env.example .env   # then paste in your Supabase URL + key (see below)
npm run dev
```

## Point it at your Supabase project

The two values go in `.env`:

- `VITE_SUPABASE_URL` — Project Settings → API → Project URL
- `VITE_SUPABASE_ANON_KEY` — Project Settings → API → anon / publishable key

Both are safe to put in a browser; the anon key is meant to be public.

The database table itself is set up by `supabase-setup.sql` — run it once in
your project's SQL editor (Supabase dashboard → SQL Editor → paste → Run).
That file also explains the access policy it sets up — read the comment
near the top before running it.

## Put it on the office monitor

Open the deployed site's URL in the monitor's browser, full screen. The board
refreshes itself every 20 seconds, so it doesn't need a person at the wheel.
