# Extech

Extech is a full-stack subscription-control application foundation. The web app lets authenticated users approve or decline recurring charges, configure automatic guardrails, and explain upcoming plans to an AI assistant. The Node API can be called by the included website, a native app, or an authorized card-processor webhook.

> This repository is a product prototype. Connecting a real issuer requires server-side Stripe Issuing authorization webhooks, identity verification, PCI review, legal/compliance work, and a production authentication system. Never expose issuer or OpenAI secrets in the browser.

## Run locally

Requires Node.js 20 or newer.

```bash
cp .env.example .env
npm install
npm run dev:api   # API on :3000
npm run dev       # website on :5173, proxies /api to :3000
```

Without `DATABASE_URL`, local development uses an in-memory store. Production fails at startup without PostgreSQL so user and session data can never silently become ephemeral. Without `OPENAI_API_KEY`, recommendations use deterministic safety rules instead of failing.

## Deploy on Railway

1. Create a Railway project from this repository.
2. Add a PostgreSQL service to the project. Railway supplies `DATABASE_URL`.
3. Copy every variable from `.env.example` into Railway Variables. Set `APP_URL` to the generated Railway domain, add `OPENAI_API_KEY`, generate a long random `WEBHOOK_SECRET`, and optionally add Resend email credentials. The default AI model is `gpt-5-nano`.
4. Deploy. `railway.json` runs the Vite build, starts the Node server, binds Railway's `PORT`, and checks `/api/health`.
5. Generate a public domain in Railway. Both the web app and API are served from that domain, avoiding a cross-origin secret configuration.

The server creates normalized user, session, subscription, rule, goal, and decision tables and supporting indexes automatically. Registration seeds a private starter dashboard for that user.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Railway health check |
| `GET` | `/api/integrations` | Authenticated integration readiness (booleans only) |
| `POST` | `/api/auth/register` | Create an account and session |
| `POST` | `/api/auth/login` | Verify credentials and create a session |
| `POST` | `/api/auth/logout` | Revoke the current session |
| `GET` | `/api/state` | Dashboard state |
| `POST` | `/api/recommend` | AI/rules recommendation for a proposed charge |
| `POST` | `/api/chat` | Goal and planning conversation |
| `PATCH` | `/api/subscriptions/:id` | Set `allow`, `ask`, or `decline` |
| `PATCH` | `/api/rules/:id` | Enable or disable a guardrail |
| `POST` | `/api/goals` | Add a savings goal |
| `POST` | `/api/decisions` | Record the user's final choice |
| `POST` | `/api/webhooks/charge` | Authorized server-to-server charge decision |

App endpoints require an opaque bearer token. Passwords use salted `scrypt`; only SHA-256 token digests are stored, sessions expire after seven days, login and AI endpoints are rate-limited, every query is scoped to the authenticated user, request bodies are capped, and defensive browser headers are enabled. The webhook separately requires `x-extech-secret: <WEBHOOK_SECRET>` and a `userId`. It fails closed when no secret is configured. An `ask` recommendation is returned as a decline with `requiresUserApproval: true`.

## Railway variables

| Variable | Required | Where to get it |
| --- | --- | --- |
| `NODE_ENV=production` | Yes | Enter directly |
| `APP_URL` | Yes | Railway service → Settings → Networking → generated domain |
| `DATABASE_URL` | Yes | Automatically available after adding Railway PostgreSQL |
| `WEBHOOK_SECRET` | Yes | Generate with `openssl rand -hex 32`; use the same value in your authorized caller |
| `OPENAI_API_KEY` | For AI | OpenAI API dashboard; keep server-side only |
| `OPENAI_MODEL` | No | Defaults to `gpt-5-nano` |
| `RESEND_API_KEY` | For email alerts | Resend API Keys |
| `RESEND_FROM` | For email alerts | A sender on your verified Resend domain |

The server validates production configuration before listening. `/api/integrations` reports only whether each integration is configured and never returns secret values. Email delivery failures do not interrupt charge decisions.

### First smoke test

```bash
# 1. Confirm deployment
curl https://YOUR-DOMAIN/api/health

# 2. Register and copy the returned token and user.id
curl -X POST https://YOUR-DOMAIN/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"name":"Test User","email":"you@example.com","password":"a-long-test-password"}'

# 3. Check integrations
curl https://YOUR-DOMAIN/api/integrations \
  -H 'authorization: Bearer YOUR_TOKEN'

# 4. Simulate an incoming charge
curl -X POST https://YOUR-DOMAIN/api/webhooks/charge \
  -H 'content-type: application/json' \
  -H 'x-extech-secret: YOUR_WEBHOOK_SECRET' \
  -d '{"userId":"YOUR_USER_ID","merchant":"Test Gym","amount":100,"lastUsedDays":45,"mode":"ask"}'
```

The final call exercises PostgreSQL lookup, webhook authentication, the AI/rules decision path, and optional approval email delivery. Your Stripe Issuing and card-switching work can call this webhook contract later; no Stripe or switching credentials are required by this repository.

Example recommendation request:

```bash
curl -X POST https://YOUR-DOMAIN/api/recommend \
  -H 'content-type: application/json' \
  -d '{"merchant":"Gym","amount":100,"lastUsedDays":47,"mode":"ask"}'
```

## Decision model

The AI receives only the user's balance, guardrails, goals, subscription metadata, and proposed charge. It returns `approve`, `ask`, or `decline` plus a short explanation and confidence. Deterministic rules remain available as a fallback. The UI always explains that AI suggestions can be wrong and leaves the final decision with the user.

Useful scenarios include low or historically-low balances, insufficient funds, unused services, price increases, duplicate services, a short-term trip or event, a savings target, an intentionally paused subscription, and “decline until I cancel” preferences. Rather than hard-coding thousands of brittle cases, user-written goals and guardrails are supplied as context so the model can reason about new combinations while the hard safety floor remains deterministic.
