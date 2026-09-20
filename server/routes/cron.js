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

let isCronRunning = false;

// ---------------------------------------------------------------------------
// POST /api/cron/scrape-all
// ---------------------------------------------------------------------------
router.post('/scrape-all', async (req, res) => {
    if (isCronRunning) {
        console.log(`[CRON] Scheduled scrape run requested but already running. Returning 202.`);
        return res.status(202).json({ success: true, message: 'Cron scrape already running' });
    }

    // Immediately return HTTP 202 so cron-job.org does not hit its 30-second timeout
    res.status(202).json({ success: true, message: 'Cron scrape started' });

    isCronRunning = true;
    console.log(`[CRON] Starting scheduled scrape run in background...`);

    // Fire detached async function
    (async () => {
        try {
            const started_at = new Date().toISOString();

            let activeProducts;
            try {
                activeProducts = await getActiveProducts();
            } catch (err) {
                console.error('[CRON] Failed to fetch active products in background task:', err);
                return;
            }

            console.log(`[CRON] Active products: ${activeProducts.length}`);

            const runSummary = {
                success: true,
                started_at,
                completed_at: null,
                total: activeProducts.length,
                succeeded: 0,
                failed: 0,
                skipped: 0
            };

            // Process products sequentially to avoid overwhelming resources (concurrency = 1)
            for (const product of activeProducts) {
                if (scrapeLock.has(product.id)) {
                    console.log(`[CRON] Product ${product.external_product_id} is currently being scraped manually. Skipping.`);
                    runSummary.skipped++;
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
                    } catch (dbErr) {
                        console.error(`[CRON] Product ${product.external_product_id} DB write failed:`, dbErr);
                        runSummary.failed++;
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
                }
            }

            runSummary.completed_at = new Date().toISOString();
            console.log(`[CRON] Scheduled run completed: ${runSummary.succeeded} succeeded, ${runSummary.failed} failed, ${runSummary.skipped} skipped`);
        } catch (e) {
            console.error('[CRON] Unhandled error in background scheduled run:', e);
        } finally {
            console.log(`[CRON] Background scheduled run finalized. Releasing lock.`);
            isCronRunning = false;
        }
    })();
});

module.exports = router;
