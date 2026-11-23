# WayGo

## Supabase setup

1. Copy `.env.example` to `.env.local` for local development. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the project URL and publishable/anon key. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for the Express server only. Never use the service-role key in a `VITE_` variable or frontend code.
2. Apply both migrations in `supabase/migrations/` to the same project using the Supabase SQL editor or Supabase CLI (`supabase db push`).
3. In Supabase Auth settings, configure the site URL and allowed redirect URLs for local development and the deployed app. Configure email OTP delivery there as well.

## Run and deploy

Install dependencies with `npm install`, then run `npm run dev`. Create a production bundle with `npm run build`; `npm run preview` serves that bundle locally. Production carpool APIs run through the Express server (`npm start`), so deploy the built frontend and Express server together or proxy `/api/*` to that server. Configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as private server environment variables; configure only the Vite URL and publishable key in frontend hosting. Set the deployed site URL in Supabase Auth redirect settings.

The app uses Supabase Auth for identity and `public.user_data` for user-owned rides, timetable, and settings. Carpool presence, link-up requests, and call signals are stored in short-lived server-only tables. The Express API verifies each bearer token and associates records with the authenticated user; carpool rows expire after 60 seconds (3 minutes for spawned test commuters), link-ups after 10 minutes, and call signals after 45 seconds. Browser roles have no direct grants on those tables.
