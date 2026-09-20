import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { formatPrice, formatDate, formatDateShort } from '../utils.js';

function PriceTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem',
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ color: 'var(--accent-light)', fontWeight: 700 }}>
        {formatPrice(payload[0].value)}
      </div>
      {payload[0].payload.stock && (
        <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>{payload[0].payload.stock}</div>
      )}
    </div>
  );
}

export default function PriceHistory({ data, loading, error }) {
  if (loading) {
    return (
      <div className="state-box">
        <span className="spinner" />
        <p>Loading price history…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="state-box">
        <span className="state-icon">⚠️</span>
        <h3>Could not load history</h3>
        <p>{error}</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="state-box">
        <span className="state-icon">📉</span>
        <h3>No price history yet</h3>
        <p>Click "Refresh Now" on the product card to run the first scrape and record a price point.</p>
      </div>
    );
  }

  // data is newest-first from API — reverse for chronological chart
  const chronological = [...data].reverse();
  const chartData = chronological.map(h => ({
    date: formatDateShort(h.created_at),
    price: h.price,
    stock: h.stock,
    fullDate: formatDate(h.created_at),
  }));

  return (
    <div>
      {data.length >= 2 ? (
        <div className="chart-wrapper">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={{ stroke: 'var(--border)' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `₹${v.toLocaleString()}`}
                width={80}
              />
              <Tooltip content={<PriceTooltip />} />
              <Line
                type="monotone"
                dataKey="price"
                stroke="var(--accent)"
                strokeWidth={2}
                dot={{ r: 4, fill: 'var(--accent)', strokeWidth: 0 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={{
          background: 'var(--surface2)', borderRadius: 8, padding: '14px 16px',
          color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 20,
        }}>
          ℹ️ Chart requires at least 2 data points. Run another scrape to see the price trend.
        </div>
      )}

      <table className="data-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Price</th>
            <th>Stock</th>
          </tr>
        </thead>
        <tbody>
          {data.map(h => (
            <tr key={h.id}>
              <td className="text-muted">{formatDate(h.created_at)}</td>
              <td style={{ fontWeight: 600, color: 'var(--accent-light)' }}>{formatPrice(h.price)}</td>
              <td>{h.stock}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
