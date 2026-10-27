
import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

type UPIRecord = {
  upiId?: string;
  payeeName?: string;
  _id?: string;
};

export default function UPITester() {
  const [upi, setUpi] = useState<UPIRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function getRandomUPI() {
    setLoading(true);
    setError('');
    setUpi(null);

    try {
      const response = await fetch('/api/upi/random', {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });

      const json = await response.json();

      if (!response.ok || json.success === false) {
        throw new Error(
          json.message || json.error || `HTTP ${response.status}`
        );
      }

      const data = json.data ?? json.result ?? json.upi ?? json;

      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Invalid API response.');
      }

      setUpi(data as UPIRecord);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to connect to the backend.'
      );
    } finally {
      setLoading(false);
    }
  }

  const upiId = upi?.upiId ?? '';
  const payeeName = upi?.payeeName ?? 'AAPNA SPA';

  const qrValue = upiId
    ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}`
    : '';

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <h1>UPI API Tester</h1>
        <p style={styles.subtitle}>
          Test the UPI endpoint connected to your SPA backend.
        </p>

        <button
          onClick={getRandomUPI}
          disabled={loading}
          style={{
            ...styles.button,
            opacity: loading ? 0.65 : 1,
          }}
        >
          {loading ? 'Fetching...' : 'Get UPI Details'}
        </button>

        {error && (
          <div role="alert" style={styles.error}>
            <strong>Request failed:</strong> {error}
          </div>
        )}

        {upi && (
          <section style={styles.result}>
            <h2>API Response</h2>

            <p>
              <strong>Payee:</strong> {payeeName}
            </p>

            <p>
              <strong>UPI ID:</strong> {upiId || 'Not found'}
            </p>

            {qrValue ? (
              <div style={styles.qrContainer}>
                <h3>UPI QR Code</h3>

                <QRCodeSVG
                  value={qrValue}
                  size={240}
                  level="H"
                  includeMargin
                />

                <p style={styles.caption}>
                  Scan using a UPI app. Verify the recipient before paying.
                </p>
              </div>
            ) : (
              <p style={styles.error}>
                No UPI ID was returned by the backend.
              </p>
            )}

            <h3>Raw API Response</h3>

            <pre style={styles.json}>
              {JSON.stringify(upi, null, 2)}
            </pre>
          </section>
        )}
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    background: '#f3f4f6',
    padding: '24px 16px',
    boxSizing: 'border-box',
    fontFamily: 'Arial, sans-serif',
    color: '#111827',
  },
  card: {
    background: '#fff',
    padding: 28,
    borderRadius: 16,
    width: '100%',
    maxWidth: 520,
    boxSizing: 'border-box',
    boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
  },
  subtitle: {
    color: '#555',
    marginBottom: 24,
  },
  button: {
    width: '100%',
    padding: 15,
    border: 0,
    borderRadius: 8,
    background: '#2563eb',
    color: '#fff',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
  },
  result: {
    marginTop: 24,
    padding: 20,
    background: '#f9fafb',
    borderRadius: 10,
    overflowWrap: 'anywhere',
  },
  qrContainer: {
    marginTop: 24,
    padding: 20,
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  },
  caption: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
  },
  json: {
    padding: 14,
    background: '#eee',
    borderRadius: 8,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    fontSize: 12,
  },
  error: {
    color: '#b91c1c',
    background: '#fef2f2',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    overflowWrap: 'anywhere',
  },
};
