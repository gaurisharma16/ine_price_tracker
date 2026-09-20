const { processAlerts } = require('../services/alertService');
const emailService = require('../services/emailService');

// Mock dependencies
jest.mock('../services/emailService');
const { getHistoryForProduct } = require('../../db/priceHistory');
const { getProductById, getClientsForProduct } = require('../../db/products');
jest.mock('../../db/priceHistory');
jest.mock('../../db/products');

describe('Alert Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getProductById.mockResolvedValue({
            id: 'prod1',
            name: 'Test Product',
            product_url: 'http://test.com'
        });
        getClientsForProduct.mockResolvedValue(['client1']);
        emailService.getRecipientEmail.mockResolvedValue('test@example.com');
    });

    test('First scrape -> no email', async () => {
        getHistoryForProduct.mockResolvedValue([
            { price: 1000, stock: 'In stock' }
        ]);

        await processAlerts('prod1');
        
        expect(emailService.sendPriceDropEmail).not.toHaveBeenCalled();
        expect(emailService.sendBackInStockEmail).not.toHaveBeenCalled();
    });

    test('Price decreases -> price-drop email', async () => {
        getHistoryForProduct.mockResolvedValue([
            { price: 800, stock: 'In stock' }, // current
            { price: 1000, stock: 'In stock' } // previous
        ]);

        await processAlerts('prod1');
        
        expect(emailService.sendPriceDropEmail).toHaveBeenCalled();
        expect(emailService.sendBackInStockEmail).not.toHaveBeenCalled();
    });

    test('Price unchanged/increases -> no email', async () => {
        getHistoryForProduct.mockResolvedValue([
            { price: 1000, stock: 'In stock' }, // current
            { price: 1000, stock: 'In stock' } // previous
        ]);
        await processAlerts('prod1');
        
        getHistoryForProduct.mockResolvedValue([
            { price: 1200, stock: 'In stock' }, // current
            { price: 1000, stock: 'In stock' } // previous
        ]);
        await processAlerts('prod1');

        expect(emailService.sendPriceDropEmail).not.toHaveBeenCalled();
    });

    test('OUT OF STOCK -> IN STOCK -> back-in-stock email', async () => {
        getHistoryForProduct.mockResolvedValue([
            { price: 1000, stock: 'In stock' }, // current
            { price: 1000, stock: 'Out of stock' } // previous
        ]);

        await processAlerts('prod1');
        
        expect(emailService.sendBackInStockEmail).toHaveBeenCalled();
        expect(emailService.sendPriceDropEmail).not.toHaveBeenCalled();
    });

    test('IN STOCK -> IN STOCK -> no email', async () => {
        getHistoryForProduct.mockResolvedValue([
            { price: 1000, stock: 'In stock' }, // current
            { price: 1000, stock: 'In stock' } // previous
        ]);

        await processAlerts('prod1');
        
        expect(emailService.sendBackInStockEmail).not.toHaveBeenCalled();
    });

    test('Email failure does not fail the scrape (catches error)', async () => {
        getHistoryForProduct.mockResolvedValue([
            { price: 800, stock: 'In stock' },
            { price: 1000, stock: 'In stock' }
        ]);
        emailService.sendPriceDropEmail.mockRejectedValue(new Error('SendGrid offline'));

        // Should not throw
        await expect(processAlerts('prod1')).resolves.not.toThrow();
        expect(emailService.sendPriceDropEmail).toHaveBeenCalled();
    });
});
