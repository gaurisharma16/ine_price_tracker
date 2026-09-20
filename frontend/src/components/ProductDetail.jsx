import { useState, useEffect } from 'react';
import { getProductHistory, getProductLogs } from '../api.js';
import PriceHistory from './PriceHistory.jsx';
import ScrapeLogs from './ScrapeLogs.jsx';

export default function ProductDetail({ product, onClose }) {
  const [tab, setTab] = useState('history');
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(null);
  const [logs, setLogs] = useState(null);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);
    getProductHistory(product.id)
      .then(res => { if (!cancelled) { setHistory(res.data || []); } })
      .catch(err => { if (!cancelled) setHistoryError(err.message); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [product.id]);

  useEffect(() => {
    let cancelled = false;
    setLogsLoading(true);
    setLogsError(null);
    getProductLogs(product.id)
      .then(res => { if (!cancelled) { setLogs(res.data || []); } })
      .catch(err => { if (!cancelled) setLogsError(err.message); })
      .finally(() => { if (!cancelled) setLogsLoading(false); });
    return () => { cancelled = true; };
  }, [product.id]);

  return (
    <div className="detail-panel" id={`detail-${product.id}`}>
      <div className="detail-panel-header">
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>{product.name}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            ID #{product.external_product_id} ·{' '}
            <a className="ext-link" href={product.product_url} target="_blank" rel="noopener noreferrer">
              Open in store ↗
            </a>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close details">✕</button>
        </div>
      </div>

      {tab === 'history' && (
        <PriceHistory data={history} loading={historyLoading} error={historyError} />
      )}
      {tab === 'logs' && (
        <ScrapeLogs data={logs} loading={logsLoading} error={logsError} />
      )}
    </div>
  );
}
