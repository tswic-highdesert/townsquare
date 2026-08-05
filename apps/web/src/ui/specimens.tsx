import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { cssVariables, fontFaceCss } from '@townsquare/tokens'
import { Icon, SPRITE_ICONS } from '../Icon.js'
// Same two, in the same order, as `main.tsx`: the primitives layer first so a
// screen can override it. This page reviews the primitives, so it has to load
// exactly what the shell loads, not a convenient subset.
import './ui.css'
import '../styles/index.css'
import './specimens.css'
import {
  AlertRegion,
  AppChip,
  Avatar,
  AvatarStack,
  Banner,
  BottomSheet,
  Button,
  Checkbox,
  Divider,
  EmptyState,
  ErrorState,
  FilterChip,
  IconButton,
  InlineError,
  Modal,
  Progress,
  Radio,
  SearchInput,
  SegmentedControl,
  Select,
  Skeleton,
  Spinner,
  StaleStrip,
  StatusPill,
  Stepper,
  Switch,
  Tag,
  Textarea,
  TextInput,
  Tile,
  ToastProvider,
  useToast,
  type ButtonVariant,
} from './index.js'

/**
 * Every primitive, in every state, on one page.
 *
 * This exists so the six people about to build screens on top of this layer can
 * see what they already have instead of writing a seventh button, and so a
 * regression in any of it shows up in one screenshot rather than in whichever
 * screen happened to use it.
 *
 * The copy is Russellville, the same as the design sheet: real street names,
 * real-sounding orgs, times that make sense. Placeholder copy in a specimen is
 * how a component that cannot hold a real sentence ships looking fine.
 */

const style = document.createElement('style')
style.textContent = [
  fontFaceCss('/fonts'),
  `:root {\n${Object.entries(cssVariables())
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n')}\n}`,
].join('\n\n')
document.head.prepend(style)

function Spec({ title, why, children }: { title: string; why?: string; children: React.ReactNode }) {
  return (
    <section className="sp-spec">
      <h2 className="sp-label">
        {title}
        {why ? <em>{why}</em> : null}
      </h2>
      <div className="sp-body">{children}</div>
    </section>
  )
}

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'quiet', 'destructive']

function Buttons() {
  return (
    <>
      <Spec
        title="Button, four intents and three sizes"
        why="every size clears 44px of touch target even when the box is 34px tall"
      >
        <div className="sp-matrix" style={{ gridTemplateColumns: '110px repeat(3, max-content)' }}>
          <span />
          <span className="sp-head">Small · 34px</span>
          <span className="sp-head">Medium · 40px</span>
          <span className="sp-head">Large · 48px</span>
          {VARIANTS.map((v) => (
            <Row key={v} label={v}>
              <Button variant={v} size="sm">
                Vouch
              </Button>
              <Button variant={v} size="md">
                Vouch for Dana
              </Button>
              <Button variant={v} size="lg">
                Vouch for Dana
              </Button>
            </Row>
          ))}
        </div>
      </Spec>

      <Spec
        title="Every state"
        why="loading keeps the label so the button does not resize under the finger that pressed it"
      >
        <div className="sp-matrix" style={{ gridTemplateColumns: '110px repeat(3, max-content)' }}>
          <span />
          <span className="sp-head">Default</span>
          <span className="sp-head">Disabled</span>
          <span className="sp-head">Loading</span>
          {VARIANTS.map((v) => (
            <Row key={v} label={v}>
              <Button variant={v}>Vouch</Button>
              <Button variant={v} disabled>
                Vouch
              </Button>
              <Button variant={v} loading>
                Vouching
              </Button>
            </Row>
          ))}
        </div>
        <p className="sp-note">
          Hover, active and focus are live: hover one, then Tab to it. Focus is drawn on
          <code> :focus-visible</code> only, so a mouse press does not leave a ring behind.
        </p>
      </Spec>

      <Spec title="Icons, width, and on navy" why="an icon-only button always carries a label">
        <div className="sp-row">
          <Button icon="directions">Directions</Button>
          <Button trailingIcon="external">Open site</Button>
          <IconButton name="bookmark" label="Save to my week" />
          <IconButton name="share" label="Share this story" variant="secondary" />
          <IconButton name="plus" label="Add a creation" variant="primary" />
        </div>
        <div className="sp-dark" data-on-dark>
          <Button variant="on-navy">Add to my week</Button>
          <Button variant="on-navy" icon="check">
            Added
          </Button>
        </div>
        <div className="sp-stack" style={{ maxWidth: 360 }}>
          <Button variant="primary" size="lg" full>
            Submit for committee review
          </Button>
          <Button variant="quiet" size="lg" full>
            Save as a draft
          </Button>
        </div>
      </Spec>
    </>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="sp-rowlabel">{label}</span>
      {children}
    </>
  )
}

function Chips() {
  const [picked, setPicked] = useState('open')
  const [tags, setTags] = useState(['Lake Dardanelle', 'Arkansas Tech', 'Free'])
  return (
    <>
      <Spec
        title="Filter chips"
        why="the count is inside the chip because a filter with no results should say so before you press it"
      >
        <div className="sp-row">
          <FilterChip label="All" count={712} selected={picked === 'all'} onClick={() => setPicked('all')} />
          <FilterChip label="Open now" count={184} selected={picked === 'open'} onClick={() => setPicked('open')} />
          <FilterChip label="Eat" count={96} selected={picked === 'eat'} onClick={() => setPicked('eat')} />
          <FilterChip label="On the river" count={23} selected={picked === 'river'} onClick={() => setPicked('river')} />
          <FilterChip label="Open Sunday" count={0} disabled />
        </div>
      </Spec>

      <Spec
        title="Status pills"
        why="every pill carries a glyph as well as a colour, so the state survives being printed or dimmed"
      >
        <div className="sp-row">
          <StatusPill tone="sage" icon="check">
            Open now
          </StatusPill>
          <StatusPill tone="sage" icon="badge-check">
            Verified
          </StatusPill>
          <StatusPill tone="gold" icon="building">
            From city hall
          </StatusPill>
          <StatusPill tone="live">Live now</StatusPill>
          <StatusPill tone="quiet" icon="edit">
            Draft
          </StatusPill>
          <StatusPill tone="pending" icon="clock">
            Pending review
          </StatusPill>
          <StatusPill tone="brick" icon="warning">
            Emergency
          </StatusPill>
        </div>
        <p className="sp-note">
          Only the last one is brick, and in a normal week it is not rendered at all. Pending review
          is ink on stone rather than amber, because waiting for the committee is not a warning.
        </p>
      </Spec>

      <Spec title="Tags and the APP chip" why="the APP chip is the one mark a creation can never draw itself">
        <div className="sp-row">
          {tags.map((t) => (
            <Tag key={t} label={t} onRemove={() => setTags((cur) => cur.filter((x) => x !== t))} />
          ))}
          <Tag label="Not removable" />
          <AppChip />
          <AppChip inverse />
        </div>
      </Spec>
    </>
  )
}

function Fields() {
  const [name, setName] = useState('River Valley Trash Day')
  const [about, setAbout] = useState(
    "Pulls the city's brush pickup calendar and tells you which side of Marina Way is up next.",
  )
  const [query, setQuery] = useState('taco')
  return (
    <>
      <Spec
        title="Text input, five states"
        why="the error moves the border and adds a line of text; colour alone has never told anyone what went wrong"
      >
        <div className="sp-grid">
          <TextInput
            label="What should we call your creation"
            placeholder="River Valley Trash Day"
            help="Rest, with a placeholder."
          />
          <TextInput
            label="What should we call your creation"
            value={name}
            onChange={(e) => setName(e.target.value)}
            help="Filled. Focus it to see the warm border."
          />
          <TextInput
            label="What should we call your creation"
            defaultValue="Town Square Official"
            error='A creation cannot use "Town Square" in its name. Residents need to be able to tell your work from the shell.'
          />
          <TextInput label="Handle" defaultValue="kmcbride22" ok="Available." />
          <TextInput
            label="Handle"
            defaultValue="@dana.c"
            disabled
            help="Your handle is set once, when you are vouched in."
          />
        </div>
      </Spec>

      <Spec
        title="Textarea, select, search"
        why="the counter goes quiet until you are close, then it goes terracotta"
      >
        <div className="sp-grid">
          <Textarea
            label="Tell your neighbours what it does"
            rows={4}
            maxLength={280}
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            help="Shown under your creation's name in the gallery."
          />
          <Select label="Where should it live" help="The committee can move it later.">
            <option>Town services</option>
            <option>Getting around</option>
            <option>Parks and the river</option>
            <option>Schools</option>
          </Select>
          <SearchInput
            label="Search the directory"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClear={() => setQuery('')}
            help="31 places match."
          />
        </div>
        <InlineError>That vouch code expired. Codes last a week, so ask Dana for a fresh one.</InlineError>
      </Spec>
    </>
  )
}

function Choices() {
  const [sort, setSort] = useState('near')
  const [count, setCount] = useState(6)
  return (
    <Spec
      title="Choice controls, segments and the stepper"
      why="checkbox for many, radio for one, switch for a setting that takes effect the instant you flip it"
    >
      <div className="sp-row sp-row-top">
        <div className="sp-plate">
          <p className="sp-head">Checkbox</p>
          <Checkbox defaultChecked>Open now</Checkbox>
          <Checkbox>Has a patio</Checkbox>
          <Checkbox disabled>Open Sunday</Checkbox>
        </div>
        <div className="sp-plate">
          <p className="sp-head">Radio</p>
          <Radio name="who" defaultChecked>
            Anyone in town
          </Radio>
          <Radio name="who">Verified residents only</Radio>
          <Radio name="who" disabled>
            Just me, for now
          </Radio>
        </div>
        <div className="sp-plate">
          <p className="sp-head">Switch</p>
          <Switch defaultChecked>Notify me about emergencies</Switch>
          <Switch>Weekly digest on Fridays</Switch>
          <Switch defaultChecked disabled>
            Boil orders, always on
          </Switch>
        </div>
      </div>
      <div className="sp-row">
        <SegmentedControl
          label="Sort the directory"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'near', label: 'Nearest' },
            { value: 'open', label: 'Open now' },
            { value: 'az', label: 'A to Z' },
          ]}
        />
        <Stepper value={count} onChange={setCount} min={1} max={12} unit="volunteer" />
        <Stepper value={1} onChange={() => {}} min={1} max={12} unit="volunteer" />
        <Stepper value={12} onChange={() => {}} min={1} max={12} unit="volunteer" />
      </div>
    </Spec>
  )
}

function Identity() {
  return (
    <Spec
      title="Avatars, tiles and dividers"
      why="the ring is the badge; a separate tick would be a mark a creation could forge"
    >
      <div className="sp-row">
        <Avatar initials="DC" size={24} />
        <Avatar initials="RM" size={34} tone="terracotta" />
        <Avatar initials="JT" size={48} tone="sage" />
        <Avatar initials="DC" size={48} verified />
        <AvatarStack
          people={[
            { initials: 'DC' },
            { initials: 'RM', tone: 'terracotta' },
            { initials: 'JT', tone: 'sage' },
            { initials: 'KM' },
            { initials: 'TS' },
            { initials: 'BW' },
            { initials: 'AL' },
            { initials: 'PN' },
            { initials: 'HR' },
            { initials: 'CE' },
          ]}
        />
        <Tile icon="bus" />
        <Tile initials="RV" />
      </div>
      <div style={{ maxWidth: 460 }}>
        <Divider />
        <Divider>Earlier this week</Divider>
      </div>
    </Spec>
  )
}

function Loading() {
  return (
    <Spec
      title="Loading atoms"
      why="skeletons match the shape of what is coming, so nothing jumps when it arrives"
    >
      <div className="sp-row sp-row-top">
        <div className="sp-plate">
          <p className="sp-head">Spinner</p>
          <div className="sp-row" style={{ color: 'var(--ts-terracotta)' }}>
            <Spinner size={14} />
            <Spinner size={20} />
            <Spinner size={26} />
          </div>
          <p className="sp-note">
            Only inside a control. A full-screen spinner is a skeleton we did not bother to draw.
          </p>
        </div>
        <div className="sp-plate">
          <p className="sp-head">Skeleton</p>
          <div className="sp-row sp-row-top">
            <Skeleton shape="circle" />
            <div className="sp-stack" style={{ flex: 1 }}>
              <Skeleton width="70%" />
              <Skeleton width="45%" />
            </div>
          </div>
          <Skeleton shape="block" />
        </div>
        <div className="sp-plate">
          <p className="sp-head">Progress</p>
          <Progress value={62} label="Uploading your bundle" />
          <p className="sp-note">Uploading your bundle, 62%.</p>
          <Progress value={100} label="Uploading photos" state="done" />
          <Progress value={64} label="Uploading photos" state="failed" />
          <p className="sp-note">The connection dropped. The seven that finished are saved.</p>
          <Progress label="Sending Ramp Conditions to review" />
          <p className="sp-note">
            No percentage to show, and inventing one would be a lie about how long this takes.
          </p>
        </div>
      </div>
    </Spec>
  )
}

const MARKS = ['news', 'calendar', 'bookmark', 'shelf', 'lens', 'sprout', 'grid', 'tray'] as const

function Empties() {
  return (
    <>
      <Spec title="Marks" why="CSS only, ink plus one accent, drawn with a pen not a mascot">
        <div className="sp-row">
          {MARKS.map((m) => (
            <figure key={m} className="sp-mark-cell">
              <span className={`ts-mark ts-mark--${m}`} aria-hidden="true" />
              <figcaption>{m}</figcaption>
            </figure>
          ))}
        </div>
      </Spec>

      <Spec
        title="Empty states"
        why='the voice test: read it out loud to a neighbour. "No results found" fails'
      >
        <div className="sp-grid">
          <div className="sp-plate">
            <EmptyState
              mark="news"
              line="Nothing has come in yet today."
              sub="The Courier usually posts around seven. Yesterday's front page is still here."
              action={{ label: 'Read yesterday', onAct: () => {} }}
            />
          </div>
          <div className="sp-plate">
            <EmptyState
              mark="lens"
              line={'Nothing matched "dardanelle boat ramp hours".'}
              sub="Search reads the directory, the last ninety days of stories, and every event. Fewer words usually finds more."
            />
          </div>
          <div className="sp-plate">
            <EmptyState
              mark="tray"
              tone="good"
              align="start"
              line="The queue is clear."
              sub="Last review was Tuesday at 9:12 a.m. Three creations approved, one sent back with notes."
              action={{ label: 'Review history', onAct: () => {} }}
            />
          </div>
          <div className="sp-plate">
            <EmptyState
              align="start"
              line="No events on the calendar for Tuesday."
              sub="Thursday has four, starting with market setup at 4."
              action={{ label: 'Jump to Thursday', onAct: () => {} }}
            />
          </div>
        </div>
        <p className="sp-note">
          The cleared queue is the one empty that swaps its accent to sage: it is the only one where
          "there is nothing here" is the outcome the committee was working toward.
        </p>
      </Spec>
    </>
  )
}

function Failures() {
  return (
    <>
      <Spec
        title="One section down, page fine"
        why="the everyday case: a dozen scrapers, one of them broken, and no reason to take the front page with it"
      >
        <div className="sp-grid">
          <ErrorState
            line="The library calendar isn't answering."
            sub="Everything else on this page is current. We'll keep trying in the background."
            onRetry={() => {}}
          />
          <div className="sp-plate">
            <StaleStrip>Last read yesterday at 4:15 p.m. The library may have changed this since.</StaleStrip>
            <p className="sp-note">Two-day-old story times are worth more to somebody with a four year old than an error is.</p>
          </div>
        </div>
      </Spec>

      <Spec
        title="Whole-screen failure"
        why="an unrecoverable state still owes the resident a destination"
      >
        <div className="sp-grid">
          <div className="sp-plate">
            <ErrorState
              scope="screen"
              mark="news"
              line="Town Square isn't loading right now."
              sub="This one is on us, not on your connection. It usually comes back within a few minutes."
              onRetry={() => {}}
              retryLabel="Reload"
              meta="10:04 a.m. · ref 7f2c91 · status.russellville.town"
            />
          </div>
          <div className="sp-plate">
            <ErrorState
              scope="screen"
              mark="tray"
              line="Trail Conditions was taken down on August 2."
              sub="The review committee removed it after it started asking for location on every screen. The builder has been told and can resubmit."
            >
              <div className="sp-row">
                <Button variant="primary">Browse creations</Button>
                <Button variant="quiet">Read the review note</Button>
              </div>
            </ErrorState>
          </div>
        </div>
      </Spec>

      <Spec
        title="Banners, which are conditions and not events"
        why="if the statement is still true in thirty seconds, a toast is the wrong shape"
      >
        <div className="sp-stack">
          <Banner
            tone="stale"
            title="Some of this is a day old."
            action={<Button variant="secondary">Try again</Button>}
          >
            The Courier's feed stopped answering at 6:40 p.m. yesterday. Everything below is the last
            thing we got from it. Events and the directory are current.
          </Banner>
          <Banner tone="offline" icon="cloud-rain">
            You're offline. Showing what was loaded at 8:12 a.m.
          </Banner>
          <Banner tone="slow" icon="clock">
            Slow connection. Photos are off until it picks up.
          </Banner>
          <Banner tone="back" icon="check-circle">
            Back online. Refreshing.
          </Banner>
        </div>
      </Spec>
    </>
  )
}

function Overlays() {
  const [confirm, setConfirm] = useState(false)
  const [danger, setDanger] = useState(false)
  const [sheet, setSheet] = useState(false)
  return (
    <Spec
      title="Modals and sheets"
      why="interrupting a person is expensive, so each one has to be a question only they can answer"
    >
      <div className="sp-row">
        <Button onClick={() => setConfirm(true)}>Leave without posting</Button>
        <Button variant="destructive" onClick={() => setDanger(true)}>
          Remove listing
        </Button>
        <Button variant="primary" onClick={() => setSheet(true)}>
          What does verified mean?
        </Button>
      </div>
      <p className="sp-note">
        Open one and try it: focus lands on the heading, Tab is trapped, Escape closes, the scrim
        closes the sheet but not either confirm, and focus goes back to the button that opened it.
      </p>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Leave without posting?"
        description="Your draft about the Prairie Creek ramp will be saved and it'll be here when you come back."
        actions={
          <>
            <Button variant="quiet" onClick={() => setConfirm(false)}>
              Keep writing
            </Button>
            <Button variant="primary" onClick={() => setConfirm(false)}>
              Save and leave
            </Button>
          </>
        }
      />

      <Modal
        open={danger}
        kind="alert"
        onClose={() => setDanger(false)}
        title="Remove the listing for River Valley Bicycles?"
        description="This can't be undone. The hours, the phone number, and the eleven photos go with it, and adding it back means starting from an empty form."
        actions={
          <>
            <Button variant="secondary" onClick={() => setDanger(false)}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={() => setDanger(false)}>
              Remove listing
            </Button>
          </>
        }
      />

      <BottomSheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="What verified means here"
        description="Ten neighbours have said they know you're a real person in Russellville. That's the whole mechanism."
        actions={
          <Button variant="primary" onClick={() => setSheet(false)}>
            Got it
          </Button>
        }
      >
        <p className="sp-note">
          Town Square never stores your address, and verified is not the same as identified. A
          creation you open can see two things about you: your handle, and whether you're verified.
        </p>
      </BottomSheet>
    </Spec>
  )
}

function Toasts() {
  const { show } = useToast()
  return (
    <Spec
      title="Toasts"
      why="a toast is for something that already happened somewhere you are not looking"
    >
      <div className="sp-row">
        <Button
          onClick={() =>
            show({
              kind: 'info',
              message: 'Saved to your list.',
              plural: (n) => `${n} stories saved.`,
              action: { label: 'Undo', onAct: () => {}, icon: 'undo' },
            })
          }
        >
          Save a story
        </Button>
        <Button
          onClick={() =>
            show({
              kind: 'good',
              message: 'Ramp Conditions is live in the gallery.',
              action: { label: 'View', onAct: () => {} },
            })
          }
        >
          Publish
        </Button>
        <Button
          onClick={() =>
            show({
              kind: 'warn',
              message: 'Two of your listing photos were over 8 MB and were skipped.',
              action: { label: 'Which ones', onAct: () => {} },
            })
          }
        >
          Upload photos
        </Button>
        <Button
          onClick={() =>
            show({
              kind: 'problem',
              message: "Couldn't remove that bookmark.",
              action: { label: 'Retry', onAct: () => {}, icon: 'refresh' },
            })
          }
        >
          Break something
        </Button>
        <Button onClick={() => show({ message: 'Saved to your list.' })}>Info, no action</Button>
      </div>
      <p className="sp-note">
        Press Save a story three times: they collapse into one line with a count rather than
        repeating. Press five different ones: three stay and the problem is never the one evicted.
        Hover the stack and every timer pauses, which is the only reason undo is reachable.
      </p>
      <AlertRegion message="" />
    </Spec>
  )
}

function Icons() {
  return (
    <Spec title="The sprite" why="121 symbols on one 24px grid, served from our own origin, not a webfont">
      <div className="sp-icons">
        {SPRITE_ICONS.map((n) => (
          <figure key={n} className="sp-icon-cell">
            <Icon name={n} size={22} />
            <figcaption>{n}</figcaption>
          </figure>
        ))}
        {(['heartbeat', 'target'] as const).map((n) => (
          <figure key={n} className="sp-icon-cell" data-local>
            <Icon name={n} size={22} />
            <figcaption>{n}</figcaption>
          </figure>
        ))}
      </div>
      <p className="sp-note">
        The last two are still drawn in <code>Icon.tsx</code>. A heart would read as "like this
        place" where the category means health, and both of the sprite's pins mean "a place" where
        the recenter control means "the place you are".
      </p>
    </Spec>
  )
}

function Page() {
  return (
    <main className="sp-page">
      <header className="sp-top">
        <p className="sp-eyebrow">Town Square</p>
        <h1>Primitives</h1>
        <p className="sp-lede">
          Everything in <code>src/ui/</code>, in every state it has. If a screen needs something
          that is not on this page, that is worth a conversation before it becomes a one-off.
        </p>
      </header>
      <Buttons />
      <Chips />
      <Fields />
      <Choices />
      <Identity />
      <Loading />
      <Empties />
      <Failures />
      <Overlays />
      <Toasts />
      <Icons />
    </main>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('no #root')

createRoot(root).render(
  <StrictMode>
    <ToastProvider>
      <Page />
    </ToastProvider>
  </StrictMode>,
)
