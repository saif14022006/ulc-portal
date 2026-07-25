# ULC Portal

Mobile-first PWA for **University Law College, Quetta**.

## Features

| Area | Tools |
|------|--------|
| **Documents** | Assignment Cover Page (4 templates · Print / PDF) |
| **My academics** | Student Account · Award List (2 assignments, best 3 of 5 quizzes, paper, result) |
| **Study tools** | Collapsible 10-semester syllabus · Aggregate · GPA · Timetable |

## Accounts

Signup: **full name**, **roll number** (optional for teachers), **email**, **password**.  
Login: **email** + **password** only.

Until Supabase is connected, accounts and award lists are stored in the browser (password hashed with SHA-256).

### Connect Supabase later

1. Create a Supabase project  
2. Run `supabase/schema.sql` in the SQL editor  
3. Paste URL + anon key into `js/config.js`

## Award list formula (official ULC sheet)

```
Quizzes (15%)       = average of best 3 of 5 quizzes (each /15)
Assignments (15%)   = average of A1 & A2 (each /15)
Mid semester (30%)  = (marks out of 100) × 0.30
Final semester (40%)= (marks out of 100) × 0.40
Grand marks         = Quiz + Assn + Mid30 + Final40   (out of 100)
Rounded → Grade → GP
```

## Run locally

```bash
npx --yes serve -p 8080
# http://localhost:8080
```

## Brand

ULC crest · Navy `#0b3a6b` · Gold `#c6a13c` · Paper `#f5f2ea`
