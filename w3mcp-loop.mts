import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createHash } from 'node:crypto'
const TOKEN = process.env['TOK']!
const client = new Client({ name: 'w3-audit', version: '1.0.0' })
await client.connect(new StreamableHTTPClientTransport(new URL('http://localhost:8770/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
}))
const call = async (n: string, a: Record<string, unknown> = {}) => {
  const r: any = await client.callTool({ name: n, arguments: a })
  return { isError: r.isError === true, text: (r.content ?? []).map((c: any) => c.text ?? '').join('\n') }
}
const j = (t: string) => { try { return JSON.parse(t) } catch { return null } }
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
const enc = new TextEncoder()

const sc = j((await call('scaffold', {
  name: 'River Level', tagline: 'How high the Arkansas is at Russellville right now',
  description: 'Reads the town feed and shows the latest river reading with the time it was taken.',
})).text)!

async function push(files: { path: string; text: string }[], slug: string, label: string) {
  const inventory = files.map((f) => ({ path: f.path, sha256: sha(f.text), bytes: enc.encode(f.text).length }))
  const b = await call('begin_upload', { slug, inventory })
  console.log(`\n══ ${label}: begin_upload ${b.isError ? 'ERROR' : 'ok'}`)
  const begun = j(b.text)
  if (!begun) { console.log(b.text.slice(0, 500)); return null }
  console.log('keys:', Object.keys(begun).join(', '))
  

  // POST the raw bytes, exactly as the returned shell loop would.
  const base = begun.upload_url
  const ticket = begun.upload_token
  for (const f of files) {
    const res = await fetch(`${base}${base.includes('?') ? '&' : '?'}path=${encodeURIComponent(f.path)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', authorization: `Bearer ${ticket}` },
      body: enc.encode(f.text),
    })
    if (!res.ok) console.log(`  POST ${f.path} → ${res.status} ${(await res.text()).slice(0, 160)}`)
  }
  const st = await call('upload_status', { draft_id: begun.draft_id })
  console.log('upload_status:', st.text.slice(0, 300))
  return begun.draft_id as string
}

const v1 = await push(sc.files, 'river-level', 'v1')
if (v1) {
  const v = await call('validate', { draft_id: v1 })
  console.log('\n══ validate v1', v.isError ? 'ERROR' : 'ok', '\n' + v.text.slice(0, 500))
  const pv = await call('preview', { draft_id: v1 })
  console.log('\n══ preview v1', pv.isError ? 'ERROR' : 'ok', '\n' + pv.text.slice(0, 400))
  const sb = await call('submit', { draft_id: v1, note: 'First version. Reads the feed, nothing else.' })
  console.log('\n══ submit v1', sb.isError ? 'ERROR' : 'ok', '\n' + sb.text.slice(0, 500))
}
await client.close()
