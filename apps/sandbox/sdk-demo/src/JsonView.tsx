/**
 * Pretty-prints an SDK result with light syntax colouring.
 *
 * Built from React nodes rather than an HTML string, so nothing the host
 * returns can ever be interpreted as markup.
 */

import { Fragment, type ReactNode } from 'react'

export function JsonView({ value }: { value: unknown }) {
  return (
    <pre className="json">
      <code>{render(value, 0)}</code>
    </pre>
  )
}

function render(v: unknown, depth: number): ReactNode {
  const pad = '  '.repeat(depth + 1)
  const close = '  '.repeat(depth)

  if (v === undefined) return <span className="j-null">undefined</span>
  if (v === null) return <span className="j-null">null</span>
  if (typeof v === 'string') return <span className="j-str">{JSON.stringify(v)}</span>
  if (typeof v === 'number' || typeof v === 'bigint') return <span className="j-num">{String(v)}</span>
  if (typeof v === 'boolean') return <span className="j-bool">{String(v)}</span>
  if (v instanceof Date) return <span className="j-str">{JSON.stringify(v.toISOString())}</span>

  if (Array.isArray(v)) {
    if (v.length === 0) return '[]'
    return (
      <>
        {'[\n'}
        {v.map((item, i) => (
          <Fragment key={i}>
            {pad}
            {render(item, depth + 1)}
            {i < v.length - 1 ? ',' : ''}
            {'\n'}
          </Fragment>
        ))}
        {close}]
      </>
    )
  }

  if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>)
    if (entries.length === 0) return '{}'
    return (
      <>
        {'{\n'}
        {entries.map(([k, item], i) => (
          <Fragment key={k}>
            {pad}
            <span className="j-key">{JSON.stringify(k)}</span>
            {': '}
            {render(item, depth + 1)}
            {i < entries.length - 1 ? ',' : ''}
            {'\n'}
          </Fragment>
        ))}
        {close}
        {'}'}
      </>
    )
  }

  return String(v)
}
