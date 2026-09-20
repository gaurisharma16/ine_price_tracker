import { useState, useEffect, useCallback } from 'react';
import {
  searchProducts, trackProduct, getTrackedProducts,
  deleteTrackedProduct, getProductHistory, scrapeProduct,
} from './api.js';

import SearchSection from './components/SearchSection.jsx';
import TrackedProducts from './components/TrackedProducts.jsx';
import Toast from './components/Toast.jsx';
import ConfirmModal from './components/ConfirmModal.jsx';

export default function App() {
  const [tracked, setTracked] = useState([]);
  const [trackedLoading, setTrackedLoading] = useState(true);
  const [trackedError, setTrackedError] = useState(null);

  // Per-product scrape state: { [id]: { status: 'idle'|'scraping'|'success'|'error', message } }
  const [scrapeState, setScrapeState] = useState({});

  // Per-product latest price/stock (augmented from history after scrape)
  const [latestData, setLatestData] = useState({});

  // Toast queue
  const [toasts, setToasts] = useState([]);

  // Confirm modal for deactivation
  const [confirm, setConfirm] = useState(null); // { productId, productName }

  // ---- toast helpers ----
  const addToast = useCallback((msg, type = 'info') => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4500);
  }, []);

  // ---- load tracked products ----
  const loadTracked = useCallback(async () => {
    setTrackedLoading(true);
    setTrackedError(null);
    try {
      const res = await getTrackedProducts();
      const products = res.data || [];
      setTracked(products);

      // For each active product, fetch latest history to populate price display
      const newLatest = {};
      await Promise.all(
        products.filter(p => p.active).map(async (p) => {
          try {
            const hist = await getProductHistory(p.id);
            if (hist.data && hist.data.length > 0) {
              newLatest[p.id] = hist.data[0]; // most recent first
            }
          } catch {
            // silently skip — history unavailable yet
          }
        })
      );
      setLatestData(prev => ({ ...prev, ...newLatest }));
    } catch (err) {
      setTrackedError(err.message);
    } finally {
      setTrackedLoading(false);
    }
  }, []);

  useEffect(() => { loadTracked(); }, [loadTracked]);

  // ---- track a product from search ----
  const handleTrack = async (externalId, name) => {
    try {
      const trackRes = await trackProduct(externalId);
      addToast(`Now tracking "${name}"`, 'success');

      // Immediately add product to tracked list so the card appears right away
      await loadTracked();

      // Auto-scrape: get the internal id from the track response, then fire the
      // existing scrape endpoint so the first price/stock is fetched automatically.
      const newProductId = trackRes?.data?.id;
      if (newProductId) {
        // Show "Fetching price…" on the new card immediately
        setScrapeState(s => ({ ...s, [newProductId]: { status: 'scraping' } }));
        try {
          const scrapeRes = await scrapeProduct(newProductId);
          const scraped = scrapeRes.data?.product;
          if (scraped) {
            setLatestData(prev => ({
              ...prev,
              [newProductId]: {
                price: scraped.price,
                stock: scraped.stock,
                created_at: new Date().toISOString(),
              },
            }));
          }
          setScrapeState(s => ({
            ...s,
            [newProductId]: {
              status: 'success',
              message: `₹${scraped?.price?.toLocaleString()} · ${scraped?.stock}`,
            },
          }));
          addToast('Initial price fetched ✓', 'success');
          setTimeout(() => setScrapeState(s => ({ ...s, [newProductId]: { status: 'idle' } })), 4000);
        } catch (scrapeErr) {
          // Auto-scrape failed — product stays tracked, user can Refresh Now manually
          setScrapeState(s => ({
            ...s,
            [newProductId]: { status: 'error', message: `Auto-scrape failed: ${scrapeErr.message}` },
          }));
          addToast(`Tracked, but initial scrape failed. Click "Refresh Now".`, 'info');
          setTimeout(() => setScrapeState(s => ({ ...s, [newProductId]: { status: 'idle' } })), 7000);
        }
      }
    } catch (err) {
      if (err.status === 409) {
        addToast(`"${name}" is already being tracked`, 'info');
      } else {
        addToast(err.message, 'error');
      }
    }
  };


  // ---- manual scrape ----
  const handleScrape = async (productId) => {
    setScrapeState(s => ({ ...s, [productId]: { status: 'scraping' } }));
    try {
      const res = await scrapeProduct(productId);
      const product = res.data?.product;
      if (product) {
        setLatestData(prev => ({
          ...prev,
          [productId]: { price: product.price, stock: product.stock, created_at: new Date().toISOString() },
        }));
      }
      setScrapeState(s => ({ ...s, [productId]: { status: 'success', message: `₹${product?.price?.toLocaleString()} · ${product?.stock}` } }));
      addToast('Scrape successful', 'success');
      setTimeout(() => setScrapeState(s => ({ ...s, [productId]: { status: 'idle' } })), 4000);
    } catch (err) {
      setScrapeState(s => ({ ...s, [productId]: { status: 'error', message: err.message } }));
      addToast(`Scrape failed: ${err.message}`, 'error');
      setTimeout(() => setScrapeState(s => ({ ...s, [productId]: { status: 'idle' } })), 6000);
    }
  };

  // ---- stop tracking (deactivate) ----
  const handleDeactivateRequest = (productId, productName) => {
    setConfirm({ productId, productName });
  };

  const handleDeactivateConfirm = async () => {
    const { productId, productName } = confirm;
    setConfirm(null);
    try {
      await deleteTrackedProduct(productId);
      addToast(`Stopped tracking "${productName}". History preserved.`, 'info');
      await loadTracked();
    } catch (err) {
      addToast(`Failed to stop tracking: ${err.message}`, 'error');
    }
  };

  return (
    <div className="app">
      <header className="header">
        <span className="header-logo">📈</span>
        <div>
          <h1>Price Tracker</h1>
          <p>Track product prices from the INE mock storefront</p>
        </div>
      </header>

      <SearchSection
        onTrack={handleTrack}
        trackedIds={tracked.filter(p => p.active).map(p => p.external_product_id)}
      />

      <div className="divider" />

      <TrackedProducts
        products={tracked}
        loading={trackedLoading}
        error={trackedError}
        scrapeState={scrapeState}
        latestData={latestData}
        onScrape={handleScrape}
        onDeactivate={handleDeactivateRequest}
        onRetry={loadTracked}
      />

      <Toast toasts={toasts} />

      {confirm && (
        <ConfirmModal
          title="Stop tracking?"
          message={`This will deactivate tracking for "${confirm.productName}". Your price history and scrape logs will be preserved.`}
          onConfirm={handleDeactivateConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
