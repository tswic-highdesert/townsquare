/** Run only through server shell access. No HTTP route can grant a role. */
import { LocalDatabase, SqliteIdentityStore } from './persistence.js'

const handle = process.argv[2]
const role = process.argv[3] ?? 'moderator'
if (!handle || !['moderator', 'admin', 'user'].includes(role)) {
  throw new Error('Usage: tsx apps/api/src/provisionReviewer.ts HANDLE [moderator|admin|user]')
}
const path = process.env['TOWNSQUARE_DB_PATH']
if (!path) throw new Error('TOWNSQUARE_DB_PATH must name the deployed persistent database')
const database = new LocalDatabase(path)
try {
  const store = new SqliteIdentityStore(database)
  const user = await store.userByHandle(handle)
  if (!user) throw new Error('Create the account through the app first.')
  await store.updateUser(user.id, { role: role as 'moderator' | 'admin' | 'user' }, Date.now())
  console.log(`Updated @${user.handle} role to ${role}. Residency verification is unchanged.`)
} finally { database.close() }
