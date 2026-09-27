const production = process.env.NODE_ENV === 'production'

export const config = {
  production,
  appUrl: process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`,
  openaiModel: process.env.OPENAI_MODEL || 'gpt-5-nano',
  integrations: {
    database: Boolean(process.env.DATABASE_URL),
    openai: Boolean(process.env.OPENAI_API_KEY),
    chargeWebhook: Boolean(process.env.WEBHOOK_SECRET),
    email: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM),
  },
}

export function validateConfig() {
  const missing = []
  if (production && !process.env.DATABASE_URL) missing.push('DATABASE_URL')
  if (production && !process.env.WEBHOOK_SECRET) missing.push('WEBHOOK_SECRET')
  if (production && !process.env.APP_URL) missing.push('APP_URL')
  if (missing.length) throw new Error(`Missing required production variables: ${missing.join(', ')}`)
}
