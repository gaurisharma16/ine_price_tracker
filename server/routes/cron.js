'use strict';
const express = require('express');
const { randomUUID } = require('crypto');

const { scrapeProduct } = require('../../scraper/scraper');
const { getActiveProducts } = require('../../db/products');
const { createScrapeEvent } = require('../../db/scrapeLogs');
const { insertPriceHistory } = require('../../db/priceHistory');
const scrapeLock = require('../utils/scrapeLock');
const { processAlerts } = require('../services/alertService');

const router = express.Router();

/**
 * Authentication Middleware for Cron Endpoints
 */
router.use((req, res, next) => {
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        console.error('[CRON] CRON_SECRET is not configured on the server.');
        return res.status(500).json({ success: false, error: 'Server configuration error' });
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.split(' ')[1];
    if (token !== cronSecret) {
        return res.status(401).json({ success: false, error: 'Unauthorized cron secret' });
    }

    next();
});

// Reject GET requests
router.get('/scrape-all', (req, res) => {
    res.status(405).json({ success: false, error: 'Method Not Allowed. Use POST.' });
});

// ---------------------------------------------------------------------------
// POST /api/cron/scrape-all
// ---------------------------------------------------------------------------
router.post('/scrape-all', async (req, res) => {
    console.log(`[CRON] Starting scheduled scrape run...`);
    const started_at = new Date().toISOString();
    
    let activeProducts;
    try {
        activeProducts = await getActiveProducts();
    } catch (err) {
        console.error('[CRON] Failed to fetch active products:', err);
        return res.status(500).json({ success: false, error: 'Failed to initialize scheduled run' });
    }

    console.log(`[CRON] Active products: ${activeProducts.length}`);

    const runSummary = {
        success: true,
        started_at,
        completed_at: null,
        total: activeProducts.length,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        results: []
    };

    // Process products sequentially to avoid overwhelming resources (concurrency = 1)
    for (const product of activeProducts) {
        if (scrapeLock.has(product.id)) {
            console.log(`[CRON] Product ${product.external_product_id} is currently being scraped manually. Skipping.`);
            runSummary.skipped++;
            runSummary.results.push({
                product_id: product.id,
                external_product_id: product.external_product_id,
                status: 'SKIPPED',
                reason: 'Already being scraped'
            });
            continue;
        }

        scrapeLock.add(product.id);
        const run_id = randomUUID(); // One unique run_id per product execution
        let scrapeResult;

        try {
            scrapeResult = await scrapeProduct(product.product_url);
        } catch (err) {
            // Unexpected catastrophic failure in scraper wrapper itself
            scrapeResult = {
                success: false,
                attempts: 0,
                attemptHistory: [],
                error: err.message
            };
        } finally {
            scrapeLock.delete(product.id);
        }

        const { success, attemptHistory = [], product: scraped, attempts, error: scrapeError } = scrapeResult;

        if (success) {
            try {
                // Log all intermediate RETRIED attempts
                const retriedAttempts = attemptHistory.slice(0, -1);
                for (const a of retriedAttempts) {
                    await createScrapeEvent({
                        product_id: product.id,
                        run_id,
                        attempt_number: a.attempt,
                        status: 'RETRIED',
                        error_message: a.error,
                    });
                }

                // Final SUCCESS attempt + price history row transactionally
                const finalAttempt = attemptHistory[attemptHistory.length - 1];
                await insertPriceHistory({
                    product_id: product.id,
                    run_id,
                    attempt_number: finalAttempt.attempt,
                    price: scraped.price,
                    stock: scraped.stock,
                });

                // Process alerts asynchronously (it handles its own errors)
                await processAlerts(product.id);

                console.log(`[CRON] Product ${product.external_product_id} → SUCCESS (${attempts} attempts)`);
                runSummary.succeeded++;
                runSummary.results.push({
                    product_id: product.id,
                    external_product_id: product.external_product_id,
                    status: 'SUCCESS',
                    attempts,
                    run_id
                });
            } catch (dbErr) {
                console.error(`[CRON] Product ${product.external_product_id} DB write failed:`, dbErr);
                runSummary.failed++;
                runSummary.results.push({
                    product_id: product.id,
                    external_product_id: product.external_product_id,
                    status: 'FAILED',
                    attempts,
                    error: 'Database error: ' + dbErr.message,
                    run_id
                });
            }
        } else {
            // Failed scrape
            try {
                for (const a of attemptHistory) {
                    await createScrapeEvent({
                        product_id: product.id,
                        run_id,
                        attempt_number: a.attempt,
                        status: a.status,
                        error_message: a.error,
                    });
                }
            } catch (dbErr) {
                console.error(`[CRON] Product ${product.external_product_id} failure log write failed:`, dbErr);
            }

            console.log(`[CRON] Product ${product.external_product_id} → FAILED (${attempts} attempts)`);
            runSummary.failed++;
            runSummary.results.push({
                product_id: product.id,
                external_product_id: product.external_product_id,
                status: 'FAILED',
                attempts,
                error: scrapeError || 'Scrape failed',
                run_id
            });
        }
    }

    runSummary.completed_at = new Date().toISOString();
    console.log(`[CRON] Scheduled run completed: ${runSummary.succeeded} succeeded, ${runSummary.failed} failed, ${runSummary.skipped} skipped`);
    
    // Return only a compact summary — detailed per-product arrays are logged above
    // but omitted from the HTTP response to stay within cron-job.org payload limits.
    res.json({
        success: true,
        message: 'Cron scrape completed',
        processed: runSummary.total,
        succeeded: runSummary.succeeded,
        failed: runSummary.failed,
    });
});

module.exports = router;
