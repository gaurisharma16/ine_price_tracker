'use strict';
const { supabase } = require('./supabase');

/**
 * Retrieves a single application-level setting by key.
 * Returns the string value, or null if not set.
 */
async function getAppSetting(key) {
    const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', key)
        .maybeSingle();

    if (error) throw error;
    return data ? data.value : null;
}

/**
 * Creates or updates a single application-level setting.
 */
async function upsertAppSetting(key, value) {
    const { error } = await supabase
        .from('app_settings')
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

    if (error) throw error;
}

module.exports = { getAppSetting, upsertAppSetting };
