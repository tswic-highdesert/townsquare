import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { Identity, publicUser } from '@townsquare/identity'
import { Contributions, Drafts, NoOrganisations, NoListingOwners } from '@townsquare/contributions'
import { Saves } from '@townsquare/saves'
import { CreationStorage, MemoryStorageStore } from '@townsquare/storage'
import { MemoryCreationStore, MemorySubmissionStore, MemoryRecordTypeStore, MemoryReportStore, MemoryModerationLogStore, Review, Reports, Moderation } from '@townsquare/review'
import { BundleStorePublisher, MemoryBundleStore } from '@townsquare/sandbox'
import { LocalDatabase, databasePathForEnvironment, SqliteIdentityStore, SqliteSaveStore, SqliteContributionStore, SqliteRecordStore, SqliteDraftStore, SqliteAttemptLog } from './persistence.js'
import { PasswordAccounts, createAccountRoutes } from './accountRoutes.js'
import { createIdentityRoutes } from './identityRoutes.js'
import { createSavesRoutes } from './savesRoutes.js'
import { createContributionRoutes } from './contributionRoutes.js'
import { createDirectoryRoutes } from './directoryRoutes.js'
import { withApprovedCorrections } from './correctionOverlay.js'
import { createReviewRoutes } from './reviewRoutes.js'

const ORIGIN = 'https://townsquare.example'
const TOWN = 'russellville-ar'
const PASSWORD = 'river valley summer mornings'
const directories: string[] = []
const handles: Array<{ server: Server; database: LocalDatabase }> = []
afterEach(async () => {
  for (const handle of handles.splice(0)) {
    await new Promise<void>((done) => handle.server.close(() => done()))
    handle.database.close()
  }
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true })
})
function databasePath() { const dir = mkdtempSync(join(tmpdir(), 'townsquare-test-')); directories.push(dir); return join(dir, 'town.sqlite') }

async function harness(path: string) {
  const database = new LocalDatabase(path)
  const store = new SqliteIdentityStore(database)
  const identity = new Identity({ store, delivery: { async deliver() { throw new Error('Email must never be sent') } } })
  const accounts = new PasswordAccounts(database, store)
  const records = new SqliteRecordStore(database)
  const contributions = new Contributions({
    contributions: new SqliteContributionStore(database), records, attempts: new SqliteAttemptLog(database), orgs: new NoOrganisations(), ownership: new NoListingOwners(),
    listings: { async current(_town, id, field) { return id === 'biz-test' && field === 'phone' ? { label: 'Test listing', value: 'Unknown' } : null } },
  })
  const creations = new MemoryCreationStore()
  const reports = new MemoryReportStore()
  const publisher = new BundleStorePublisher({ store: new MemoryBundleStore(), origin: { appsDomain: 'apps.example', scheme: 'https' }, shellOrigins: [ORIGIN] })
  let clock = Date.now()
  const routes = [
    createDirectoryRoutes({ town: { id: TOWN, name: 'Russellville', timezone: 'America/Chicago' }, now: () => new Date(clock), loadItems: withApprovedCorrections(async () => [{ id: 'biz-test', type: 'business', name: 'Test listing', title: 'Test listing', category: 'Park', address: 'Public place', hours: 'Unknown', phone: 'Unknown', description: '', tags: [], community: TOWN, source: 'test', createdAt: '2026-01-01', updatedAt: '2026-01-01' }], records, TOWN) }),
    createAccountRoutes({ identity, accounts, shellOrigin: ORIGIN }),
    createIdentityRoutes({ identity, store, storage: new CreationStorage({ store: new MemoryStorageStore() }), creations: () => [], shellOrigin: ORIGIN, townId: TOWN, actSecret: 'test' }),
    createSavesRoutes({ identity, saves: new Saves({ store: new SqliteSaveStore(database) }), listBuilt: async () => [], shellOrigin: ORIGIN, townId: TOWN }),
    createContributionRoutes({ identity, contributions, drafts: new Drafts({ store: new SqliteDraftStore(database) }), shellOrigin: ORIGIN, townId: TOWN, timezone: 'America/Chicago' }),
    createReviewRoutes({ identity, contributions, shellOrigin: ORIGIN, townId: TOWN,
      review: new Review({ submissions: new MemorySubmissionStore(), creations, recordTypes: new MemoryRecordTypeStore(), publisher }),
      reports: new Reports({ reports, targets: { async creationBySlug() { return null } } }),
      moderation: new Moderation({ creations, publisher, reports, log: new MemoryModerationLogStore() }),
    }),
  ]
  const server = createServer((req, res) => {
    void (async () => {
      for (const route of routes) if (await route(req, res, new URL(req.url ?? '/', ORIGIN))) return
      res.writeHead(404).end()
    })().catch(() => { res.writeHead(500).end() })
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  handles.push({ server, database })
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return {
    store, identity, records, accounts, database,
    expirePublicCache: () => { clock += 61_000 },
    get: (path: string, cookie = '') => fetch(base + path, { headers: { Cookie: cookie } }),
    post: (path: string, body: unknown, cookie = '', origin: string | null = ORIGIN) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) }),
    async close() { const index = handles.findIndex((h) => h.server === server); handles.splice(index, 1); await new Promise<void>((done) => server.close(() => done())); database.close() },
  }
}
function cookie(response: Response) { return response.headers.get('set-cookie')!.split(';')[0]! }

it('uses secure no-email accounts, preserves saves through restart and a new session, and revokes sign-out', async () => {
  const path = databasePath()
  let app = await harness(path)
  const signup = await app.post('/api/auth/signup', { handle: 'river-neighbor', password: PASSWORD })
  expect(signup.status).toBe(200)
  expect(signup.headers.get('set-cookie')).toMatch(/^__Host-tsq_session=.*HttpOnly; SameSite=Lax;.*Secure$/)
  const signed = cookie(signup)
  expect(await signup.json()).toMatchObject({ handle: 'river-neighbor', verified: false, role: 'user' })
  const user = (await app.store.userByHandle('river-neighbor'))!
  expect(publicUser(user)).toEqual({ handle: 'river-neighbor', verified: false })
  const allRows = JSON.stringify(app.database.db.prepare('SELECT * FROM town_square_rows').all())
  expect(allRows).not.toContain(PASSWORD)
  expect(allRows).not.toContain(signed.split('=')[1])
  expect((await app.post('/api/saves', { kind: 'business', refId: 'lake', title: 'Lake Dardanelle' }, signed)).status).toBe(200)
  expect((await app.post('/api/auth/signout', {}, signed)).status).toBe(200)
  expect(await (await app.get('/api/auth/me', signed)).json()).toBeNull()
  await app.close()
  app = await harness(path)
  const signin = await app.post('/api/auth/signin', { handle: 'river-neighbor', password: PASSWORD })
  expect(signin.status).toBe(200)
  expect(cookie(signin)).not.toBe(signed)
  expect(await (await app.get('/api/yours', cookie(signin))).json()).toMatchObject({ saves: [{ title: 'Lake Dardanelle' }] })
  expect((await app.post('/api/auth/signin', { handle: 'river-neighbor', password: 'wrong password here' })).status).toBe(401)
  expect((await app.post('/api/auth/confirm', { token: 'anything' })).status).toBe(410)
})

it('refuses cross-origin, missing-origin, unauthenticated and non-moderator actions; rate limits survive restart', async () => {
  const path = databasePath()
  let app = await harness(path)
  expect((await app.post('/api/auth/signup', { handle: 'resident', password: PASSWORD }, '', 'https://evil.example')).status).toBe(403)
  expect((await app.post('/api/auth/signup', { handle: 'resident', password: PASSWORD }, '', null)).status).toBe(403)
  expect((await app.get('/api/review/contributions')).status).toBe(401)
  expect((await app.post('/api/saves', { kind: 'business', refId: 'x', title: 'x' })).status).toBe(401)
  const signed = cookie(await app.post('/api/auth/signup', { handle: 'resident', password: PASSWORD, role: 'admin', verified: true }))
  expect((await app.get('/api/review/contributions', signed)).status).toBe(404)
  expect((await app.post('/api/review/contributions/00000000/decide', { decision: 'approve' }, signed)).status).toBe(404)
  expect((await app.store.userByHandle('resident'))).toMatchObject({ role: 'user', verifiedResident: false })
  for (let i = 0; i < 10; i++) app.accounts.allow('handle:locked', 10)
  await app.close()
  app = await harness(path)
  expect((await app.post('/api/auth/signin', { handle: 'locked', password: PASSWORD })).status).toBe(429)
})

it('persists edited drafts, a newcomer correction, moderator review and record history across restart', async () => {
  const path = databasePath()
  let app = await harness(path)
  const signed = cookie(await app.post('/api/auth/signup', { handle: 'neighbor', password: PASSWORD }))
  const draftReply = await app.post('/api/drafts', { type: 'correction', content: { title: 'First draft' } }, signed)
  const draft = (await draftReply.json()).draft
  expect((await app.post('/api/drafts', { id: draft.id, type: 'correction', content: { title: 'Revised draft' } }, signed)).status).toBe(200)
  const reply = await app.post('/api/contributions', { type: 'correction', content: { targetRef: 'biz-test', targetLabel: 'Test listing', field: 'phone', beforeValue: 'Unknown', newValue: '479-555-0110', reason: 'Hours on the business website.' } }, signed)
  expect(reply.status).toBe(200)
  const sent = await reply.json()
  expect(sent).toMatchObject({ outcome: 'queued', contribution: { status: 'queued' } })
  const id = sent.contribution.id
  expect(JSON.stringify(await (await app.get('/api/directory')).json())).not.toContain('479-555-0110')
  await app.close()
  app = await harness(path)
  const signedAgain = cookie(await app.post('/api/auth/signin', { handle: 'neighbor', password: PASSWORD }))
  expect(await (await app.get(`/api/drafts/${draft.id}`, signedAgain)).json()).toMatchObject({ draft: { content: { title: 'Revised draft' } } })
  const reviewerCookie = cookie(await app.post('/api/auth/signup', { handle: 'reviewer', password: PASSWORD }))
  const reviewer = (await app.store.userByHandle('reviewer'))!
  await app.store.updateUser(reviewer.id, { role: 'moderator' }, Date.now())
  expect(await (await app.get('/api/review/contributions', reviewerCookie)).json()).toMatchObject({ items: [{ id }] })
  const decision = await app.post(`/api/review/contributions/${id}/decide`, { decision: 'approve', note: 'Checked against the source.' }, reviewerCookie)
  expect(decision.status).toBe(200)
  const approved = await decision.json()
  expect(approved).toMatchObject({ contribution: { status: 'published', decisionNote: 'Checked against the source.' } })
  const recordId = approved.record.id
  app.expirePublicCache()
  const publicResult = await (await app.get('/api/directory')).json()
  expect(publicResult.places.find((item: { id: string }) => item.id === 'biz-test')).toMatchObject({ phone: '479-555-0110' })
  await app.close()
  app = await harness(path)
  expect(await app.records.byId(recordId)).toMatchObject({ currentVersion: 2 })
  expect(await app.records.versions(recordId)).toHaveLength(2)
  expect(await (await app.get('/api/contributions', signedAgain)).json()).toMatchObject({ contributions: [{ id, status: 'published' }] })
  expect((await app.store.userByHandle('neighbor'))!.verifiedResident).toBe(false)
})

it('reads committed data written by a terminated, separate Node process', () => {
  const path = databasePath()
  const source = `import { LocalDatabase, databasePathForEnvironment, SqliteSaveStore } from ${JSON.stringify(resolve('apps/api/src/persistence.ts'))}; const db = new LocalDatabase(process.argv[1]); await new SqliteSaveStore(db).create({townId:'russellville-ar',userId:'resident',kind:'business',refId:'lake',title:'Lake Dardanelle',detail:null,url:null},Date.now()); db.close();`
  execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source, path], { stdio: 'pipe' })
  const db = new LocalDatabase(path)
  try { expect(db.db.prepare("SELECT value FROM town_square_rows WHERE namespace='saves'").get()).toBeTruthy() }
  finally { db.close() }
})


it('refuses ephemeral production database paths and allows an explicit volume path', () => {
  for (const path of [undefined, ':memory:', 'local.sqlite', '/tmp/residents.sqlite']) {
    expect(() => databasePathForEnvironment({ NODE_ENV: 'production', TOWNSQUARE_DB_PATH: path })).toThrow('persistent volume')
  }
  expect(() => databasePathForEnvironment({ SHELL_ORIGIN: 'https://town.example' })).toThrow('persistent volume')
  expect(databasePathForEnvironment({ NODE_ENV: 'production', TOWNSQUARE_DB_PATH: '/data/residents.sqlite' })).toBe('/data/residents.sqlite')
  expect(databasePathForEnvironment({})).toBe('/tmp/townsquare-data/residents.sqlite')
})
