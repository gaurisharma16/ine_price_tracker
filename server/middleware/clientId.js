'use strict';

// UUID v4 validation regex
const uuidv4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireClientId(req, res, next) {
    const clientId = req.headers['x-client-id'];
    
    if (!clientId) {
        return res.status(400).json({ success: false, error: 'Missing x-client-id header' });
    }
    
    if (!uuidv4Regex.test(clientId)) {
        return res.status(400).json({ success: false, error: 'Invalid x-client-id format (must be UUID v4)' });
    }

    req.clientId = clientId;
    next();
}

module.exports = { requireClientId };
