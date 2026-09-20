'use strict';

const CATALOG_BASE    = 'https://demo.inelabteamdev.com';
const FETCH_TIMEOUT_MS = 10000;



// ─── getProductMetadata — deterministic single-product lookup ─────────────────
// Used by URL search and by the track endpoint to verify a product exists.

async function getProductMetadata(externalId) {
    const url = `${CATALOG_BASE}/api/product/${encodeURIComponent(String(externalId))}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res;
    try {
        res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
    } catch (e) {
        clearTimeout(timer);
        if (e.name === 'AbortError') {
            const err = new Error('Upstream catalog request timed out');
            err.statusCode = 503;
            err.clientMessage = 'Upstream catalog service timed out';
            throw err;
        }
        throw e;
    }
    if (res.status === 404) return null;
    if (!res.ok) {
        const err = new Error(`Upstream catalog responded with ${res.status}`);
        err.statusCode = 502;
        err.clientMessage = 'Upstream catalog service error';
        throw err;
    }
    const item = await res.json();
    if (!item || !item.id) return null;
    return normalizeItem(item);
}

function normalizeItem(item) {
    return {
        external_product_id: String(item.id),
        name:        item.name,
        brand:       item.brand     || null,
        category:    item.category  || null,
        sku:         item.sku       || null,
        product_url: `${CATALOG_BASE}/product/${item.id}`,
    };
}

module.exports = {
    getProductMetadata,
};
