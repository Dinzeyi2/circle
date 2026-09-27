import crypto from 'node:crypto'
import { promisify } from 'node:util'
import { createSession, deleteSession, findSession } from './store.js'

const scrypt = promisify(crypto.scrypt)
const SESSION_MS = 7 * 24 * 60 * 60 * 1000
export async function hashPassword(password) { const salt=crypto.randomBytes(16).toString('hex');const key=await scrypt(password,salt,64);return `${salt}:${Buffer.from(key).toString('hex')}` }
export async function verifyPassword(password, stored) { const [salt,hex]=String(stored).split(':');if(!salt||!hex)return false;const key=Buffer.from(await scrypt(password,salt,64));const expected=Buffer.from(hex,'hex');return key.length===expected.length&&crypto.timingSafeEqual(key,expected) }
const digest = token => crypto.createHash('sha256').update(token).digest('hex')
export async function issueSession(userId) { const token=crypto.randomBytes(32).toString('base64url');await createSession(userId,digest(token),new Date(Date.now()+SESSION_MS));return token }
export async function auth(req,res,next) { try { const value=req.get('authorization')||'';const token=value.startsWith('Bearer ')?value.slice(7):'';if(!token)return res.status(401).json({error:'Authentication required'});const session=await findSession(digest(token));if(!session)return res.status(401).json({error:'Session expired'});req.userId=session.userId;req.sessionToken=token;next() } catch(error){next(error)} }
export async function revoke(token) { await deleteSession(digest(token)) }
