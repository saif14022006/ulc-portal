# ULC Portal

Mobile-first web app (PWA) for **University Law College, Quetta**.

Works as a website on desktop and phone, and can be installed to the home screen like an app. Same codebase — responsive layout adapts: bottom tabs on mobile, sidebar on desktop.

## What’s live (Phase 1)

| Tool | What it does |
|------|----------------|
| **Cover Page** | 4 ULC templates · live A4 preview · Print / Download PDF |
| **Aggregate** | Admission merit: Matric 20% + Intermediate 50% + LAT 30% |
| **Syllabus** | Full HEC LLB (5-Year) scheme · 10 semesters · 166 CH |

More tools (accounts, GPA, timetable, study assistant) will be decided and added later.

## Preview

- **Mobile** — phone-width layout, bottom navigation, installable PWA  
- **Desktop** (≥900px) — left sidebar, two-column cover editor with sticky preview  

## Run locally

PWA install + offline need `http://`, not `file://`.

```bash
# from this folder
python -m http.server 8080
# open http://localhost:8080
```

Or open the folder on [GitHub Pages](https://pages.github.com) / [Vercel](https://vercel.com) after deploy.

## Project files

```
index.html              → app (HTML + CSS + JS)
manifest.webmanifest    → installable app metadata
service-worker.js       → offline cache
icons/                  → app icons + ULC crest
logo.js                 → crest for PDF export
favicon.png
```

## Brand

Navy `#0b3a6b` · Gold `#c6a13c` · Paper `#f5f2ea` · University of Balochistan affiliation.
