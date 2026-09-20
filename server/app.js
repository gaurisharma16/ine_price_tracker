'use strict';
const express = require('express');
const cors = require('cors');
const productRoutes = require('./routes/products');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// CORS — restrict to configured frontend origin
const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:5173';
app.use(cors({
    origin: allowedOrigin,
    methods: ['GET', 'POST', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'x-client-id'],
}));

// Body parsing
app.use(express.json());

// Health check — intentionally outside /api prefix for simple Render uptime checks
app.get('/health', (_req, res) => {
    res.json({ success: true, status: 'ok' });
});

// API routes
app.use('/api/products', productRoutes);
app.use('/api/cron', require('./routes/cron'));
app.use('/api/settings', require('./routes/settings'));

// 404 handler — must come after routes
app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Route not found' });
});

// Centralized error handler — must be last
app.use(errorHandler);

module.exports = app;
