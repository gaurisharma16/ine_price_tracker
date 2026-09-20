/**
 * Shared formatting utilities — no API calls, no side effects.
 */

/** Format a numeric price as "₹1,234" */
export function formatPrice(price) {
  if (price == null || isNaN(price)) return '—';
  return '₹' + Number(price).toLocaleString('en-IN');
}

/** Format an ISO timestamp to a human-readable date+time string */
export function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Shorter format for chart X-axis labels */
export function formatDateShort(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}
