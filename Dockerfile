# Use the official Playwright image — Chromium and all OS-level system libraries
# are pre-installed. No apt-get calls or --with-deps needed.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /app

# ------------------------------------------------------------------
# Install server production dependencies
# ------------------------------------------------------------------
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

# ------------------------------------------------------------------
# Install db production dependencies
# db/ is a sibling package that server/ imports via relative paths
# ------------------------------------------------------------------
COPY db/package*.json ./db/
RUN cd db && npm ci --omit=dev

# ------------------------------------------------------------------
# Install scraper production dependencies
# scraper/ is a sibling package that server/ imports via relative paths
# ------------------------------------------------------------------
COPY scraper/package*.json ./scraper/
RUN cd scraper && npm ci --omit=dev

# ------------------------------------------------------------------
# Copy application source
# The full directory structure is preserved so that relative imports
# like require('../../db/supabase') and require('../../scraper/scraper')
# resolve correctly at /app/db/ and /app/scraper/ respectively.
# ------------------------------------------------------------------
COPY server/ ./server/
COPY db/     ./db/
COPY scraper/ ./scraper/

# Render injects all environment variables via its dashboard.
# The dotenv call in server.js will silently no-op in production
# (no .env file present), which is intentional and correct.
EXPOSE 4000

CMD ["node", "server/server.js"]
