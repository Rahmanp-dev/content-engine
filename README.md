# Content Intelligence Engine

A production-ready **Next.js 15** application that replaces n8n entirely.  
The dashboard drives 7 API route handlers for competitive content intelligence.

## How it works

```
Browser → /api/scrape → /api/scrape-results → /api/transcribe
       → /api/transcript-status → /api/analyze → /api/generate → /api/save-doc
```

Each API route has a `maxDuration` of 60s. The browser drives polling.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router + Turbopack) |
| Language | TypeScript (strict mode) |
| Runtime | React 19 (Server + Client Components) |
| Fonts | `next/font/google` — zero-FOUT loading |
| Styling | Vanilla CSS with CSS custom properties |
| APIs | Apify, AssemblyAI, Google Gemini, Google Docs |

---

## Deploy in 5 steps

### 1. Get your API keys

| Service     | Where                                              | Used for          |
|-------------|----------------------------------------------------|-----------------  |
| Apify       | console.apify.com → Account → Integrations        | Scraping          |
| AssemblyAI  | assemblyai.com/app/account                        | Transcription     |
| Gemini API  | aistudio.google.com/app/apikey                     | Analysis + Concepts|
| Google      | See step 3 below                                  | Saving to Docs    |

### 2. Install & deploy

```bash
npm install
vercel deploy
```

### 3. Set up Google Service Account (for Google Docs)

1. Go to console.cloud.google.com
2. Create a new project (or use existing)
3. Enable **Google Docs API** and **Google Drive API**
4. IAM & Admin → Service Accounts → Create Service Account
5. Download the JSON key file
6. Copy your target Google Drive folder URL, grab the folder ID from it
7. Share that folder with the service account email (Editor access)

### 4. Add environment variables in Vercel

```
APIFY_TOKEN                   = apify_api_...
ASSEMBLYAI_API_KEY            = your_key_here
GEMINI_API_KEY                = your_gemini_api_key_here
GOOGLE_SERVICE_ACCOUNT_EMAIL  = name@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY            = "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"
GOOGLE_DRIVE_FOLDER_ID        = your_folder_id_here
```

### 5. Production deploy

```bash
vercel --prod
```

---

## Local development

```bash
npm install
cp .env.example .env.local   # fill in your keys
npm run dev                   # runs with Turbopack at localhost:3000
```

---

## Estimated cost per run

| Service     | Cost         |
|-------------|--------------|
| Apify       | $1–3         |
| AssemblyAI  | $0.50–1.00   |
| Gemini API  | Free tier    |
| Vercel      | Free tier    |
| **Total**   | **~$2–5/week** |

---

## File structure

```
content-engine/
├── src/
│   ├── app/
│   │   ├── layout.tsx              ← Root layout (fonts, SEO, metadata)
│   │   ├── globals.css             ← Design system
│   │   ├── page.tsx                ← Dashboard (client component)
│   │   └── api/
│   │       ├── scrape/route.ts     ← Starts Apify scrapers
│   │       ├── scrape-results/route.ts ← Polls Apify for video list
│   │       ├── transcribe/route.ts ← Submits videos to AssemblyAI
│   │       ├── transcript-status/route.ts ← Polls all transcripts
│   │       ├── analyze/route.ts    ← Gemini competitive analysis
│   │       ├── generate/route.ts   ← Gemini concept generation
│   │       └── save-doc/route.ts   ← Creates Google Doc
│   ├── components/
│   │   ├── chip-input.tsx          ← Tag/chip input component
│   │   ├── concept-card.tsx        ← Concept display card
│   │   ├── stage-progress.tsx      ← Pipeline stage visualizer
│   │   ├── status-pill.tsx         ← Status indicator pill
│   │   ├── terminal-log.tsx        ← Auto-scrolling log viewer
│   │   └── toast.tsx               ← Notification toast
│   └── lib/
│       └── api-helpers.ts          ← Shared API utilities
├── package.json
├── tsconfig.json
├── next.config.ts
├── .env.example
└── README.md
```
