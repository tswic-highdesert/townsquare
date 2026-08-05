import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
const TOKEN = process.env['TOK']!
const URL_ = new URL('http://localhost:8770/mcp')
const client = new Client({ name: 'w3-audit', version: '1.0.0' })
await client.connect(new StreamableHTTPClientTransport(URL_, { requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } } }))

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r: any = await client.callTool({ name, arguments: args })
  const text = (r.content ?? []).map((c: any) => c.text ?? '').join('\n')
  return { isError: r.isError === true, text }
}
const show = (label: string, r: { isError: boolean; text: string }, n = 400) =>
  console.log(`\n── ${label} ${r.isError ? '[ERROR]' : ''}\n${r.text.slice(0, n)}`)

const { tools } = await client.listTools()
console.log('tools:', tools.length, '—', tools.map((t) => t.name).join(', '))

show('whoami', await call('whoami'))
show('list_record_types', await call('list_record_types'))
const docs = await call('get_sdk_docs')
console.log('\n── get_sdk_docs: ' + docs.text.length + ' chars' + (docs.isError ? ' [ERROR]' : ''))

// What does scaffold want?
console.log('\n── scaffold input schema:\n' + JSON.stringify(tools.find((t) => t.name === 'scaffold')?.inputSchema, null, 1).slice(0, 900))
console.log('\n── begin_upload input schema:\n' + JSON.stringify(tools.find((t) => t.name === 'begin_upload')?.inputSchema, null, 1).slice(0, 1200))
console.log('\n── submit input schema:\n' + JSON.stringify(tools.find((t) => t.name === 'submit')?.inputSchema, null, 1).slice(0, 600))
await client.close()
