'use strict';
const express = require('express');
const path = require('path');

const { getProductMetadata } = require('../services/catalogService');
const { scrapeProduct } = require(path.join(__dirname, '../../scraper/scraper'));

// Database access functions from Phase 2
const { trackProduct, getTrackedProducts, getActiveProducts, getProductById, deactivateProduct } = require(path.join(__dirname, '../../db/products'));
const { createScrapeEvent, getLogsForProduct } = require(path.join(__dirname, '../../db/scrapeLogs'));
const { insertPriceHistory, getHistoryForProduct } = require(path.join(__dirname, '../../db/priceHistory'));
const { requireClientId } = require('../middleware/clientId');

const router = express.Router();

const scrapeLock = require('../utils/scrapeLock');
const { processAlerts } = require('../services/alertService');
/**
 * Helper: creates an HTTP error with a client-safe message.
 */
function httpError(statusCode, clientMessage, internalMessage) {
    const err = new Error(internalMessage || clientMessage);
    err.statusCode = statusCode;
    err.clientMessage = clientMessage;
    return err;
}

// ---------------------------------------------------------------------------
// GET /api/products/search?q=<query>
// ---------------------------------------------------------------------------
router.get('/search', async (req, res, next) => {
    try {
        const q = (req.query.q || '').trim();
        if (!q) {
            return res.status(400).json({ success: false, error: 'Query parameter "q" is required' });
        }
        if (q.length < 2) {
            return res.status(400).json({ success: false, error: 'Query must be at least 2 characters' });
        }

        let results = [];
        let matchedBy = null;

        // 1. URL SEARCH — DETERMINISTIC
        const urlMatch = q.match(/\/product\/(\d+)/i);
        let isTrustedUrl = false;
        if (urlMatch) {
            if (q.toLowerCase().startsWith('http')) {
                try {
                    const u = new URL(q);
                    if (u.hostname === 'demo.inelabteamdev.com') {
                        isTrustedUrl = true;
                    }
                } catch (e) {
                    // Invalid URL format
                }
            } else if (q.toLowerCase().startsWith('/product/')) {
                isTrustedUrl = true;
            }
        }

        if (urlMatch && isTrustedUrl) {
            const id = urlMatch[1];
            const meta = await getProductMetadata(id);
            if (meta) {
                matchedBy = 'Product link';
                results = [{ ...meta, matchedBy }];
            }
        }

        // 2. SKU SEARCH — regex+direct-fetch
        if (!matchedBy) {
            const normalizedQ = q.replace(/\s+/g, '').toLowerCase();
            const skuMatch = normalizedQ.match(/^[a-z]+-1(\d{4})$/i);
            if (skuMatch) {
                const id = parseInt(skuMatch[1], 10);
                const meta = await getProductMetadata(id);
                if (meta && meta.sku && meta.sku.replace(/\s+/g, '').toLowerCase() === normalizedQ) {
                    matchedBy = 'SKU';
                    results = [{ ...meta, matchedBy }];
                }
            }
        }

        res.json({ success: true, data: results, count: results.length });
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------------
// POST /api/products/track
// Body: { "external_product_id": "709" }
// ---------------------------------------------------------------------------
router.post('/track', requireClientId, async (req, res, next) => {
    try {
        const rawId = req.body && req.body.external_product_id;
        if (!rawId) {
            return res.status(400).json({ success: false, error: '"external_product_id" is required' });
        }
        const externalId = String(rawId).trim();
        if (!/^\d+$/.test(externalId)) {
            return res.status(400).json({ success: false, error: '"external_product_id" must be a numeric string' });
        }

        // Verify the product exists in the upstream catalog — never trust client-supplied name/URL
        const meta = await getProductMetadata(externalId);
        if (!meta) {
            return res.status(404).json({ success: false, error: `Product "${externalId}" not found in catalog` });
        }

        // trackProduct uses upsert with onConflict: external_product_id
        // so tracking an already-tracked product is idempotent — it reactivates/updates it
        const tracked = await trackProduct(req.clientId, {
            external_product_id: meta.external_product_id,
            name: meta.name,
            product_url: meta.product_url,
        });

        res.status(201).json({ success: true, data: tracked });
    } catch (err) {
        // Duplicate unique constraint violation from Supabase returns code '23505'
        if (err.code === '23505') {
            return res.status(409).json({ success: false, error: 'Product is already being tracked' });
        }
        next(err);
    }
});

// ---------------------------------------------------------------------------
// GET /api/products
// ---------------------------------------------------------------------------
router.get('/', requireClientId, async (req, res, next) => {
    try {
        const products = await getTrackedProducts(req.clientId);
        res.json({ success: true, data: products, count: products.length });
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------------
// DELETE /api/products/:id  — deactivate (soft-delete)
// ---------------------------------------------------------------------------
router.delete('/:id', requireClientId, async (req, res, next) => {
    try {
        const { id } = req.params;
        // Basic UUID format guard
        if (!/^[0-9a-f-]{36}$/i.test(id)) {
            return res.status(400).json({ success: false, error: 'Invalid product ID format' });
        }

        const product = await getProductById(id).catch(() => null);
        if (!product) {
            return res.status(404).json({ success: false, error: 'Tracked product not found' });
        }

        const updated = await deactivateProduct(req.clientId, id);
        res.json({ success: true, data: updated, message: 'Product tracking deactivated. History preserved.' });
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------------
// GET /api/products/:id/history
// ---------------------------------------------------------------------------
router.get('/:id/history', async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!/^[0-9a-f-]{36}$/i.test(id)) {
            return res.status(400).json({ success: false, error: 'Invalid product ID format' });
        }

        // Ensure product exists (even if deactivated — history should still be readable)
        const product = await getProductById(id).catch(() => null);
        if (!product) {
            return res.status(404).json({ success: false, error: 'Product not found' });
        }

        const history = await getHistoryForProduct(id);
        res.json({ success: true, data: history, count: history.length });
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------------
// GET /api/products/:id/logs
// ---------------------------------------------------------------------------
router.get('/:id/logs', async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!/^[0-9a-f-]{36}$/i.test(id)) {
            return res.status(400).json({ success: false, error: 'Invalid product ID format' });
        }

        const product = await getProductById(id).catch(() => null);
        if (!product) {
            return res.status(404).json({ success: false, error: 'Product not found' });
        }

        const logs = await getLogsForProduct(id);
        res.json({ success: true, data: logs, count: logs.length });
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------------
// POST /api/products/:id/scrape — manual scrape trigger
// ---------------------------------------------------------------------------
router.post('/:id/scrape', async (req, res, next) => {
    const { id } = req.params;

    try {
        if (!/^[0-9a-f-]{36}$/i.test(id)) {
            return res.status(400).json({ success: false, error: 'Invalid product ID format' });
        }

        // Per-product concurrency guard (process-local)
        if (scrapeLock.has(id)) {
            return res.status(409).json({
                success: false,
                error: 'A scrape is already in progress for this product. Try again shortly.',
            });
        }

        const product = await getProductById(id).catch(() => null);
        if (!product) {
            return res.status(404).json({ success: false, error: 'Tracked product not found' });
        }

        scrapeLock.add(id);

        let scrapeResult;
        try {
            // Use the verified Phase 1 scraper with the trusted product_url from the DB
            scrapeResult = await scrapeProduct(product.product_url);
        } finally {
            scrapeLock.delete(id);
        }

        // Generate a run_id that groups all attempt logs for this one job
        const { randomUUID } = require('crypto');
        const run_id = randomUUID();

        const { success, attemptHistory = [], product: scraped, attempts, error: scrapeError } = scrapeResult;

        // -------------------------------------------------------------------
        // Persist each attempt honestly from attemptHistory
        // -------------------------------------------------------------------
        if (success) {
            // Log all intermediate RETRIED attempts (if any) before the final SUCCESS
            const retriedAttempts = attemptHistory.slice(0, -1); // all but last
            for (const a of retriedAttempts) {
                await createScrapeEvent({
                    product_id: id,
                    run_id,
                    attempt_number: a.attempt,
                    status: 'RETRIED',
                    error_message: a.error,
                });
            }

            // The final successful attempt: use the atomic RPC (insertPriceHistory)
            // which simultaneously writes the SUCCESS scrape_log and the price_history row
            const finalAttempt = attemptHistory[attemptHistory.length - 1];
            await insertPriceHistory({
                product_id: id,
                run_id,
                attempt_number: finalAttempt.attempt,
                price: scraped.price,
                stock: scraped.stock,
            });

            // Process alerts asynchronously (it handles its own errors)
            await processAlerts(id);

            return res.json({
                success: true,
                data: {
                    product: scraped,
                    attempts,
                    attemptHistory,
                    run_id,
                },
            });
        } else {
            // Failed scrape: log all attempts, no price history inserted
            for (const a of attemptHistory) {
                await createScrapeEvent({
                    product_id: id,
                    run_id,
                    attempt_number: a.attempt,
                    status: a.status, // 'RETRIED' or 'FAILED'
                    error_message: a.error,
                });
            }

            return res.status(502).json({
                success: false,
                error: scrapeError || 'Scrape failed',
                data: { attempts, attemptHistory, run_id },
            });
        }
    } catch (err) {
        scrapeLock.delete(id); // ensure cleanup on unexpected error
        next(err);
    }
});

module.exports = router;
