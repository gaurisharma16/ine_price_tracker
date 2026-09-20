'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const app = require('./app');

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
    console.log(`[SERVER] Price Tracker API running on http://localhost:${PORT}`);
    console.log(`[SERVER] CORS allowed origin: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
});
