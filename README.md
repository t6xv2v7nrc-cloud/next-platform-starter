# Job Application Tracker

A private web app that logs every job application and shows which CV version, sector and source gets replies.

React, Vite, TypeScript and Tailwind on the front end, Recharts for charts, Supabase for data, login and CV storage, Netlify for hosting.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # analytics unit tests
npm run build    # type-check and build to dist/
```

With no Supabase keys set the app runs in **demo mode**: no login, and data is kept in the browser's local storage. That is for trying it out only.

## Connect Supabase

1. In the Supabase SQL editor run `supabase/migrations/0001_init.sql`, then `supabase/migrations/0002_storage.sql`.
2. Authentication > URL configuration: set the Site URL to the Netlify address, and add `http://localhost:5173` as a redirect URL for local work.
3. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Project settings > API). Set the same two variables in Netlify.
4. Sign in with the magic link. The first sign-in loads the 8 seed roles and 2 CV versions.
5. Once you are in, turn off new sign-ups (Authentication > Sign in / Providers > Allow new users to sign up). The app has one user; Row Level Security keeps any other account away from your rows either way.
6. On the CVs screen, use Edit on each seeded version to upload its PDF.

## Row Level Security

Every table has RLS on with an owner-only policy. `supabase/tests/rls_test.sql` checks it with two accounts. To run it against a throwaway local Postgres:

```bash
createdb jt_test
psql -d jt_test -v ON_ERROR_STOP=1 \
  -f supabase/tests/local_shim.sql \
  -f supabase/migrations/0001_init.sql \
  -f supabase/tests/rls_test.sql      # ends with "RLS OK"
```

`local_shim.sql` stands in for Supabase's `auth` schema and roles; never run it on the real project. The Storage policies in `0002_storage.sql` can only be checked on Supabase itself: sign in as a second account and confirm the first account's PDF will not open.

## How the numbers are worked out

- **Sent**: reached Applied or later.
- **Response rate**: sent applications that got any reply (a rejection included), divided by sent. No response and Withdrawn are not replies.
- **Interview rate / offer rate**: reached Interview / Offer or later, divided by sent.
- All of these come from the status events, so an application rejected after an interview still counts as an interview.
- Every rate prints its n. Under 5 the bar is grey and says too few to tell.
- `pay_annual` is derived when read (midpoint of the range, times the Settings multiplier for day or hourly rates), so changing a multiplier updates every application at once.

## Layout

- `src/lib/analytics.ts`: every metric and chart series, as plain functions (tested in `analytics.test.ts`).
- `src/lib/store.ts`: the Supabase store and the demo-mode store behind one interface.
- `src/lib/export.ts`: Export for Claude (Markdown) and CSV.
- `src/pages/`: the seven screens. `src/components/charts.tsx`: the charts.
- `supabase/migrations/`: schema, status event trigger, RLS and Storage policies.

Settings are kept in a small fifth table, `settings`, one row per user.

No analytics, tracking scripts or third-party requests. No LinkedIn integration of any kind.
