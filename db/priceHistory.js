const { supabase } = require('./supabase');

/**
 * Transactionally inserts a SUCCESS scrape event AND its corresponding price history.
 * By calling the PostgreSQL RPC function, we guarantee that the log entry
 * and the history entry are written atomically without partial failure.
 */
async function insertPriceHistory({ product_id, run_id, attempt_number, price, stock }) {
    // Calling the RPC function defined in supabase/schema.sql
    const { data, error } = await supabase
        .rpc('record_successful_scrape', {
            p_product_id: product_id,
            p_run_id: run_id,
            p_attempt_number: attempt_number,
            p_price: price,
            p_stock: stock
        });

    if (error) throw error;
    return true;
}

/**
 * Retrieves the price history for a specific product.
 */
async function getHistoryForProduct(product_id) {
    const { data, error } = await supabase
        .from('price_history')
        .select(`
            id,
            price,
            stock,
            created_at,
            scrape_log_id
        `)
        .eq('product_id', product_id)
        .order('created_at', { ascending: false });
        
    if (error) throw error;
    return data;
}

module.exports = {
    insertPriceHistory,
    getHistoryForProduct
};
