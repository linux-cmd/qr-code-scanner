# QR Code Scanner

A Cloudflare Pages-ready QR web app with browser-side scanning/cropping, deterministic URL reliability checks, optional AI explanations, and AdSense Auto Ads support.

## Features

- Upload, drag/drop, paste, and camera QR scanning.
- Browser-side QR crop export as PNG.
- URL-only reliability checks with deterministic scoring and optional Google Web Risk support.
- AI explanation runs only after the user clicks `Get AI analysis`.
- Groq-first AI provider flow with Gemini fallback only on explicit Groq rate-limit responses.
- Turnstile and KV-backed rate limits for the AI endpoint.
- AdSense Auto Ads script loads only when configured.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` into Cloudflare Pages environment variables. Keep provider and model names in env:

```text
AI_PRIMARY_PROVIDER=groq
AI_PRIMARY_MODEL=llama-3.1-8b-instant
AI_FALLBACK_PROVIDER=gemini
AI_FALLBACK_MODEL=gemini-2.5-flash-lite
```

3. Add secrets in Cloudflare Pages:

```text
GROQ_API_KEY
GEMINI_API_KEY
GOOGLE_WEB_RISK_API_KEY
TURNSTILE_SECRET_KEY
VITE_TURNSTILE_SITE_KEY
VITE_ADSENSE_CLIENT_ID
ADSENSE_PUBLISHER_ID
```

4. Create KV namespaces and replace the placeholder IDs in `wrangler.toml`:

```text
AI_ANALYSIS_CACHE
RATE_LIMIT_KV
```

## Development

```bash
npm run dev
npm test
npm run build
```

For Pages Functions locally:

```bash
npm run dev:pages
```

Use `npm run dev` only for frontend-only work. The AI and URL-check endpoints are Cloudflare Pages Functions, so they require `npm run dev:pages` locally. That command copies server-side values from `.env.local` into ignored `.dev.vars` for Wrangler.

## Deployment

Deploy with Cloudflare Pages using:

- Build command: `npm run build`
- Build output directory: `dist`
- Functions directory: `functions`

`public/ads.txt` is generated during build only when `ADSENSE_PUBLISHER_ID` is set, so local builds without that variable do not publish an invalid ads.txt file.
