-- Supabase / PostgreSQL Schema for Price Tracker
-- Phase 2: Database Design

-- Enable UUID extension if not already enabled (Supabase usually has it)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. TRACKED PRODUCTS TABLE
-- ==========================================
-- Stores products that are being tracked.
CREATE TABLE tracked_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_product_id TEXT UNIQUE NOT NULL, -- The stable identifier from the store (e.g. "709")
    name TEXT NOT NULL,
    product_url TEXT UNIQUE NOT NULL,
    active BOOLEAN DEFAULT true,              -- Can be toggled to pause tracking
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 2. SCRAPE LOGS TABLE
-- ==========================================
-- Honest logging of every scrape attempt.
CREATE TABLE scrape_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,
    run_id UUID NOT NULL,                     -- Groups attempts belonging to a single scheduled job run
    attempt_number INT NOT NULL CHECK (attempt_number > 0),
    status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILED', 'RETRIED')),
    error_message TEXT,                       -- Populated if status is FAILED or RETRIED
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for querying logs efficiently
CREATE INDEX idx_scrape_logs_product_id_time ON scrape_logs(product_id, created_at DESC);
CREATE INDEX idx_scrape_logs_run_id ON scrape_logs(run_id);

-- ==========================================
-- 3. PRICE HISTORY TABLE
-- ==========================================
-- Stores only successful valid price and stock observations.
CREATE TABLE price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,
    scrape_log_id UUID NOT NULL UNIQUE REFERENCES scrape_logs(id) ON DELETE CASCADE, -- Explicitly links to the source scrape event
    price NUMERIC NOT NULL CHECK (price >= 0), -- Price must be >= 0
    stock TEXT NOT NULL,                       -- E.g. "Only 3 left"
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for retrieving price history efficiently
CREATE INDEX idx_price_history_product_id_time ON price_history(product_id, created_at DESC);


-- ==========================================
-- 4. ATOMIC RPC FUNCTION
-- ==========================================
-- This function guarantees that a successful scrape attempt is recorded 
-- atomically with its corresponding price history.
CREATE OR REPLACE FUNCTION record_successful_scrape(
    p_product_id UUID,
    p_run_id UUID,
    p_attempt_number INT,
    p_price NUMERIC,
    p_stock TEXT
) RETURNS void AS $$
DECLARE
    v_log_id UUID;
BEGIN
    -- 1. Insert the success log and get its ID
    INSERT INTO scrape_logs (product_id, run_id, attempt_number, status)
    VALUES (p_product_id, p_run_id, p_attempt_number, 'SUCCESS')
    RETURNING id INTO v_log_id;

    -- 2. Insert the price history securely linked to the log
    INSERT INTO price_history (product_id, scrape_log_id, price, stock)
    VALUES (p_product_id, v_log_id, p_price, p_stock);
END;
$$ LANGUAGE plpgsql;


-- ==========================================
-- 5. ROW LEVEL SECURITY (RLS)
-- ==========================================
-- Enable RLS on all tables.
ALTER TABLE tracked_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;

-- Note: We intentionally DO NOT create any public access policies.
-- The Express backend uses the Service Role key, which inherently bypasses RLS.
-- This ensures the data is completely hidden from anonymous clients.


-- ==========================================
-- 6. APP SETTINGS TABLE
-- ==========================================
-- Stores a single key/value row per application-level preference.
-- Currently used only for the notification recipient email (key = 'notification_email').
-- Must be created by running this migration once in the Supabase SQL editor.
CREATE TABLE IF NOT EXISTS app_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
-- No public policies — service role key bypasses RLS, same as all other tables.

-- ==========================================
-- 7. CLIENT PRODUCTS (Multi-User Scoping)
-- ==========================================
-- Maps an anonymous client_id to the products they are tracking.
CREATE TABLE IF NOT EXISTS client_products (
    client_id  TEXT NOT NULL,
    product_id UUID REFERENCES tracked_products(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (client_id, product_id)
);

ALTER TABLE client_products ENABLE ROW LEVEL SECURITY;
-- No public policies — service role key bypasses RLS, same as all other tables.
