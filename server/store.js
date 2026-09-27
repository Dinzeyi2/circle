import pg from 'pg'
import crypto from 'node:crypto'

let pool
const memory = { users: new Map(), sessions: new Map(), subscriptions: new Map(), rules: new Map(), goals: new Map(), decisions: new Map() }

const defaultSubscriptions = [
  ['netflix', 'Netflix', 'Entertainment', 22.99, 'Oct 2', 'allow', 2],
  ['equinox', 'Equinox', 'Fitness', 195, 'Today', 'ask', 47],
  ['spotify', 'Spotify', 'Entertainment', 11.99, 'Oct 8', 'allow', 0],
  ['adobe', 'Adobe', 'Software', 59.99, 'Oct 12', 'ask', 18],
]
const defaultRules = [
  ['low-balance', 'Protect my safety balance', 'Decline non-essential charges if spending money would fall below $250.', true],
  ['unused', 'Pause unused subscriptions', 'Ask me when a service has not been used for 30 days.', true],
  ['price-rise', 'Catch price increases', 'Ask me when a charge is higher than last month.', true],
]

export async function initStore() {
  if (!process.env.DATABASE_URL) { if(process.env.NODE_ENV==='production')throw new Error('DATABASE_URL is required in production');return }
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined, max: 10, idleTimeoutMillis: 30_000 })
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (id UUID PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password_hash TEXT NOT NULL, available_balance NUMERIC(12,2) NOT NULL DEFAULT 2847.63, spending_balance NUMERIC(12,2) NOT NULL DEFAULT 322, next_payday DATE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS subscriptions (id TEXT NOT NULL, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, category TEXT NOT NULL, amount NUMERIC(12,2) NOT NULL, due_label TEXT, mode TEXT NOT NULL CHECK(mode IN ('allow','ask','decline')), last_used_days INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id,id));
    CREATE TABLE IF NOT EXISTS rules (id TEXT NOT NULL, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, label TEXT NOT NULL, detail TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE, PRIMARY KEY(user_id,id));
    CREATE TABLE IF NOT EXISTS goals (id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, target NUMERIC(12,2) NOT NULL, saved NUMERIC(12,2) NOT NULL DEFAULT 0, deadline DATE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS decisions (id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, merchant TEXT NOT NULL, amount NUMERIC(12,2) NOT NULL, action TEXT NOT NULL CHECK(action IN ('approved','declined')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id); CREATE INDEX IF NOT EXISTS decisions_user_date_idx ON decisions(user_id, created_at DESC);
  `)
}

export async function createUser({ email, name, passwordHash }) {
  const id = crypto.randomUUID()
  if (!pool) {
    if ([...memory.users.values()].some(u => u.email === email)) throw Object.assign(new Error('Email already registered'), { code: '23505' })
    memory.users.set(id, { id, email, name, passwordHash, availableBalance: 2847.63, spendingBalance: 322, nextPayday: '2026-10-02' })
    memory.subscriptions.set(id, defaultSubscriptions.map(([sid, n, category, amount, due, mode, lastUsedDays]) => ({ id: sid, name: n, category, amount, due, mode, lastUsedDays })))
    memory.rules.set(id, defaultRules.map(([rid, label, detail, enabled]) => ({ id: rid, label, detail, enabled })))
    memory.goals.set(id, [{ id: crypto.randomUUID(), title: 'Weekend in Chicago', target: 600, saved: 380, deadline: '2026-10-17' }]); return memory.users.get(id)
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(`INSERT INTO users(id,email,name,password_hash,next_payday) VALUES($1,$2,$3,$4,$5) RETURNING *`, [id, email, name, passwordHash, '2026-10-02'])
    for (const s of defaultSubscriptions) await client.query(`INSERT INTO subscriptions(id,user_id,name,category,amount,due_label,mode,last_used_days) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [s[0], id, ...s.slice(1)])
    for (const r of defaultRules) await client.query(`INSERT INTO rules(id,user_id,label,detail,enabled) VALUES($1,$2,$3,$4,$5)`, [r[0], id, ...r.slice(1)])
    await client.query(`INSERT INTO goals(id,user_id,title,target,saved,deadline) VALUES($1,$2,$3,$4,$5,$6)`, [crypto.randomUUID(), id, 'Weekend in Chicago', 600, 380, '2026-10-17'])
    await client.query('COMMIT'); return rows[0]
  } catch (e) { await client.query('ROLLBACK'); throw e } finally { client.release() }
}

export async function findUserByEmail(email) { if (!pool) return [...memory.users.values()].find(u => u.email === email); return (await pool.query(`SELECT * FROM users WHERE email=$1`, [email])).rows[0] }
export async function createSession(userId, tokenHash, expiresAt) { if (!pool) return memory.sessions.set(tokenHash, { userId, expiresAt }); await pool.query(`INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)`, [tokenHash, userId, expiresAt]) }
export async function findSession(tokenHash) { if (!pool) { const s = memory.sessions.get(tokenHash); return s && s.expiresAt > new Date() ? s : null } return (await pool.query(`SELECT user_id AS "userId", expires_at AS "expiresAt" FROM sessions WHERE token_hash=$1 AND expires_at>NOW()`, [tokenHash])).rows[0] }
export async function deleteSession(tokenHash) { if (!pool) return memory.sessions.delete(tokenHash); await pool.query(`DELETE FROM sessions WHERE token_hash=$1`, [tokenHash]) }

export async function getState(userId) {
  if (!pool) { const u = memory.users.get(userId); return shape(u, memory.subscriptions.get(userId) || [], memory.rules.get(userId) || [], memory.goals.get(userId) || [], memory.decisions.get(userId) || []) }
  const [u, s, r, g, d] = await Promise.all([pool.query(`SELECT id,email,name,available_balance AS "availableBalance",spending_balance AS "spendingBalance",next_payday AS "nextPayday" FROM users WHERE id=$1`,[userId]), pool.query(`SELECT id,name,category,amount::float,due_label AS due,mode,last_used_days AS "lastUsedDays" FROM subscriptions WHERE user_id=$1 ORDER BY name`,[userId]), pool.query(`SELECT id,label,detail,enabled FROM rules WHERE user_id=$1 ORDER BY id`,[userId]), pool.query(`SELECT id,title,target::float,saved::float,deadline FROM goals WHERE user_id=$1 ORDER BY created_at`,[userId]), pool.query(`SELECT id,merchant,amount::float,action,created_at AS "createdAt" FROM decisions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,[userId])])
  return shape(u.rows[0], s.rows, r.rows, g.rows, d.rows)
}
function shape(u, subscriptions, rules, goals, decisions) { if (!u) return null; return { profile: { id:u.id,email:u.email,name:u.name,availableBalance:Number(u.availableBalance),spendingBalance:Number(u.spendingBalance),nextPayday:u.nextPayday }, subscriptions, rules, goals, decisions } }

export async function setSubscriptionMode(userId,id,mode) { if (!pool) { const item=(memory.subscriptions.get(userId)||[]).find(x=>x.id===id); if(item)item.mode=mode; return Boolean(item) } return (await pool.query(`UPDATE subscriptions SET mode=$1 WHERE user_id=$2 AND id=$3`,[mode,userId,id])).rowCount>0 }
export async function setRule(userId,id,enabled) { if (!pool) { const item=(memory.rules.get(userId)||[]).find(x=>x.id===id); if(item)item.enabled=enabled; return Boolean(item) } return (await pool.query(`UPDATE rules SET enabled=$1 WHERE user_id=$2 AND id=$3`,[enabled,userId,id])).rowCount>0 }
export async function addGoal(userId, goal) { const item={ id:crypto.randomUUID(),...goal,saved:0 }; if(!pool){ const list=memory.goals.get(userId)||[];list.push(item);memory.goals.set(userId,list);return item } await pool.query(`INSERT INTO goals(id,user_id,title,target,saved,deadline) VALUES($1,$2,$3,$4,0,$5)`,[item.id,userId,item.title,item.target,item.deadline]);return item }
export async function addDecision(userId, decision) { const item={id:crypto.randomUUID(),...decision,createdAt:new Date().toISOString()};if(!pool){const list=memory.decisions.get(userId)||[];list.unshift(item);memory.decisions.set(userId,list);return item}await pool.query(`INSERT INTO decisions(id,user_id,merchant,amount,action) VALUES($1,$2,$3,$4,$5)`,[item.id,userId,item.merchant,item.amount,item.action]);return item }
