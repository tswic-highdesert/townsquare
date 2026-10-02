/** Password accounts are the deployed no-email path. They do not grant residency. */
import { randomBytes, randomUUID, scrypt, scryptSync, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { DuplicateError, hashSecret, newSecret, normalizeHandle, SESSION_TTL_MS, type Identity } from '@townsquare/identity'
import { SqliteIdentityStore } from './persistence/identity.js'
import { LocalDatabase, SqliteMap } from './persistence/database.js'
import { cookieName } from './identityRoutes.js'
import { readJson, sendJson, serializeCookie, str } from './http.js'

interface Credential { salt: string; hash: string }
interface RateBucket { startsAt: number; count: number }
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const WINDOW = 15 * 60 * 1000
const DUMMY: Credential = { salt: 'townsquare-unknown-account', hash: scryptSync('unknown account secret', 'townsquare-unknown-account', 64, SCRYPT).toString('hex') }

export function derivePassword(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, SCRYPT, (error, key) => error ? reject(error) : resolve(key)))
}

export class PasswordAccounts {
  private readonly credentials: SqliteMap<Credential>
  private readonly rates: SqliteMap<RateBucket>
  constructor(readonly database: LocalDatabase, readonly store: SqliteIdentityStore) {
    this.credentials = new SqliteMap(database, 'passwordCredentials')
    this.rates = new SqliteMap(database, 'accountRateLimits')
  }

  /** Buckets survive restart; identifiers are hashed and expired buckets removed. */
  allow(key: string, limit: number, now = Date.now()): boolean {
    const digest = hashSecret(key)
    for (const [id, bucket] of this.rates) if (bucket.startsAt + WINDOW <= now) this.rates.delete(id)
    const bucket = this.rates.get(digest) ?? { startsAt: now, count: 0 }
    bucket.count++
    this.rates.set(digest, bucket)
    return bucket.count <= limit
  }

  async register(handle: string, password: string) {
    const salt = randomBytes(32).toString('hex')
    const hash = (await derivePassword(password, salt)).toString('hex')
    return this.store.createPasswordAccount({ handle, email: `${randomUUID()}@accounts.invalid` }, { salt, hash }, Date.now())
  }

  async authenticate(handle: string, password: string) {
    const user = await this.store.userByHandle(handle)
    const credential = user ? this.credentials.get(user.id) : undefined
    const checked = credential ?? DUMMY
    const derived = await derivePassword(password, checked.salt)
    const valid = timingSafeEqual(derived, Buffer.from(checked.hash, 'hex'))
    return valid && credential && user ? user : null
  }
}

export function createAccountRoutes(cfg: {
  identity: Identity
  accounts: PasswordAccounts
  shellOrigin: string
}) {
  let active = 0
  return async function accountRoutes(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const path = url.pathname
    if (!['/api/auth/signup', '/api/auth/signin', '/api/auth/confirm'].includes(path)) return false
    if (path === '/api/auth/confirm') {
      sendJson(res, { error: 'unavailable', message: 'Email sign-in is not enabled. Sign in with your handle and password.' }, 410)
      return true
    }
    if (req.method !== 'POST') {
      sendJson(res, { error: 'method_not_allowed', message: 'Use the account form.' }, 405)
      return true
    }
    if (req.headers.origin !== cfg.shellOrigin) {
      sendJson(res, { error: 'forbidden', message: 'Bad origin.' }, 403)
      return true
    }
    // Bound work before reading a body or performing a memory-expensive hash.
    if (active >= 4 || !cfg.accounts.allow(`network:${req.socket.remoteAddress ?? 'unknown'}`, 90)) {
      res.setHeader('Retry-After', '900')
      sendJson(res, { error: 'rate_limited', message: 'Too many attempts. Please try again in fifteen minutes.' }, 429)
      return true
    }
    const parsed = await readJson(req, 2048)
    if (!parsed.ok) {
      sendJson(res, { error: 'invalid', message: 'That account request is not valid.' }, 400)
      return true
    }
    const handle = normalizeHandle(str(parsed.body, 'handle'))
    const password = str(parsed.body, 'password')
    if (!handle.ok || password.length < 12 || password.length > 128) {
      sendJson(res, { error: 'invalid', message: !handle.ok ? handle.message : 'Use a password between 12 and 128 characters.' }, 400)
      return true
    }
    if (!cfg.accounts.allow(`handle:${handle.handle}`, 10)) {
      res.setHeader('Retry-After', '900')
      sendJson(res, { error: 'rate_limited', message: 'Too many attempts. Please try again in fifteen minutes.' }, 429)
      return true
    }
    if (active >= 4) {
      res.setHeader('Retry-After', '5')
      sendJson(res, { error: 'rate_limited', message: 'Town Square is busy. Please try again in a few seconds.' }, 429)
      return true
    }
    active++
    try {
      const user = path.endsWith('/signup')
        ? await cfg.accounts.register(handle.handle, password)
        : await cfg.accounts.authenticate(handle.handle, password)
      if (!user) {
        sendJson(res, { error: 'unauthenticated', message: 'That handle and password did not match.' }, 401)
        return true
      }
      const secret = newSecret()
      const now = Date.now()
      await cfg.accounts.store.createSession({ userId: user.id, tokenHash: hashSecret(secret), expiresAt: now + SESSION_TTL_MS }, now)
      res.setHeader('Set-Cookie', serializeCookie({ name: cookieName(cfg.shellOrigin), value: secret, maxAgeSeconds: SESSION_TTL_MS / 1000, secure: cfg.shellOrigin.startsWith('https://') }))
      sendJson(res, await cfg.identity.accountView(user))
    } catch (error) {
      if (error instanceof DuplicateError) {
        sendJson(res, { error: 'handle_taken', message: 'That handle is taken. Choose another or sign in.' }, 409)
      } else {
        // Never put credential material or request bodies in logs or responses.
        sendJson(res, { error: 'unavailable', message: 'Your account could not be opened. Please try again.' }, 503)
      }
    } finally { active-- }
    return true
  }
}
