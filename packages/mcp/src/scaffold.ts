/**
 * The starter a resident's agent begins from.
 *
 * Text only, and small enough to sit in a tool result without crowding out the
 * conversation. Every file it emits is one the agent writes to disk itself,
 * which is why the icon is an SVG: a PNG would have to cross this boundary as
 * base64 and a model would be tempted to "improve" it.
 *
 * The scaffold is opinionated in the two places that cost the most rounds when
 * an agent guesses:
 *
 *   **Permissions are derived, not invented.** They are computed from what the
 *   chosen template actually calls, so the first manifest an agent sees already
 *   declares exactly what its code uses. Over-declaration is the failure mode
 *   here — a reviewer reading a permissions block full of unused capabilities
 *   cannot tell signal from noise — and the fastest way to teach it is to never
 *   show an example that does it.
 *
 *   **The signed-out path is written first.** Every template renders something
 *   useful before it ever calls `user.current()`, because most visitors to a
 *   town square are not signed in and an agent copies the shape it is given.
 */

import { MANIFEST_VERSION, SDK_MAJOR } from '@townsquare/manifest'

export type Template = 'blank' | 'directory' | 'records'

export interface ScaffoldInput {
  name: string
  tagline: string
  description: string
  template: Template
  /** Only meaningful for the `records` template. */
  recordType?: string
  recordLabel?: string
}

export interface ScaffoldFile {
  path: string
  text: string
}

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="14" fill="#26405B"/>
  <circle cx="24" cy="26" r="6" fill="#EDE9E0"/>
  <circle cx="40" cy="26" r="6" fill="#C4714E"/>
  <rect x="14" y="38" width="36" height="12" rx="6" fill="#EDE9E0" opacity="0.9"/>
</svg>
`

/** Replace this with your own mark before you submit. Said in the file itself. */
const ICON_NOTE = '<!-- Placeholder. Swap in your own square icon before you submit. -->\n'

const RECORD_TYPE_RE = /^[a-z][a-z0-9_]{2,39}$/

export interface ScaffoldResult {
  files: ScaffoldFile[]
  /** Written for the agent, not for a human reading a README. */
  next: string[]
}

export function scaffold(input: ScaffoldInput): ScaffoldResult {
  const template = input.template
  const recordType = input.recordType ?? 'town_note'
  if (template === 'records' && !RECORD_TYPE_RE.test(recordType)) {
    throw new Error(`record type "${recordType}" must be snake_case, 3 to 40 characters`)
  }
  const recordLabel = input.recordLabel ?? titleize(recordType)

  const manifest: Record<string, unknown> = {
    manifest_version: MANIFEST_VERSION,
    sdk: SDK_MAJOR,
    name: input.name,
    tagline: input.tagline,
    description: input.description,
    version: '1.0.0',
    tags: [],
    entry: 'index.html',
    icon: 'icon.svg',
    display: { surface: 'full', height: 'auto' },
    permissions: permissionsFor(template, recordType),
  }
  if (template === 'records') {
    manifest['defines'] = [
      {
        type: recordType,
        label: recordLabel,
        schema: {
          title: { type: 'string', required: true, maxLength: 120 },
          note: { type: 'string', maxLength: 1000 },
        },
      },
    ]
  }

  return {
    files: [
      { path: 'townsquare.json', text: JSON.stringify(manifest, null, 2) + '\n' },
      { path: 'index.html', text: entryFor(template, input, recordType, recordLabel) },
      { path: 'icon.svg', text: ICON_NOTE + ICON_SVG },
    ],
    next: [
      'Write these files to an empty directory.',
      'Replace icon.svg with a real square mark. Any square .svg, .png or .webp works.',
      'Build your app in index.html. There is no build step and no npm: everything the browser loads must be a file in this directory.',
      'Call get_sdk_docs before writing SDK calls, and list_record_types before defining a new record type.',
      'When it runs, call begin_upload with the inventory, POST the files, then preview to see it in a real sandbox.',
    ],
  }
}

function permissionsFor(template: Template, recordType: string): Record<string, unknown> {
  switch (template) {
    case 'blank':
      // Nothing. The default-deny block is written out anyway so the shape is
      // visible and a builder edits rather than invents it.
      return { identity: 'none', read: [], write: [], network: [], storage: false, device: [] }
    case 'directory':
      // `town.*` needs no declaration, so a template that only reads the
      // business directory declares nothing. That is the lesson.
      return { identity: 'none', read: [], write: [], network: [], storage: false, device: [] }
    case 'records':
      return {
        identity: 'handle',
        read: [recordType],
        write: [recordType],
        network: [],
        storage: false,
        device: [],
      }
  }
}

function titleize(snake: string): string {
  return snake
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const SHARED_STYLE = `      main { padding: var(--ts-space-6) var(--ts-space-5); max-width: 640px; margin: 0 auto; }
      h1 { font-size: var(--ts-text-h2); margin: 0 0 var(--ts-space-2); }
      .lede { color: var(--ts-ink60); margin: 0 0 var(--ts-space-6); }
      ul { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--ts-space-3); }
      li {
        padding: var(--ts-space-4);
        background: var(--ts-surface);
        border: 1px solid var(--ts-hairline);
        border-radius: var(--ts-radius-card);
      }
      .name { font-weight: 600; }
      .detail { color: var(--ts-ink60); font-size: var(--ts-text-label); }`

function shell(title: string, body: string, script: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <title>${esc(title)}</title>
    <style>
      /* Style from the tokens Town Square injects and the app inherits the
         town's look without hardcoding a single colour. */
${SHARED_STYLE}
    </style>
  </head>
  <body>
    <main>
${body}
    </main>

    <script type="module">
      // Bare specifier, no build step. The import map that makes this resolve
      // is injected by Town Square when it serves your entry document.
${script}
    </script>
  </body>
</html>
`
}

function entryFor(
  template: Template,
  input: ScaffoldInput,
  recordType: string,
  recordLabel: string,
): string {
  if (template === 'directory') {
    return shell(
      input.name,
      `      <h1>${esc(input.name)}</h1>
      <p class="lede" id="lede">Loading the town directory…</p>
      <ul id="list"></ul>`,
      `      import { town, app } from '@townsquare/sdk'

      const list = document.getElementById('list')
      const lede = document.getElementById('lede')

      try {
        const { name } = await town.info()
        const { items } = await town.businesses({ limit: 25 })

        lede.textContent = \`\${items.length} places in \${name}.\`

        for (const business of items) {
          const li = document.createElement('li')
          const title = document.createElement('div')
          title.className = 'name'
          title.textContent = business.name
          const detail = document.createElement('div')
          detail.className = 'detail'
          detail.textContent = [business.category, business.address].filter(Boolean).join(' · ')
          li.append(title, detail)
          list.append(li)
        }
      } catch (err) {
        lede.textContent = 'The town directory is not answering right now.'
        console.error(err)
      } finally {
        // Always, on every path. Until this runs the host shows a skeleton, and
        // after ten seconds it shows a did-not-load state instead of your app.
        app.ready()
      }`,
    )
  }

  if (template === 'records') {
    return shell(
      input.name,
      `      <h1>${esc(input.name)}</h1>
      <p class="lede" id="lede">Loading…</p>
      <form id="add" hidden>
        <input id="title" required maxlength="120" placeholder="${esc(recordLabel)}" />
        <button type="submit">Add</button>
      </form>
      <ul id="list"></ul>`,
      `      import { records, user, app } from '@townsquare/sdk'

      const TYPE = '${recordType}'
      const list = document.getElementById('list')
      const lede = document.getElementById('lede')
      const form = document.getElementById('add')

      function render(items) {
        list.replaceChildren()
        for (const record of items) {
          const li = document.createElement('li')
          const title = document.createElement('div')
          title.className = 'name'
          title.textContent = record.data.title
          const detail = document.createElement('div')
          detail.className = 'detail'
          detail.textContent = \`added by \${record.author?.handle ?? 'someone'}\`
          li.append(title, detail)
          list.append(li)
        }
      }

      try {
        const { items } = await records.list(TYPE, { limit: 100 })
        render(items)
        lede.textContent = items.length ? \`\${items.length} so far.\` : 'Nothing here yet.'

        // null for anyone signed out, which is most people. Reading works for
        // everyone; only the form is gated.
        const me = await user.current()
        if (me?.verified) {
          form.hidden = false
          form.addEventListener('submit', async (event) => {
            event.preventDefault()
            const title = document.getElementById('title').value.trim()
            if (!title) return
            await records.create(TYPE, { title })
            const fresh = await records.list(TYPE, { limit: 100 })
            render(fresh.items)
            form.reset()
          })
        } else if (me) {
          lede.textContent += ' Get a neighbour to vouch for you and you can add to this.'
        }
      } catch (err) {
        lede.textContent = 'Could not load. Try again in a moment.'
        console.error(err)
      } finally {
        app.ready()
      }`,
    )
  }

  return shell(
    input.name,
    `      <h1>${esc(input.name)}</h1>
      <p class="lede">${esc(input.tagline)}</p>`,
    `      import { app } from '@townsquare/sdk'

      // Call this as soon as your first paint is done, on every path.
      app.ready()`,
  )
}
