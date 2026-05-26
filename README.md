# YouTube Channel Email Scraper Dashboard

This project scrapes public email addresses from YouTube channel pages using Apify, validates the emails with Bouncify and ZeroBounce, saves the results locally, and displays everything in a Next.js dashboard.

## Screenshots

Add your dashboard screenshots here.

### Dashboard Overview

```text
Place dashboard overview screenshot here.
```

### Frontend Scraper Form

```text
Place frontend scraper screenshot here.
```

### Email Validation Results

```text
Place validation results screenshot here.
```

## Bouncify Results

Add your Bouncify dashboard screenshots here.

### Bouncify Bulk Verification

```text
Place Bouncify bulk verification screenshot here.
```

### Bouncify Email Result

```text
Place Bouncify email result screenshot here.
```

## Sample Results

Add example output screenshots or CSV previews here.

### Valid Emails CSV

```text
Place valid email CSV screenshot or sample rows here.
```

### Dual Validation CSV

```text
Place dual validation CSV screenshot or sample rows here.
```

## Features

- Scrape YouTube channel URLs from the terminal or dashboard
- Run the existing Python scraper from the frontend
- Validate scraped emails with Bouncify
- Validate scraped emails with ZeroBounce
- Upload found emails to Bouncify Bulk Verification when bulk mode is enabled
- Download validation results as CSV
- Download valid-only emails as CSV
- Manually validate one email from the dashboard
- View scrape output, email queue, validation results, file health, and scrape history
- Keep API keys server-side in `.env`

## How It Works

The dashboard does not scrape directly in the browser. It sends channel URLs to a backend API route, and the backend runs the Python scraper.

```text
Next.js dashboard
  -> /api/scrape
  -> youtube_scraper.py
  -> Apify YouTube email scraper
  -> Bouncify / ZeroBounce validation
  -> local CSV and JSON output files
  -> dashboard refreshes real data
```

## Main Files

```text
youtube_scraper.py                  Python scraper and validator
.env                                API keys and scraper settings
app/page.jsx                        Next.js dashboard UI
app/api/dashboard/route.js          Reads local output files for dashboard data
app/api/scrape/route.js             Runs the Python scraper from the dashboard
app/api/validate/route.js           Validates one email with both providers
app/api/download/[file]/route.js    Downloads current result files
```

## Setup

Install Python dependencies:

```powershell
pip install -r requirements.txt
```

Install dashboard dependencies:

```powershell
npm install
```

Create/update `.env`:

```env
APIFY_TOKEN=YOUR_APIFY_API_TOKEN
BOUNCIFY_KEY=YOUR_BOUNCIFY_API_KEY
BOUNCIFY_MODE=bulk
ZEROBOUNCE_API_KEY=YOUR_ZEROBOUNCE_API_KEY
VALIDATION_PROVIDERS=bouncify,zerobounce
APIFY_ACTOR_ID=crawlerbros/youtube-email-scraper
TARGET_CHANNELS=https://www.youtube.com/@example
```

## Run From Terminal

```powershell
python youtube_scraper.py
```

The scraper reads `TARGET_CHANNELS` from `.env`.

## Run The Dashboard

```powershell
npm run dev
```

Open:

```text
http://localhost:3000
```

## Scraping From The Dashboard

Use the **Run Scraper** box on the Overview or Channels page.

Paste channel URLs like:

```text
https://www.youtube.com/@freecodecamp
https://www.youtube.com/@Apify
```

The dashboard sends the URLs to `/api/scrape`. The backend runs `youtube_scraper.py` with a temporary `TARGET_CHANNELS_OVERRIDE`, so your `.env` target list is not overwritten.

## Output Files

```text
apify_raw_results.json              Raw Apify scrape results
bouncify_upload.csv                 Emails prepared for Bouncify bulk upload
bouncify_bulk_jobs.csv              Bouncify bulk job history
all_bouncify_checks.csv             Bouncify single-check history
dual_validation_results.csv         Bouncify + ZeroBounce validation results
verified_youtube_creators.csv       Accepted/safe emails
last_frontend_scrape.json           Latest frontend-submitted URLs
scrape_history.json                 Previous frontend scrape runs
```

## Downloads

The dashboard supports downloading:

- Full dual validation results
- Valid-only emails
- Previous scrape history results
- Raw scrape results

## Notes

- Not every real YouTube channel exposes a public email.
- If a channel hides email behind YouTube's "View email address" button, this scraper may not extract it.
- Bouncify single API checks may not appear in the Bouncify Bulk Verification dashboard.
- To make emails appear in the Bouncify dashboard, use:

```env
BOUNCIFY_MODE=bulk
```

## Common Issues

### No emails found

The channels were scraped, but no public emails were exposed. Try smaller creator, business, agency, or tutorial channels.

### Bouncify dashboard does not show results

Make sure `BOUNCIFY_MODE=bulk`. Bulk mode uploads found emails to Bouncify Bulk Verification.

### UnicodeEncodeError on Windows

The scraper forces UTF-8 output to avoid Windows console encoding crashes.

### Apify actor requires payment

Switch `APIFY_ACTOR_ID` to an actor your Apify account can run, or rent the actor in Apify.
