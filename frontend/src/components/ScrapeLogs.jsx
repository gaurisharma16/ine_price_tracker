import { formatDate } from '../utils.js';

const STATUS_META = {
  SUCCESS: { cls: 'log-success', icon: '✓' },
  RETRIED: { cls: 'log-retried', icon: '↺' },
  FAILED:  { cls: 'log-failed',  icon: '✗' },
};

function shortRunId(runId) {
  // Show first 8 chars of UUID for readability
  return runId ? runId.slice(0, 8) + '…' : '—';
}

export default function ScrapeLogs({ data, loading, error }) {
  if (loading) {
    return (
      <div className="state-box">
        <span className="spinner" />
        <p>Loading scrape logs…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="state-box">
        <span className="state-icon">⚠️</span>
        <h3>Could not load logs</h3>
        <p>{error}</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="state-box">
        <span className="state-icon">📋</span>
        <h3>No scrape logs yet</h3>
        <p>Scrape logs will appear here after the first "Refresh Now" run.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-muted text-sm" style={{ marginBottom: 12 }}>
        {data.length} log entr{data.length !== 1 ? 'ies' : 'y'} — each row is one individual attempt.
        Multiple rows sharing a Run ID belong to the same scheduled job.
      </p>
      <table className="data-table">
        <thead>
          <tr>
            <th>Run ID</th>
            <th>Attempt</th>
            <th>Status</th>
            <th>Error</th>
            <th>Timestamp</th>
          </tr>
        </thead>
        <tbody>
          {data.map(log => {
            const meta = STATUS_META[log.status] || { cls: 'log-failed', icon: '?' };
            return (
              <tr key={log.id}>
                <td>
                  <span className="run-id" title={log.run_id}>{shortRunId(log.run_id)}</span>
                </td>
                <td style={{ fontWeight: 600 }}>#{log.attempt_number}</td>
                <td>
                  <span className={`log-status ${meta.cls}`}>
                    {meta.icon} {log.status}
                  </span>
                </td>
                <td className="text-muted" style={{ fontSize: '0.8rem', maxWidth: 240, wordBreak: 'break-word' }}>
                  {log.error_message || '—'}
                </td>
                <td className="text-muted">{formatDate(log.created_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
