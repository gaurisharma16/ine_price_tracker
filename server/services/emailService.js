const sgMail = require('@sendgrid/mail');
const { getAppSetting, upsertAppSetting } = require('../../db/settings');

if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const FROM_EMAIL = process.env.ALERT_EMAIL_FROM;
const SETTING_KEY = 'notification_email';

/**
 * Returns the recipient email for alerts for a specific client.
 * Priority: Supabase app_settings → null.
 * (We removed the ALERT_EMAIL_TO fallback since this is now multi-user)
 */
async function getRecipientEmail(clientId) {
    if (!clientId) return null;
    try {
        const saved = await getAppSetting(`${clientId}_notification_email`);
        if (saved) return saved;
    } catch (err) {
        console.warn(`[EMAIL] Could not read recipient email for client ${clientId} from DB:`, err.message);
    }
    return null;
}

/**
 * Persists the recipient email to Supabase app_settings for a specific client.
 */
async function setRecipientEmail(clientId, email) {
    if (!clientId) throw new Error('clientId is required');
    await upsertAppSetting(`${clientId}_notification_email`, email);
}

// ---------------------------------------------------------------------------
// Shared HTML email wrapper — keeps branding consistent across all alert types
// ---------------------------------------------------------------------------
function buildEmailHtml({ heading, accentColor, badgeLabel, bodyHtml }) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${heading}</title>
</head>
<body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Header -->
          <tr>
            <td style="padding:0 0 20px 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size:13px;font-weight:600;color:#94a3b8;letter-spacing:0.08em;text-transform:uppercase;">
                      📊 Product Price Tracker
                    </span>
                  </td>
                  <td align="right">
                    <span style="display:inline-block;background:${accentColor}22;color:${accentColor};font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:3px 10px;border-radius:20px;border:1px solid ${accentColor}55;">
                      ${badgeLabel}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#1a1d27;border:1px solid #2d3148;border-radius:12px;overflow:hidden;">

              <!-- Accent bar -->
              <div style="height:3px;background:linear-gradient(90deg,${accentColor},${accentColor}88);"></div>

              <!-- Card body -->
              <table width="100%" cellpadding="0" cellspacing="0" style="padding:28px 28px 24px;">
                <tr>
                  <td>
                    <h1 style="margin:0 0 4px 0;font-size:22px;font-weight:700;color:#f1f5f9;line-height:1.3;">
                      ${heading}
                    </h1>
                    ${bodyHtml}
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 4px 0 4px;">
              <p style="margin:0;font-size:11px;color:#475569;text-align:center;line-height:1.6;">
                This alert was sent by <strong style="color:#64748b;">Product Price Tracker</strong> because you saved your email for price &amp; stock notifications.<br/>
                You can update or remove your email at any time from the dashboard.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Price-drop alert
// ---------------------------------------------------------------------------
async function sendPriceDropEmail(recipient, product, current, previous) {
    const diff = previous.price - current.price;
    const pctOff = Math.round((diff / previous.price) * 100);

    const subject = `Price dropped ${pctOff}% — ${product.name}`;

    const bodyHtml = `
      <p style="margin:8px 0 24px;font-size:14px;color:#94a3b8;">
        Great news — the price just dropped on a product you're tracking.
      </p>

      <!-- Product name -->
      <p style="margin:0 0 20px;font-size:16px;font-weight:600;color:#e2e8f0;">
        ${product.name}
      </p>

      <!-- Price comparison row -->
      <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
        <tr>
          <td style="background:#0f1117;border:1px solid #2d3148;border-radius:8px;padding:14px 18px;width:45%;">
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Was</div>
            <div style="font-size:22px;font-weight:700;color:#94a3b8;text-decoration:line-through;">
              ₹${Number(previous.price).toLocaleString('en-IN')}
            </div>
          </td>
          <td style="text-align:center;padding:0 12px;color:#475569;font-size:20px;">→</td>
          <td style="background:#0f1117;border:1px solid #22c55e44;border-radius:8px;padding:14px 18px;width:45%;">
            <div style="font-size:11px;color:#22c55e;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Now</div>
            <div style="font-size:26px;font-weight:800;color:#22c55e;">
              ₹${Number(current.price).toLocaleString('en-IN')}
            </div>
          </td>
        </tr>
      </table>

      <!-- Saving callout -->
      <p style="margin:0 0 24px;background:#14532d33;border:1px solid #22c55e33;border-radius:8px;padding:12px 16px;font-size:14px;color:#86efac;">
        💰 You save <strong>₹${Number(diff).toLocaleString('en-IN')}</strong> (${pctOff}% off)
      </p>

      <!-- CTA button -->
      <a href="${product.product_url}"
         style="display:inline-block;background:#6366f1;color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:8px;letter-spacing:0.02em;">
        View Product →
      </a>
    `;

    const html = buildEmailHtml({
        heading: 'Price Drop Alert',
        accentColor: '#22c55e',
        badgeLabel: 'Price Drop',
        bodyHtml,
    });

    await sendEmail(recipient, subject, html);
}

// ---------------------------------------------------------------------------
// Back-in-stock alert
// ---------------------------------------------------------------------------
async function sendBackInStockEmail(recipient, product, current) {
    const subject = `Back in stock — ${product.name}`;

    const bodyHtml = `
      <p style="margin:8px 0 24px;font-size:14px;color:#94a3b8;">
        A product you were watching is back in stock.
      </p>

      <!-- Product name -->
      <p style="margin:0 0 20px;font-size:16px;font-weight:600;color:#e2e8f0;">
        ${product.name}
      </p>

      <!-- Status + price row -->
      <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
        <tr>
          <td style="background:#0f1117;border:1px solid #38bdf844;border-radius:8px;padding:14px 18px;width:48%;">
            <div style="font-size:11px;color:#38bdf8;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Status</div>
            <div style="font-size:18px;font-weight:700;color:#7dd3fc;">
              ✓ ${current.stock}
            </div>
          </td>
          <td style="width:4%;"></td>
          <td style="background:#0f1117;border:1px solid #2d3148;border-radius:8px;padding:14px 18px;width:48%;">
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Current price</div>
            <div style="font-size:22px;font-weight:800;color:#f1f5f9;">
              ₹${Number(current.price).toLocaleString('en-IN')}
            </div>
          </td>
        </tr>
      </table>

      <!-- CTA button -->
      <a href="${product.product_url}"
         style="display:inline-block;background:#6366f1;color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:8px;letter-spacing:0.02em;">
        View Product →
      </a>
    `;

    const html = buildEmailHtml({
        heading: 'Back in Stock',
        accentColor: '#38bdf8',
        badgeLabel: 'In Stock',
        bodyHtml,
    });

    await sendEmail(recipient, subject, html);
}

// ---------------------------------------------------------------------------
// Core send helper
// ---------------------------------------------------------------------------
async function sendEmail(recipient, subject, htmlContent) {
    if (!process.env.SENDGRID_API_KEY || !FROM_EMAIL || !recipient) {
        console.log(`[EMAIL] Email alerts are not configured. Skipping email send (Subject: ${subject}).`);
        return;
    }

    const msg = {
        to: recipient,
        from: FROM_EMAIL,
        subject: subject,
        html: htmlContent
    };

    await sgMail.send(msg);
}

module.exports = {
    sendPriceDropEmail,
    sendBackInStockEmail,
    getRecipientEmail,
    setRecipientEmail
};
