export async function sendApprovalEmail({ to, merchant, amount, recommendation }) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM || !to) return { delivered: false, reason: 'not_configured' }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.RESEND_FROM,
      to: [to],
      subject: `${merchant} tried to charge $${Number(amount).toFixed(2)}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>Approval needed</h2><p><strong>${escapeHtml(merchant)}</strong> tried to charge <strong>$${Number(amount).toFixed(2)}</strong>.</p><p>Extech recommends ${escapeHtml(recommendation.action)}: ${escapeHtml(recommendation.summary)}</p><p>Open Extech to approve or keep blocking this charge.</p><p style="color:#68716d;font-size:12px">Extech never approves a charge from an email link. Sign in to make the final decision.</p></div>`,
    }),
  })
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`)
  return { delivered: true }
}

function escapeHtml(value) { return String(value || '').replace(/[&<>'"]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' })[char]) }
