import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getTrackedProducts, getProductHistory, getProductLogs,
  scrapeProduct, deleteTrackedProduct,
} from '../api.js';
import PriceHistory from './PriceHistory.jsx';
import ScrapeLogs from './ScrapeLogs.jsx';
import ConfirmModal from './ConfirmModal.jsx';
import Toast from './Toast.jsx';
import { formatPrice, formatDate } from '../utils.js';

export default function ProductDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [product, setProduct] = useState(null);
  const [productLoading, setProductLoading] = useState(true);
  const [productError, setProductError] = useState(null);

  const [tab, setTab] = useState('history');
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(null);
  const [logs, setLogs] = useState(null);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState(null);

  const [scrapeStatus, setScrapeStatus] = useState('idle'); // 'idle' | 'scraping' | 'success' | 'error'
  const [scrapeMsg, setScrapeMsg] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((msg, type = 'info') => {
    const tid = Date.now();
    setToasts(t => [...t, { id: tid, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== tid)), 4500);
  }, []);

  // Load product from tracked list by id
  const loadProduct = useCallback(async () => {
    setProductLoading(true);
    setProductError(null);
    try {
      const res = await getTrackedProducts();
      const found = (res.data || []).find(p => p.id === id);
      if (!found) {
        setProductError('Product not found. It may have been removed.');
      } else {
        setProduct(found);
      }
    } catch (err) {
      setProductError(err.message);
    } finally {
      setProductLoading(false);
    }
  }, [id]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await getProductHistory(id);
      setHistory(res.data || []);
    } catch (err) {
      setHistoryError(err.message);
    } finally {
      setHistoryLoading(false);
    }
  }, [id]);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    setLogsError(null);
    try {
      const res = await getProductLogs(id);
      setLogs(res.data || []);
    } catch (err) {
      setLogsError(err.message);
    } finally {
      setLogsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadProduct();
    loadHistory();
    loadLogs();
  }, [loadProduct, loadHistory, loadLogs]);

  const handleScrape = async () => {
    setScrapeStatus('scraping');
    setScrapeMsg('');
    try {
      const res = await scrapeProduct(id);
      const p = res.data?.product;
      setScrapeStatus('success');
      setScrapeMsg(p ? `₹${p.price?.toLocaleString()} · ${p.stock}` : 'Updated');
      addToast('Scrape successful', 'success');
      await loadProduct();
      await loadHistory();
      await loadLogs();
      setTimeout(() => setScrapeStatus('idle'), 4000);
    } catch (err) {
      setScrapeStatus('error');
      setScrapeMsg(err.message);
      addToast(`Scrape failed: ${err.message}`, 'error');
      setTimeout(() => setScrapeStatus('idle'), 6000);
    }
  };

  const handleStop = async () => {
    try {
      await deleteTrackedProduct(id);
      addToast('Stopped tracking. History preserved.', 'info');
      navigate('/');
    } catch (err) {
      addToast(`Failed: ${err.message}`, 'error');
    }
    setConfirm(false);
  };

  const latestEntry = history && history.length > 0 ? history[0] : null;

  if (productLoading) {
    return (
      <div className="details-page">
        <div className="state-box" style={{ marginTop: 60 }}>
          <span className="spinner" />
          <p>Loading product…</p>
        </div>
      </div>
    );
  }

  if (productError || !product) {
    return (
      <div className="details-page">
        <button className="btn btn-ghost" onClick={() => navigate('/')} style={{ marginBottom: 24 }}>
          ← Back to Dashboard
        </button>
        <div className="state-box">
          <span className="state-icon">⚠️</span>
          <h3>Product not found</h3>
          <p>{productError || 'Could not load product details.'}</p>
        </div>
      </div>
    );
  }

  const isScraping = scrapeStatus === 'scraping';

  return (
    <div className="details-page">
      {/* Back nav */}
      <button className="btn btn-ghost details-back" onClick={() => navigate('/')}>
        ← Back to Dashboard
      </button>

      {/* Product header */}
      <div className="details-header">
        <div className="details-header-info">
          <h1 className="details-product-name">{product.name}</h1>
          <div className="details-meta-row">
            <span className="tag mono">ID #{product.external_product_id}</span>
            <span className={`status-badge ${product.active ? 'badge-active' : 'badge-inactive'}`}>
              {product.active ? 'ACTIVE' : 'INACTIVE'}
            </span>
            <a
              className="ext-link"
              href={product.product_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on store ↗
            </a>
          </div>
        </div>

        {/* Latest price snapshot */}
        {latestEntry && (
          <div className="details-price-snapshot">
            <div className="price-block">
              <div className="price-label">Latest Price</div>
              <div className="price-value">{formatPrice(latestEntry.price)}</div>
            </div>
            <div className="price-block">
              <div className="price-label">Stock</div>
              <div className="stock-value">{latestEntry.stock}</div>
            </div>
            <div className="price-block">
              <div className="price-label">Updated</div>
              <div className="stock-value" style={{ fontSize: '0.78rem' }}>{formatDate(latestEntry.created_at)}</div>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="details-actions">
        <button
          className="btn btn-primary"
          onClick={handleScrape}
          disabled={isScraping}
          id="details-scrape-btn"
        >
          {isScraping ? <><span className="inline-spinner" /> Scraping…</> : '⟳ Refresh Now'}
        </button>
        {product.active && (
          <button
            className="btn btn-danger"
            onClick={() => setConfirm(true)}
            id="details-stop-btn"
          >
            ✕ Stop Tracking
          </button>
        )}
      </div>

      {/* Scrape status feedback */}
      {scrapeStatus === 'success' && (
        <div className="scrape-status success" style={{ marginBottom: 16 }}>✓ Updated: {scrapeMsg}</div>
      )}
      {scrapeStatus === 'error' && (
        <div className="scrape-status error" style={{ marginBottom: 16 }}>✗ {scrapeMsg}</div>
      )}

      {/* Tabs */}
      <div className="details-tabs-container">
        <div className="detail-tabs">
          <button
            className={`tab-btn ${tab === 'history' ? 'active' : ''}`}
            onClick={() => setTab('history')}
          >
            📈 Price History
          </button>
          <button
            className={`tab-btn ${tab === 'logs' ? 'active' : ''}`}
            onClick={() => setTab('logs')}
          >
            📋 Scrape Logs
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="details-tab-content">
        {tab === 'history' && (
          <PriceHistory data={history} loading={historyLoading} error={historyError} />
        )}
        {tab === 'logs' && (
          <ScrapeLogs data={logs} loading={logsLoading} error={logsError} />
        )}
      </div>

      <Toast toasts={toasts} />

      {confirm && (
        <ConfirmModal
          title="Stop tracking?"
          message={`This will deactivate tracking for "${product.name}". Your price history and scrape logs will be preserved.`}
          onConfirm={handleStop}
          onCancel={() => setConfirm(false)}
        />
      )}
    </div>
  );
}
