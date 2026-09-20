import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatPrice, formatDate } from '../utils.js';
import { getAlertEmail, saveAlertEmail } from '../api.js';

function AlertEmailRow() {
  const [email, setEmail] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    getAlertEmail()
      .then(res => { if (res.email) setEmail(res.email); })
      .catch(() => {});
  }, []);

  const isValidEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  async function handleSave() {
    if (!isValidEmail(email)) {
      setValidationError('Enter a valid email address.');
      return;
    }
    setValidationError('');
    setSaving(true);
    try {
      await saveAlertEmail(email);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setValidationError('Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  function handleChange(e) {
    setEmail(e.target.value);
    setSaved(false);
    if (validationError) setValidationError('');
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', letterSpacing: '0.02em' }}>
          🔔 Get price &amp; stock alerts
        </span>
        <input
          id="alert-email-input"
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={handleChange}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          style={{
            background: 'var(--surface-2, var(--surface))',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--text)',
            fontSize: '0.8rem',
            padding: '5px 10px',
            outline: 'none',
            width: 200,
            transition: 'border-color 0.15s',
          }}
          onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
          onBlur={e => (e.target.style.borderColor = 'var(--border)')}
        />
        <button
          id="alert-email-save-btn"
          className="btn btn-secondary btn-sm"
          onClick={handleSave}
          disabled={saving}
          style={{ whiteSpace: 'nowrap' }}
        >
          {saving ? '…' : saved ? '✓ Saved' : 'Save'}
        </button>
      </div>
      {validationError && (
        <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--error, #f87171)' }}>
          {validationError}
        </p>
      )}
      {email && !validationError && (
        <p style={{ margin: '4px 0 0 0', fontSize: '0.72rem', color: 'var(--text-faint, var(--text-muted))', opacity: 0.7 }}>
          Can&apos;t find the email? Check your spam folder.
        </p>
      )}
    </div>
  );
}

export default function TrackedProducts({
  products, loading, error,
  scrapeState, latestData,
  onScrape, onDeactivate, onRetry,
}) {
  if (loading) {
    return (
      <section>
        <p className="section-title">Tracked Products</p>
        <div className="state-box">
          <span className="spinner" />
          <p>Loading tracked products…</p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section>
        <p className="section-title">Tracked Products</p>
        <div className="state-box">
          <span className="state-icon">⚠️</span>
          <h3>Could not load products</h3>
          <p>{error}</p>
          <button className="btn btn-secondary btn-sm" onClick={onRetry}>Retry</button>
        </div>
      </section>
    );
  }

  const activeProducts = products.filter(p => p.active);

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <p className="section-title" style={{ marginBottom: 0 }}>
          Tracked Products
          {activeProducts.length > 0 && (
            <span style={{ marginLeft: 8, fontWeight: 500, textTransform: 'none', letterSpacing: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              · {activeProducts.length} active
            </span>
          )}
        </p>
      </div>

      <AlertEmailRow />

      {activeProducts.length === 0 ? (
        <div className="state-box">
          <span className="state-icon">📦</span>
          <h3>No products tracked yet</h3>
          <p>Search for a product above and click "Track" to start monitoring its price.</p>
        </div>
      ) : (
        <div className="tracked-grid">
          {activeProducts.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              latest={latestData[product.id]}
              scrape={scrapeState[product.id] || { status: 'idle' }}
              onScrape={() => onScrape(product.id)}
              onDeactivate={() => onDeactivate(product.id, product.name)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ProductCard({ product, latest, scrape, onScrape, onDeactivate }) {
  const navigate = useNavigate();
  const isScraping = scrape.status === 'scraping';

  return (
    <div
      className="product-card"
      id={`product-card-${product.id}`}
    >
      <div className="product-card-header">
        <div>
          <div className="product-card-name">{product.name}</div>
          <div className="result-meta" style={{ marginTop: '4px' }}>
            <span className="tag mono">#{product.external_product_id}</span>
          </div>
        </div>
        <span className={`status-badge ${product.active ? 'badge-active' : 'badge-inactive'}`}>
          {product.active ? 'ACTIVE' : 'INACTIVE'}
        </span>
      </div>

      <div className="product-prices">
        <div className="price-block">
          <div className="price-label">Latest price</div>
          <div className="price-value">
            {latest ? formatPrice(latest.price) : <span style={{ color: 'var(--text-faint)', fontSize: '0.9rem' }}>—</span>}
          </div>
        </div>
        <div className="price-block">
          <div className="price-label">Stock</div>
          <div className="stock-value">
            {latest ? latest.stock : <span style={{ color: 'var(--text-faint)' }}>—</span>}
          </div>
        </div>
      </div>

      {latest && (
        <div className="text-muted text-sm">
          Last updated: {formatDate(latest.created_at)}
        </div>
      )}

      {/* Scrape status feedback */}
      {scrape.status === 'scraping' && (
        <div className="scrape-status loading">
          <span className="inline-spinner" style={{ borderTopColor: 'var(--accent-light)', borderColor: 'var(--accent-dim)' }} />
          Scraping…
        </div>
      )}
      {scrape.status === 'success' && (
        <div className="scrape-status success">✓ Updated: {scrape.message}</div>
      )}
      {scrape.status === 'error' && (
        <div className="scrape-status error">✗ {scrape.message}</div>
      )}

      <div className="product-card-actions">
        <button
          className="btn btn-primary btn-sm"
          onClick={onScrape}
          disabled={isScraping}
          id={`scrape-btn-${product.id}`}
        >
          {isScraping ? <><span className="inline-spinner" /> Scraping…</> : '⟳ Refresh Now'}
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => navigate(`/products/${product.id}`)}
          id={`details-btn-${product.id}`}
        >
          📊 History & Logs
        </button>
        <button
          className="btn btn-danger btn-sm"
          onClick={onDeactivate}
          id={`deactivate-btn-${product.id}`}
        >
          ✕ Stop
        </button>
      </div>

      <a
        className="ext-link"
        href={product.product_url}
        target="_blank"
        rel="noopener noreferrer"
      >
        View on store ↗
      </a>
    </div>
  );
}
