'use strict';

/**
 * Centralized Express error handler.
 * Must be registered as the LAST middleware in app.js (4 args).
 *
 * - Never leaks stack traces or secrets to the API client.
 * - Logs the full error server-side for debugging.
 * - Responds with a consistent JSON shape.
 */
function errorHandler(err, req, res, _next) { // eslint-disable-line no-unused-vars
    // Always log server-side — never expose stack to client
    console.error(`[ERROR] ${req.method} ${req.path} →`, err.message);
    if (process.env.NODE_ENV !== 'production') {
        console.error(err.stack);
    }

    // Classify the error by its attached statusCode or type
    const status = err.statusCode || 500;
    const message = err.clientMessage || 'Internal server error';

    res.status(status).json({ success: false, error: message });
}

module.exports = errorHandler;
