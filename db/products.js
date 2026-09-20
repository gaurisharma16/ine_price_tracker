const { supabase } = require('./supabase');

/**
 * Tracks a new product or updates it if already tracked.
 * @param {Object} product - e.g. { external_product_id: '709', name: 'Product Name', product_url: '...' }
 */
async function trackProduct(clientId, product) {
    // 1. Ensure the product exists in the global tracked_products table
    const { data: productData, error: productError } = await supabase
        .from('tracked_products')
        .upsert({
            external_product_id: product.external_product_id,
            name: product.name,
            product_url: product.product_url,
            active: true,
            updated_at: new Date().toISOString()
        }, {
            onConflict: 'external_product_id'
        })
        .select()
        .single();
        
    if (productError) throw productError;

    // 2. Link this product to the specific client
    const { error: linkError } = await supabase
        .from('client_products')
        .upsert({
            client_id: clientId,
            product_id: productData.id,
            created_at: new Date().toISOString()
        }, {
            onConflict: 'client_id, product_id'
        });

    if (linkError) throw linkError;

    return productData;
}

/**
 * Retrieves a list of all tracked products.
 */
async function getTrackedProducts(clientId) {
    // Fetch products that this client is tracking
    const { data, error } = await supabase
        .from('client_products')
        .select(`
            product_id,
            tracked_products (*)
        `)
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
        
    if (error) throw error;
    // Flatten the joined data
    return data.map(row => row.tracked_products).filter(Boolean);
}

/**
 * Retrieves a list of products that are currently active (for scheduled scraping).
 */
async function getActiveProducts() {
    const { data, error } = await supabase
        .from('tracked_products')
        .select('*')
        .eq('active', true);
        
    if (error) throw error;
    return data;
}

/**
 * Retrieves a specific product by its internal UUID.
 */
async function getProductById(id) {
    const { data, error } = await supabase
        .from('tracked_products')
        .select('*')
        .eq('id', id)
        .single();
        
    if (error) throw error;
    return data;
}

/**
 * Deactivates a product so it is no longer tracked.
 */
async function deactivateProduct(clientId, id) {
    // Instead of globally deactivating the product, we just unlink it from this client.
    // The cron will still scrape it if other clients are tracking it.
    const { error } = await supabase
        .from('client_products')
        .delete()
        .match({ client_id: clientId, product_id: id });
        
    if (error) throw error;
    
    // Return a dummy object since the original expected the deactivated product
    return { id, active: false };
}

/**
 * Retrieves all client IDs that are tracking a specific product.
 */
async function getClientsForProduct(productId) {
    const { data, error } = await supabase
        .from('client_products')
        .select('client_id')
        .eq('product_id', productId);
        
    if (error) throw error;
    return data.map(row => row.client_id);
}

module.exports = {
    trackProduct,
    getTrackedProducts,
    getActiveProducts,
    getProductById,
    deactivateProduct,
    getClientsForProduct
};
