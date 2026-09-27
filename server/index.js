import 'dotenv/config'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { answerPlanner, recommendCharge } from './ai.js'
import { addDecision, addGoal, createUser, findUserByEmail, getState, initStore, setRule, setSubscriptionMode } from './store.js'
import { auth, hashPassword, issueSession, revoke, verifyPassword } from './auth.js'
import { config, validateConfig } from './config.js'
import { sendApprovalEmail } from './notifications.js'

const app = express()
const port = Number(process.env.PORT) || 3000
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
app.disable('x-powered-by')
app.use(express.json({ limit: '32kb' }))
app.use((_req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'"});next()})
const attempts=new Map();function rateLimit(limit,windowMs){return(req,res,next)=>{const key=`${req.ip}:${req.path}`;const now=Date.now();const item=attempts.get(key)||{count:0,reset:now+windowMs};if(now>item.reset){item.count=0;item.reset=now+windowMs}item.count++;attempts.set(key,item);if(item.count>limit)return res.status(429).json({error:'Too many requests. Try again later.'});next()}}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'extech-api' }))
app.get('/api/integrations',auth,(_req,res)=>res.json(config.integrations))
app.post('/api/auth/register',rateLimit(8,60_000),async(req,res,next)=>{try{const email=String(req.body.email||'').trim().toLowerCase();const name=String(req.body.name||'').trim().slice(0,80);const password=String(req.body.password||'');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!name||password.length<10)return res.status(400).json({error:'Use a valid email, name, and password of at least 10 characters'});const user=await createUser({email,name,passwordHash:await hashPassword(password)});const token=await issueSession(user.id);res.status(201).json({token,user:{id:user.id,email:user.email,name:user.name}})}catch(e){if(e.code==='23505')return res.status(409).json({error:'Email already registered'});next(e)}})
app.post('/api/auth/login',rateLimit(10,60_000),async(req,res,next)=>{try{const email=String(req.body.email||'').trim().toLowerCase();const user=await findUserByEmail(email);const stored=user?.password_hash||user?.passwordHash;if(!user||!await verifyPassword(String(req.body.password||''),stored))return res.status(401).json({error:'Invalid email or password'});res.json({token:await issueSession(user.id),user:{id:user.id,email:user.email,name:user.name}})}catch(e){next(e)}})
app.post('/api/auth/logout',auth,async(req,res,next)=>{try{await revoke(req.sessionToken);res.status(204).end()}catch(e){next(e)}})
app.get('/api/state',auth,async (req, res, next) => { try { res.json(await getState(req.userId)) } catch (e) { next(e) } })

app.post('/api/recommend',auth,rateLimit(30,60_000), async (req, res, next) => {
  try {
    const { merchant, amount, lastUsedDays = 0, mode = 'ask' } = req.body
    if (!merchant || !Number.isFinite(Number(amount)) || Number(amount) <= 0) return res.status(400).json({ error: 'merchant and a positive amount are required' })
    res.json(await recommendCharge({ charge: { merchant: String(merchant).slice(0, 80), amount: Number(amount), lastUsedDays: Number(lastUsedDays), mode }, state: await getState(req.userId) }))
  } catch (e) { next(e) }
})

app.post('/api/chat',auth,rateLimit(20,60_000), async (req, res, next) => {
  try {
    const message = String(req.body.message || '').trim().slice(0, 1500)
    if (!message) return res.status(400).json({ error: 'message is required' })
    res.json(await answerPlanner(message, await getState(req.userId)))
  } catch (e) { next(e) }
})

app.patch('/api/subscriptions/:id',auth, async (req, res, next) => {
  try {
    if (!['allow', 'ask', 'decline'].includes(req.body.mode)) return res.status(400).json({ error: 'mode must be allow, ask, or decline' })
    if(!await setSubscriptionMode(req.userId,req.params.id,req.body.mode))return res.status(404).json({error:'Subscription not found'})
    res.json(await getState(req.userId))
  } catch (e) { next(e) }
})

app.patch('/api/rules/:id',auth, async (req, res, next) => {
  try { if(!await setRule(req.userId,req.params.id,Boolean(req.body.enabled)))return res.status(404).json({error:'Rule not found'});res.json(await getState(req.userId)) } catch (e) { next(e) }
})

app.post('/api/goals',auth, async (req, res, next) => {
  try {
    const title = String(req.body.title || '').trim().slice(0, 80); const target = Number(req.body.target)
    if (!title || !Number.isFinite(target) || target <= 0) return res.status(400).json({ error: 'title and a positive target are required' })
    res.status(201).json(await addGoal(req.userId,{title,target,deadline:req.body.deadline||null}))
  } catch (e) { next(e) }
})

app.post('/api/decisions',auth, async (req, res, next) => {
  try {
    if (!['approved', 'declined'].includes(req.body.action)) return res.status(400).json({ error: 'invalid action' })
    res.status(201).json(await addDecision(req.userId,{merchant:String(req.body.merchant||'Unknown').slice(0,80),amount:Number(req.body.amount)||0,action:req.body.action}))
  } catch (e) { next(e) }
})

app.post('/api/webhooks/charge', async (req, res, next) => {
  try {
    const provided = String(req.get('x-extech-secret') || ''); const expected = String(process.env.WEBHOOK_SECRET || '')
    if (!expected || provided.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return res.status(401).json({ error: 'unauthorized' })
    const userId=String(req.body.userId||'');if(!userId)return res.status(400).json({error:'userId required'});const state = await getState(userId);if(!state)return res.status(404).json({error:'User not found'}); const charge = req.body
    const recommendation = await recommendCharge({ charge, state })
    const requiresUserApproval=recommendation.action==='ask';let notification={delivered:false,reason:'not_needed'}
    if(requiresUserApproval)try{notification=await sendApprovalEmail({to:state.profile.email,merchant:charge.merchant,amount:charge.amount,recommendation})}catch(error){console.error('Approval email failed',error);notification={delivered:false,reason:'provider_error'}}
    res.json({ decision: recommendation.action === 'approve' ? 'approve' : 'decline', recommendation, requiresUserApproval, notification })
  } catch (e) { next(e) }
})

app.use(express.static(path.join(root, 'dist')))
app.get('*', (req, res, next) => req.path.startsWith('/api/') ? next() : res.sendFile(path.join(root, 'dist', 'index.html')))
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Something went wrong' }) })

try{validateConfig()}catch(error){console.error(error.message);process.exit(1)}
initStore().then(() => app.listen(port, '0.0.0.0', () => console.log(`Extech listening on ${port}`))).catch(error => { console.error(error); process.exit(1) })
