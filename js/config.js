/* ── Connect Supabase ───────────────────────────────────────────
   1. Create a free project at https://supabase.com
   2. In Supabase → Authentication → Providers → Email:
        turn OFF "Confirm email" (instant signup with real email)
   3. Open SQL Editor → run supabase/schema.sql then migrate-fix.sql
   4. Project Settings → API → copy URL + anon key below
   5. App login uses real email + password (students & teachers).
      profiles.contact stores the user's email address.
   6. Forgot password (email primary path):
      a) Deploy Edge Function (from repo root, after `npx supabase login`):
         npx supabase functions deploy send-temp-password --project-ref fkyrxsbhuzfxrlzzykpj
      b) Create a free Resend account → API Keys → copy key, then:
         npx supabase secrets set RESEND_API_KEY=re_xxxxxxxx --project-ref fkyrxsbhuzfxrlzzykpj
         npx supabase secrets set RESET_FROM_EMAIL="ULC Toolkit <onboarding@resend.dev>" --project-ref fkyrxsbhuzfxrlzzykpj
         (For production, verify your domain in Resend and use that FROM address.)
      c) Optional backup (no email): run supabase/migrate-temp-password.sql once
         so the app can still mint a temp password on-screen if the function is down.
   7. Hardened client: js/ulc-cloud.js (retries, health ping, batch awards)
   8. Heavy load test: npm run load-test:full
──────────────────────────────────────────────────────────────── */
window.ULC_CONFIG = {
  supabaseUrl: "https://fkyrxsbhuzfxrlzzykpj.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZreXJ4c2JodXpmeHJsenp5a3BqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5Nzk0MjIsImV4cCI6MjEwMDU1NTQyMn0.RAsEoRJIziIZeASJOVdRTP05VBkNKYbq-EQEo79c_ms",
  // Optional for load tools only — paste service_role from Project Settings → API.
  // Prefer env: $env:ULC_SERVICE_ROLE_KEY="..." ; npm run load-test:full
  // Never commit a real service_role key.
  supabaseServiceRoleKey: "",
  // Password-reset email redirect (optional). Add the same URL under
  // Supabase → Authentication → URL Configuration → Redirect URLs.
  // Leave blank to use the current page (?ulc_reset=1). For the Android app,
  // also allow https://localhost/**
  passwordResetRedirect: "",
};
