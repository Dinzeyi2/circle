import OpenAI from 'openai'

const model = process.env.OPENAI_MODEL || 'gpt-5-nano'

function localRecommendation({ charge, state }) {
  const after = state.profile.spendingBalance - charge.amount
  const unused = (charge.lastUsedDays || 0) >= 30
  const unsafe = after < 250
  const action = unsafe ? 'decline' : unused ? 'ask' : charge.mode === 'allow' ? 'approve' : 'ask'
  const reasons = []
  if (unsafe) reasons.push(`It would leave only $${Math.max(after, 0).toFixed(0)} in spending money, below your $250 safety balance.`)
  if (unused) reasons.push(`You have not used ${charge.merchant} in ${charge.lastUsedDays} days.`)
  if (!reasons.length) reasons.push('The charge fits your current balance and saved preferences.')
  return { action, confidence: unsafe ? 0.96 : 0.82, summary: reasons.join(' '), questions: action === 'ask' ? ['Do you still use this service?', 'Do you need this money for a plan this week?'] : [] }
}

export async function recommendCharge(input) {
  const fallback = localRecommendation(input)
  if (!process.env.OPENAI_API_KEY) return { ...fallback, source: 'rules' }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const response = await client.responses.create({
    model,
    input: [
      { role: 'system', content: `You are Extech's cautious subscription assistant. Recommend approve, ask, or decline. Never claim you moved money. Preserve essentials and explicit savings goals. A decline is reversible and should be preferred when funds are insufficient. Return concise JSON only with keys action, confidence (0-1), summary, questions (array).` },
      { role: 'user', content: JSON.stringify({ profile: input.state.profile, rules: input.state.rules, goals: input.state.goals, charge: input.charge }) },
    ],
    text: { format: { type: 'json_object' } },
  })
  try {
    const parsed = JSON.parse(response.output_text)
    if (!['approve', 'ask', 'decline'].includes(parsed.action)) throw new Error('Invalid action')
    return { ...parsed, source: model }
  } catch { return { ...fallback, source: 'rules-fallback' } }
}

export async function answerPlanner(message, state) {
  if (!process.env.OPENAI_API_KEY) return { reply: 'I can help protect a goal. Tell me its cost and date, and I will suggest which optional subscriptions to ask about first.', source: 'rules' }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const response = await client.responses.create({ model, input: [
    { role: 'system', content: `You are Extech AI, a concise financial subscription planner. Use only the supplied account context. Ask one useful follow-up when details are missing. Do not provide investment advice, initiate transactions, or promise cancellations. Explain that the user has final control.` },
    { role: 'user', content: `Context: ${JSON.stringify({ profile: state.profile, subscriptions: state.subscriptions, rules: state.rules, goals: state.goals })}\nUser: ${message}` },
  ] })
  return { reply: response.output_text, source: model }
}
