/**
 * Centralized API helper.
 * All communication goes through the Express backend.
 * No Supabase credentials, no database URLs here.
 */

const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

function getClientId() {
  let clientId = localStorage.getItem('price_tracker_client_id');
  if (!clientId) {
    clientId = crypto.randomUUID();
    localStorage.setItem('price_tracker_client_id', clientId);
  }
  return clientId;
}

async function apiFetch(path, options = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': getClientId(),
      ...(options.headers || {})
    },
  });

  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Server returned non-JSON response (status ${res.status})`);
  }

  if (!res.ok) {
    const msg = json?.error || `Request failed with status ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = json;
    throw err;
  }

  return json;
}

export async function searchProducts(query) {
  return apiFetch(`/api/products/search?q=${encodeURIComponent(query)}`);
}

export async function trackProduct(externalProductId) {
  return apiFetch('/api/products/track', {
    method: 'POST',
    body: JSON.stringify({ external_product_id: externalProductId }),
  });
}

export async function getTrackedProducts() {
  return apiFetch('/api/products');
}

export async function deleteTrackedProduct(id) {
  return apiFetch(`/api/products/${id}`, { method: 'DELETE' });
}

export async function getProductHistory(id) {
  return apiFetch(`/api/products/${id}/history`);
}

export async function getProductLogs(id) {
  return apiFetch(`/api/products/${id}/logs`);
}

export async function scrapeProduct(id) {
  return apiFetch(`/api/products/${id}/scrape`, { method: 'POST' });
}

export async function getAlertEmail() {
  return apiFetch('/api/settings/email');
}

export async function saveAlertEmail(email) {
  return apiFetch('/api/settings/email', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}
