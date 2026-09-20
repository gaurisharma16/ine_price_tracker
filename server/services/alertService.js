'use strict';
const { getHistoryForProduct } = require('../../db/priceHistory');
const { getProductById, getClientsForProduct } = require('../../db/products');
const emailService = require('./emailService');

async function processAlerts(productId) {
    try {
        // Fetch price history (ordered by created_at DESC)
        // Since this is called AFTER insertPriceHistory, index 0 is the current scrape,
        // and index 1 is the previous successful scrape.
        const history = await getHistoryForProduct(productId);
        
        if (history.length < 2) {
            // First scrape, no previous history to compare against
            return;
        }

        const current = history[0];
        const previous = history[1];

        const product = await getProductById(productId);

        // PRICE-DROP ALERT
        const isPriceDrop = current.price < previous.price;

        // BACK-IN-STOCK ALERT
        const outOfStockStr = 'out of stock';
        const isCurrentlyInStock = current.stock.toLowerCase() !== outOfStockStr;
        const wasPreviouslyOutOfStock = previous.stock.toLowerCase() === outOfStockStr;
        const isBackInStock = isCurrentlyInStock && wasPreviouslyOutOfStock;

        if (!isPriceDrop && !isBackInStock) {
            return; // No alerts to send
        }

        // Fan out alerts to all clients tracking this product
        const clientIds = await getClientsForProduct(productId);
        
        for (const clientId of clientIds) {
            try {
                const recipientEmail = await emailService.getRecipientEmail(clientId);
                if (!recipientEmail) continue;

                if (isPriceDrop) {
                    await emailService.sendPriceDropEmail(recipientEmail, product, current, previous);
                }
                
                if (isBackInStock) {
                    await emailService.sendBackInStockEmail(recipientEmail, product, current);
                }
            } catch (err) {
                console.error(`[ALERTS] Failed to send alert to client ${clientId} for product ${productId}:`, err);
            }
        }

    } catch (err) {
        // "Email sending must NEVER cause scraping to fail"
        console.error(`[ALERTS] Failed to process alerts for product ${productId}:`, err);
    }
}

module.exports = {
    processAlerts
};
