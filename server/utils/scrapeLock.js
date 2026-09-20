'use strict';

// A process-local lock to prevent multiple simultaneous scrapes of the same product.
// This Set tracks the internal UUIDs of products currently being scraped.
// It is shared between manual scrapes (POST /api/products/:id/scrape)
// and scheduled scrapes (POST /api/cron/scrape-all).
const activeScrapes = new Set();

module.exports = {
    has: (id) => activeScrapes.has(id),
    add: (id) => activeScrapes.add(id),
    delete: (id) => activeScrapes.delete(id)
};
