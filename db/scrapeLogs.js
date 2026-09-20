const { supabase } = require('./supabase');

/**
 * Creates a log event for an individual scrape attempt.
 * If this was a successful attempt, you should use insertPriceHistory() instead
 * as it handles the atomic RPC call to insert both the success log and history together.
 * Use this primarily for recording 'FAILED' or 'RETRIED' intermediate attempts.
 */
async function createScrapeEvent({ product_id, run_id, attempt_number, status, error_message = null }) {
    if (status === 'SUCCESS') {
        console.warn('WARNING: createScrapeEvent called with SUCCESS status. ' + 
            'You usually want to call the atomic RPC record_successful_scrape instead to ensure data integrity.');
    }

    const { data, error } = await supabase
        .from('scrape_logs')
        .insert({
            product_id,
            run_id,
            attempt_number,
            status,
            error_message
        })
        .select()
        .single();
        
    if (error) throw error;
    return data;
}

/**
 * Retrieves scrape events/logs for a specific product.
 */
async function getLogsForProduct(product_id) {
    const { data, error } = await supabase
        .from('scrape_logs')
        .select('*')
        .eq('product_id', product_id)
        .order('created_at', { ascending: false });
        
    if (error) throw error;
    return data;
}

module.exports = {
    createScrapeEvent,
    getLogsForProduct
};
