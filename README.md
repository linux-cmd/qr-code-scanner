# LinkLens

LinkLens is a Cloudflare Pages-ready QR code scanner and link checker with browser-side scanning/cropping, deterministic URL reliability checks, optional AI explanations, AdSense readiness, and SEO content pages.

Built by Abhijay Panwar, a student developer based in Texas.

## Features

- Upload, drag/drop, paste, and camera QR scanning.
- Browser-side QR crop export as PNG.
- URL-only reliability checks with deterministic scoring and optional commercially reviewed threat providers.
- AI explanation runs only after the user clicks `Get AI analysis`.
- Groq-first AI provider flow with Gemini fallback when configured and the primary provider fails, rate-limits, or times out.
- Turnstile and KV-backed rate limits for the AI endpoint.
- AdSense Auto Ads script loads only when configured.
- LinkLens brand assets, SEO metadata, sitemap, robots.txt, and content hub pages.

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

3. Add the required Groq secret and any optional provider secrets in Cloudflare Pages:

```text
GROQ_API_KEY
GEMINI_API_KEY
GOOGLE_WEB_RISK_API_KEY
THREAT_FEEDS_ENABLED
GOOGLE_WEB_RISK_ENABLED
TURNSTILE_SECRET_KEY
VITE_TURNSTILE_SITE_KEY
VITE_SITE_URL
VITE_ADSENSE_CLIENT_ID
ADSENSE_PUBLISHER_ID
```

Threat providers are disabled by default. The app works with deterministic heuristics and Groq only. Enable optional providers one at a time only after terms verification; Google Web Risk also requires a billed Google Cloud project.

4. Create KV namespaces and replace the placeholder IDs in `wrangler.toml`:

```text
AI_ANALYSIS_CACHE
RATE_LIMIT_KV
THREAT_INTEL_CACHE
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

The primary scan endpoint is `POST /api/scan`. `POST /api/url-check` remains as a compatibility wrapper.

## Deployment

Deploy with Cloudflare Pages using:

- Build command: `npm run build`
- Build output directory: `dist`
- Functions directory: `functions`

`public/ads.txt` is generated during build only when `ADSENSE_PUBLISHER_ID` is set, so local builds without that variable do not publish an invalid ads.txt file.

The current canonical SEO base URL is:

```text
https://linklens.abhijay-s-panwar.workers.dev
```

When the custom domain is ready, update `VITE_SITE_URL`, static canonical links, `robots.txt`, and `sitemap.xml` to `https://getlinklens.app`.
