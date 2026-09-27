import test from 'node:test'
import assert from 'node:assert/strict'
import { hashPassword, issueSession, verifyPassword } from '../server/auth.js'
import { createUser, findSession } from '../server/store.js'
import crypto from 'node:crypto'

test('passwords are salted and verified without storing plaintext', async () => {
  const first = await hashPassword('correct horse battery staple')
  const second = await hashPassword('correct horse battery staple')
  assert.notEqual(first, second)
  assert.equal(await verifyPassword('correct horse battery staple', first), true)
  assert.equal(await verifyPassword('wrong password', first), false)
})

test('issued sessions resolve to the correct user from their digest', async () => {
  const user = await createUser({ email: `security-${crypto.randomUUID()}@example.com`, name: 'Security Test', passwordHash: await hashPassword('a secure test password') })
  const token = await issueSession(user.id)
  assert.ok(token.length >= 40)
  const digest = crypto.createHash('sha256').update(token).digest('hex')
  assert.equal((await findSession(digest)).userId, user.id)
})
