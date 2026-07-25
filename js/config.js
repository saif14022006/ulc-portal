/* ── Connect Supabase ───────────────────────────────────────────
   1. Create a free project at https://supabase.com
   2. In Supabase → Authentication → Providers → Email:
        turn OFF "Confirm email" (so roll-number signup works instantly)
   3. Open SQL Editor → paste & run the file: supabase/schema.sql
   4. Project Settings → API → copy:
        Project URL  → supabaseUrl
        anon public  → supabaseAnonKey
   5. Paste them below, save, refresh the app.
   Students still sign up with roll + password; the app maps
   roll → roll@students.ulc.local for Supabase Auth.
──────────────────────────────────────────────────────────────── */
window.ULC_CONFIG = {
  supabaseUrl: "https://fkyrxsbhuzfxrlzzykpj.supabase.co",      // e.g. "https://abcdefgh.supabase.co"
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZreXJ4c2JodXpmeHJsenp5a3BqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5Nzk0MjIsImV4cCI6MjEwMDU1NTQyMn0.RAsEoRJIziIZeASJOVdRTP05VBkNKYbq-EQEo79c_ms",  // long JWT starting with eyJ...
};
