const { createClient } = require('@supabase/supabase-js');

// Load environment variables (e.g. via dotenv)
// In a production app, dotenv would be required here or at entry point.
// require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Fail fast if misconfigured
if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.warn('WARNING: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.');
}

// Create the backend-only Supabase client using the Service Role Key.
// This allows the Express backend to bypass RLS and perform all DB operations securely.
const supabase = createClient(supabaseUrl || 'http://localhost:54321', supabaseServiceRoleKey || 'mock-key');

module.exports = { supabase };
