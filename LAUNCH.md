# First launch checklist

The code is tested (see `TESTING.md`). What's left needs your accounts, money or decisions; I can't do these for you.

## Must have before going public

| # | Item | Why | Your action |
|---|---|---|---|
| 1 | **Domain** | Name chosen: **PDFturtle** (renamed in the code on 2026-11-23). `pdfturtle.com` was free on that date (Cloudflare: $11.17/year + GST). A web search found no similar PDF brand; a professional trademark search is still advised. | Buy `pdfturtle.com`, then point it at the server's IP. |
| 2 | **Ghostscript licence** | Ghostscript is AGPL. A public web service that uses it must publish its full source code, or buy a commercial licence from Artifex. | Choose one: (a) open-source PDFturtle (e.g. on GitHub); (b) buy an Artifex licence; or (c) drop server-side PDF/A and compression. Without Ghostscript, PDF/A stops working and compression falls back to in-browser image recompression. |
| 3 | **Hosting** (done 2026-11-23: AWS Mumbai t4g.medium via `infra/aws/pdfturtle.yaml`, Docker + Caddy via `infra/aws/compose.yaml`; live at `https://15-252-247-212.sslip.io` until the domain points there) | One Linux VM with 2 vCPU and 4 GB RAM covers launch traffic. Examples: Hetzner CX22 (~€4/month), DigitalOcean (~$24/month), AWS Lightsail (~$20/month). Pick a Mumbai region for Indian users. | Create the account and the VM. I'll give you the exact commands: Docker build/run, or Node plus apt packages. |
| 4 | **HTTPS** | Cookies are `Secure` in production, so plain HTTP logins won't work. | Use Caddy in front of the app (automatic Let's Encrypt certificates; 3-line config), or Cloudflare proxy. |
| 5 | **Outbound firewall** | Defence in depth for HTML to PDF and LibreOffice: the server should only reach the public internet. | On the VM, block outbound traffic to `10/8`, `172.16/12`, `192.168/16`, `169.254/16`. |
| 6 | **Legal pages reviewed** | Privacy, Terms and Cookies (`src/pages.js`) describe what the code does, but they were not written by a lawyer. India's DPDP Act 2023 applies once you collect accounts (emails). | Have them reviewed, and add the grievance officer contact. |
| 7 | **Contact email** | Shown on the Contact page (`VITE_CONTACT_EMAIL`). | Create e.g. support@yourdomain. |
| 8 | **Backups** | Accounts live in one SQLite file (`/app/data/pdfturtle.db`). | Turn on VM snapshots, or a daily copy of the file. |

## Optional at launch

| Item | Needs |
|---|---|
| AI Summarizer and Translate via Claude | `ANTHROPIC_API_KEY`. Without it, Summarize works on the device; Translate only works in Chrome with its built-in translator. |
| Paid plans | A payment provider: Razorpay or Stripe for India. |
| Password reset, email verification, signature requests | An email provider (Resend, Amazon SES, Postmark). |
| Google Drive / Dropbox upload | Google and Dropbox developer app keys. |
| Analytics and error tracking | E.g. Plausible (no cookie banner needed) and Sentry. |
| Exact reference font | A Graphik web licence (Commercial Type). Inter is used until then. |

## Launch day

1. `npm run check && npm run e2e` pass.
2. Deploy, then confirm `https://yourdomain/api/health` shows `soffice: true, gs: "native", chrome: true`.
3. Smoke-test from a phone: merge, compress, Word to PDF, sign up / log in.
4. Submit `/sitemap.xml` in Google Search Console.

## Search engines

Each tool has its own address (`/merge-pdf`, `/compress-pdf` …). The server writes each page's title, description, robots and Open Graph tags into the HTML, so crawlers see them without running JavaScript. It also serves `/sitemap.xml` (48 pages: home, 33 tools, workflows, 13 site pages) and `/robots.txt`. Unknown addresses return 404 with `noindex`; login and sign-up are `noindex`. Old `#/tool` links redirect.

Set `PDFTURTLE_SITE_URL=https://yourdomain` in production so canonical links and the sitemap use your real domain. After launch, submit `https://yourdomain/sitemap.xml` in Google Search Console.
