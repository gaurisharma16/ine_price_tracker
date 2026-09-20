'use strict';
const express = require('express');
const { getRecipientEmail, setRecipientEmail } = require('../services/emailService');
const { requireClientId } = require('../middleware/clientId');

const router = express.Router();

// GET /api/settings/email — returns the currently saved notification email
router.get('/email', requireClientId, async (req, res, next) => {
    try {
        const email = await getRecipientEmail(req.clientId);
        res.json({ success: true, email: email || '' });
    } catch (err) {
        next(err);
    }
});

// POST /api/settings/email — saves the notification email
router.post('/email', requireClientId, async (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email || typeof email !== 'string' || !email.includes('@')) {
            return res.status(400).json({ success: false, error: 'Invalid email address' });
        }
        await setRecipientEmail(req.clientId, email.trim());
        res.json({ success: true, email: email.trim() });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
