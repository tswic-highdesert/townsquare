/**
 * The fuller page about one creation. `design/hifi-v2` 06, specimen 8.
 *
 * There is no rating anywhere on it, and there never will be: a five-star
 * average on a thing your neighbour made for free is a small cruelty and a bad
 * signal. What the page carries instead is facts — what it does, what it can
 * touch, and what it adds to the town.
 *
 * Four blocks from the design are missing because the data behind them does
 * not exist, and each one would have been believed if drawn:
 *
 *   - **Screenshots.** A creation ships one icon and no captures.
 *   - **Usage and contributor counts.** No telemetry exists anywhere.
 *   - **Version history.** The catalogue carries the version running now, not
 *     the ones before it. The history is where "this update asked for more"
 *     becomes visible after the fact, so it is the one worth building next.
 *   - **The source list and Fork.** Town Square keeps a creation's source, but
 *     nothing serves a file list or a fork to the shell yet.
 */

import { Icon } from '../Icon.js'
import { Button } from '../ui/index.js'
import { AppIcon, MADE_BY, TRUST_GLYPHS } from './parts.js'
import { summariseTrust } from './trustGroups.js'
import type { CreationSummary } from '../townData.js'
import './creations.css'

export interface CreationDetailProps {
  creation: CreationSummary
  onBack: () => void
  onOpen: () => void
}

export function CreationDetail(props: CreationDetailProps) {
  const { creation } = props
  const { manifest } = creation
  const summary = summariseTrust(manifest)
  const lines = summary.groups.flatMap((g) => g.lines)

  return (
    <div className="shell cr-screen">
      <button className="cr-back" onClick={props.onBack}>
        <Icon name="arrow-left" size={16} /> Creations
      </button>

      <div className="cr-trust-head">
        <AppIcon creation={creation} size="lg" />
        <div>
          <h1 className="cr-h1 cr-h1-tight">{creation.name}</h1>
          <p className="cr-lede cr-lede-tight">{creation.tagline}</p>
          <p className="cr-by">{MADE_BY}</p>
        </div>
      </div>

      <div className="cr-detail-acts">
        <Button variant="primary" trailingIcon="arrow-right" onClick={props.onOpen}>
          Open
        </Button>
      </div>

      {creation.description.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="cr-detail-desc">
          {para}
        </p>
      ))}

      {manifest.tags.length > 0 && (
        <ul className="cr-taglist">
          {manifest.tags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      )}

      <div className="cr-detail-h">What this one can touch</div>
      <ul className="cr-trust cr-trust-compact">
        {lines.map((line) => (
          <li key={line.kind} data-weight={line.weight}>
            <div className="cr-trust-icon">
              <Icon name={TRUST_GLYPHS[line.kind]} size={16} />
            </div>
            <div>
              <div className="cr-trust-title">{line.title}</div>
              <div className="cr-trust-detail">{line.detail}</div>
            </div>
          </li>
        ))}
      </ul>

      {/*
        The compounding, made legible. A resident sees their contribution
        feeding somebody else's app, and a builder sees a type to reuse instead
        of inventing a parallel one with a different name for the same thing.

        The design also names the creations already reading each type. That
        needs a town-wide index of who reads what, which nothing serves yet, so
        the line about it is left off rather than guessed at.
      */}
      {manifest.defines.length > 0 && (
        <>
          <div className="cr-detail-h">What it adds to the town</div>
          {manifest.defines.map((defined) => (
            <div key={defined.type} className="cr-defines">
              <div className="cr-defines-head">
                <Icon name="layers" size={16} />
                <div>
                  <b>{defined.type}</b>
                  <span>
                    {defined.label}. Defined here, owned by nobody. Any other creation can ask to
                    read it.
                  </span>
                </div>
              </div>
              <table className="cr-schema">
                <tbody>
                  {Object.entries(defined.schema).map(([field, spec]) => (
                    <tr key={field}>
                      <th scope="row">{field}</th>
                      <td>
                        {spec.type}
                        {spec.maxLength ? `, ${spec.maxLength}` : ''}
                      </td>
                      <td className="cr-req">{spec.required ? 'required' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}

      <p className="cr-footnote">
        Running version {manifest.version}. Town Square keeps the source a neighbour on the
        committee read, and every update is read again before it replaces this one.
      </p>
    </div>
  )
}
