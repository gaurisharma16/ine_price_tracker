import { useState, useRef } from 'react';
import { searchProducts } from '../api.js';

export default function SearchSection({ onTrack, trackedIds }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null); // null = not searched yet
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tracking, setTracking] = useState({}); // { [externalId]: bool }
  const inputRef = useRef(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) {
      setError('Enter at least 2 characters to search.');
      return;
    }
    setError(null);
    setLoading(true);
    setResults(null);
    try {
      const res = await searchProducts(q);
      setResults(res.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTrack = async (item) => {
    setTracking(t => ({ ...t, [item.external_product_id]: true }));
    try {
      await onTrack(item.external_product_id, item.name);
    } finally {
      setTracking(t => ({ ...t, [item.external_product_id]: false }));
    }
  };

  const isAlreadyTracked = (id) => trackedIds.includes(id);

  return (
    <section className="search-section">
      <p className="section-title">Search Catalog</p>

      <form className="search-form" onSubmit={handleSearch}>
        <input
          ref={inputRef}
          className="search-input"
          type="text"
          placeholder="Enter product SKU, or paste product link..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-label="Search products"
          id="search-input"
        />
        <button
          className="btn btn-primary"
          type="submit"
          disabled={loading}
          id="search-btn"
        >
          {loading ? <><span className="inline-spinner" /> Searching…</> : '🔍 Search'}
        </button>
      </form>

      {error && (
        <div className="state-box" style={{ padding: '20px', marginBottom: 0 }}>
          <span>⚠️ {error}</span>
        </div>
      )}

      {results === null && !loading && !error && (
        <div className="state-box">
          <span className="state-icon">🛍️</span>
          <h3>Search the catalog</h3>
          <p>Enter a product SKU or paste a product link to find items you can track.</p>
        </div>
      )}

      {results !== null && results.length === 0 && (
        <div className="state-box">
          <span className="state-icon">🔎</span>
          <h3>No results found</h3>
          <p>No matching products found in the current catalog sample for "{query}".</p>
        </div>
      )}

      {results && results.length > 0 && (
        <>
          <p className="text-muted text-sm" style={{ marginBottom: 12 }}>
            {results.length} result{results.length !== 1 ? 's' : ''} for "{query}"
          </p>
          <div className="search-results-grid">
            {results.map(item => {
              const tracked = isAlreadyTracked(item.external_product_id);
              const isTracking = tracking[item.external_product_id];
              return (
                <div className="result-card" key={item.external_product_id} id={`result-${item.external_product_id}`}>
                  <div className="result-name">{item.name}</div>
                  <div className="result-meta" style={{ marginTop: '4px' }}>
                    {item.brand && <span className="tag">{item.brand}</span>}
                    {item.category && <span className="tag tag-accent">{item.category}</span>}
                  </div>
                  <div className="text-muted text-sm" style={{ marginTop: '8px' }}>
                    {item.sku && <span>SKU: {item.sku}</span>}
                    {item.matchedBy && (
                        <div style={{ marginTop: '4px', fontWeight: 500, color: 'var(--text)' }}>
                            ↳ Matched by: {item.matchedBy}
                        </div>
                    )}
                  </div>
                  <button
                    className={`btn ${tracked ? 'btn-secondary' : 'btn-primary'}`}
                    onClick={() => !tracked && handleTrack(item)}
                    disabled={tracked || isTracking}
                    id={`track-btn-${item.external_product_id}`}
                  >
                    {isTracking
                      ? <><span className="inline-spinner" /> Tracking…</>
                      : tracked
                        ? '✓ Already tracking'
                        : '+ Track this product'}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
