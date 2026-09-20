# Design Note: INE Product Price Tracker

## 1. Overview
This document outlines the technical rationale, architectural decisions, and trade-offs involved in implementing the INE Product Price Tracker. The primary challenge of this project was correctly extracting dynamic, challenge-gated price data from a mock storefront while ensuring backend stability during high-latency automated cron runs.

## 2. Architecture
The application utilizes a distributed, serverless-friendly architecture:
- **Frontend:** React + Vite, deployed to Vercel for fast, edge-cached delivery.
- **Backend:** Express API, deployed to Render using a Docker container to support headless browser binaries.
- **Database:** Supabase (PostgreSQL), utilizing the Service Role Key on the backend to bypass RLS for automated cron operations.
- **Automation:** Playwright for DOM interaction, triggered via HTTP POST by cron-job.org.

## 3. Why Playwright was necessary
Unlike traditional e-commerce sites where prices are rendered server-side or available via clear JSON API endpoints, the mock storefront implements a deliberate proof-of-work mechanism:
1. The price block is hidden behind a dynamic container (`.price-block`).
2. The user (or scraper) must physically move the mouse over the coordinates of this block and dwell for a specific duration.
3. This triggers a dynamically enabled "Reveal price" button.
4. Clicking the button calculates/renders the `.price-success` element.

Standard HTTP scraping (e.g., `axios` + `cheerio`) cannot execute this JavaScript state machine. Playwright was required to manipulate the DOM, intercept the mouse movements, and wait for the precise actionability states of these elements.

## 4. Scraping reliability strategy
Because Playwright operations are inherently flaky (due to network latency, DOM rendering speeds, and mock-storefront obfuscation), reliability is handled programmatically:
- **Browser Lifecycle:** The Chromium browser is instantiated as a singleton on the server to prevent CPU/memory exhaustion from constantly launching and tearing down browser processes. However, a fresh `context` and `page` are created per attempt to ensure state isolation.
- **Retries:** Each product scrape receives up to 3 attempts with exponential backoff.
- **Honest Failure Logging:** If a scrape fails all 3 attempts, it is recorded in `scrape_logs` as `FAILED`, but **no invalid data is ever written** to `price_history`. 
- **Actionability Waits:** Instead of fixed sleeps, Playwright's native locator waits (e.g., `waitFor({ state: 'visible' })` and bounded `.click({ timeout: 2000 })`) are utilized to eliminate race conditions.

## 5. Scheduling design
Cron scheduling is offloaded to cron-job.org rather than running an internal `setInterval` loop in Node.js. This decision was driven by cloud deployment constraints: PaaS providers like Render spin down free-tier instances when idle. An internal timer would die when the server sleeps, whereas an external HTTP trigger guarantees the server wakes up (cold starts) and executes the scrape every 2 hours.

## 6. Cron architecture
The endpoint `/api/cron/scrape-all` validates the `CRON_SECRET` and then uses an **HTTP 202 Detached Execution** pattern. 
cron-job.org imposes a strict 30-second request timeout limit. Since scraping multiple products via Playwright easily exceeds 30 seconds, the Express route immediately returns an HTTP `202 Accepted` response. The actual scraping loop executes safely in the background via a detached asynchronous function guarded by a global `isCronRunning` lock to prevent overlapping runs.

## 7. Failure behavior
Failures are expected and handled gracefully:
- **Attempt 1 Fails:** Logs `RETRIED`, waits 1000ms.
- **Attempt 2 Fails:** Logs `RETRIED`, waits 2000ms.
- **Attempt 3 Fails:** Logs `FAILED`. The product is left alone until the next 2-hour scheduled run.

## 8. Data consistency
Price history is strictly transactional. A row is only inserted into the `price_history` table if the DOM successfully yielded both the `.price-success` and `.stock-badge` elements, and the extracted data passed the `validateData` sanity checks (e.g., checking for `NaN` or negative prices).

## 9. Trade-offs
- **Playwright vs HTTP Parsing:** Playwright consumes significantly more memory and CPU. This necessitates sequential scraping (concurrency = 1) in the background loop to prevent OOM (Out of Memory) crashes on a free-tier Render instance. Parallel scraping would be faster but much riskier.
- **Singleton Browser:** Reusing the browser process drastically reduces latency per scrape, but shares the underlying browser process. Fresh contexts are used to mitigate cookie/session bleed, but a crashed browser process takes down the singleton.

## 10. AI-assisted development and corrections
During development, AI assumptions were tested and subsequently corrected based on real-world behavior:
- **Button Race Condition:** Initially, the AI assumed checking `button.disabled` and clicking it manually would work. However, the DOM dynamically re-renders the button, leading to a race condition where the click was silently swallowed. This was corrected by leveraging Playwright's native `click()` which automatically waits for the element to become stable and enabled.
- **The Cookie Overlay Experiment:** A live investigation revealed that a `.cookie-overlay` banner was intercepting the "Reveal price" click on retry attempts. The AI attempted to fix this by actively dismissing the cookie overlay. However, testing proved that clicking "Accept cookies" caused the mock storefront's internal state to break, leading to a 10-second timeout waiting for the price. The cookie dismissal logic was reverted, relying instead on the 3-attempt retry system to natively bypass the transient DOM state.
- **Cron Timeout & Payload:** The AI initially returned the full scrape results array in the HTTP response. When deployed, cron-job.org failed the job due to both payload size ("output too large") and execution time (30s limit). The AI corrected this by detaching the loop, utilizing `isCronRunning`, and returning a compact JSON response immediately.

## 11. Security
- **Authentication:** The cron endpoint is protected by a standard `Authorization: Bearer CRON_SECRET` header.
- **Secret Management:** No secrets are committed to the repository. The backend uses the Supabase Service Role Key entirely server-side, preventing frontend exposure.
- **Database Safety:** The Express backend abstracts the Supabase interactions; the frontend only accesses data via the secure Node API, never directly hitting the database.

## 12. Future improvements
- Introduce a queueing system (like Redis/BullMQ) to handle scraping jobs robustly across multiple worker nodes instead of an in-memory background loop.
- Implement proxy rotation in Playwright to circumvent potential IP rate-limiting by the target storefront.
