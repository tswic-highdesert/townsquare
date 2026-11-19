/** Interactive map with a bundled, attributed OpenStreetMap basemap.
 * Directory-derived street corridors remain the fallback if geometry cannot load.
 * All map geometry comes from this origin; no third-party tiles or location calls.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon, type IconName } from './Icon.js'
import { LocalBasemap, useLocalBasemap } from './LocalBasemap.js'
import {
  MAP_WIDTH,
  centreOn,
  clampCamera,
  feetToUnits,
  mapHeight,
  project,
  viewBoxOf,
  wholeTown,
  type Bounds,
  type Camera,
} from './mapProjection.js'
import type { NearbyPlace, PlaceKind, Position, RankedPlace } from './nearbyData.js'
import { t, tn } from './i18n/index.js'

export interface StreetCorridor {
  name: string
  points: Array<[number, number]>
  spreadFt: number
  count: number
}

export interface TownMapProps {
  bounds: Bounds
  streets: StreetCorridor[]
  /** Everything that survived the chip and the search, not just the listed rows. */
  places: RankedPlace[]
  position: Position | null
  selectedId: string | null
  onSelect: (place: NearbyPlace | null) => void
  kindIcon: Record<PlaceKind, IconName>
}

/**
 * A corridor earns a name at this many addresses.
 *
 * Every corridor is drawn; only the well-evidenced ones are labelled. Twenty-two
 * rotated street names on a phone is a screen of type with a town behind it.
 */
const LABEL_AT = 10

export function TownMap(props: TownMapProps) {
  const { bounds, streets, places, position } = props
  const localMap = useLocalBasemap()
  const [camera, setCamera] = useState<Camera>(() => wholeTown(bounds))
  const svgRef = useRef<SVGSVGElement>(null)
  /**
   * Drag state in a ref, not in state.
   *
   * A pan writes on every pointermove. Putting the anchor in React state would
   * re-render the whole pin layer twice per frame to move a viewBox.
   */
  const drag = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null)

  const height = mapHeight(bounds)
  const [boxWidth, setBoxWidth] = useState(0)
  const [boxHeight, setBoxHeight] = useState(0)

  /**
   * The rendered size of the frame, watched.
   *
   * Every mark on this map — a pin, the position dot, a stroke — has to be a
   * fixed number of *screen pixels* however far the camera is zoomed in, and
   * SVG sizes things in view units. Guessing the conversion is what the first
   * pass did, with a constant that assumed a 440px frame; the resident's dot
   * came out three pixels across and unfindable on the screenshot.
   */
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const measure = () => {
      const box = svg.getBoundingClientRect()
      setBoxWidth(box.width)
      setBoxHeight(box.height)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])

  /**
   * View units per CSS pixel.
   *
   * `preserveAspectRatio="meet"` fits whichever axis is tighter, so the scale
   * is the smaller of the two ratios — the same rule the browser applies.
   */
  const unitsPerPixel =
    boxWidth > 0 && boxHeight > 0
      ? 1 / Math.min((boxWidth * camera.zoom) / MAP_WIDTH, (boxHeight * camera.zoom) / height)
      : 1

  /** A size in screen pixels, in view units. */
  const px = (pixels: number) => pixels * unitsPerPixel

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    // Deliberately no `setPointerCapture` here. Capturing on press routes the
    // subsequent `click` to the capturing element, so every tap on a pin was
    // delivered to the background instead and the pin never opened. Capture is
    // taken below, once a drag has actually begun.
    drag.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    const dx = (e.clientX - d.x) * unitsPerPixel
    const dy = (e.clientY - d.y) * unitsPerPixel

    // A few pixels of slop, so a tap that wobbles is still a tap.
    if (!d.moved && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) {
      d.moved = true
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    if (!d.moved) return

    d.x = e.clientX
    d.y = e.clientY
    setCamera((c) => clampCamera({ ...c, x: c.x - dx, y: c.y - dy }, bounds))
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.moved && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
      return
    }
    // A 44px touch target is useful even when the visible overview pin is small.
    const transform = e.currentTarget.getScreenCTM()
    if (!transform) return
    const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(transform.inverse())
    let nearest: RankedPlace | null = null
    let distance = px(22)
    for (const place of places) {
      const pin = project(place.lat, place.lng, bounds)
      const next = Math.hypot(pin.x - point.x, pin.y - point.y)
      if (next < distance) { distance = next; nearest = place }
    }
    props.onSelect(nearest)
  }

  function zoomBy(factor: number) {
    setCamera((c) => clampCamera({ ...c, zoom: c.zoom * factor }, bounds))
  }

  const corridors = useMemo(
    () =>
      streets.map((street) => ({
        street,
        d: street.points
          .map((p, i) => {
            const { x, y } = project(p[0], p[1], bounds)
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
          })
          .join(' '),
        // The band is the data's precision, drawn. Floored so a very tight
        // corridor is still a road rather than a hair.
        width: Math.max(4, feetToUnits(street.spreadFt * 2, bounds)),
        label: labelFor(street, bounds),
      })),
    [streets, bounds],
  )

  const me = position ? project(position.lat, position.lng, bounds) : null

  return (
    <div className="map-wrap">
      <svg
        ref={svgRef}
        className="map"
        viewBox={viewBoxOf(camera, bounds)}
        /*
          `meet`, not `slice`. Slicing filled the frame and quietly cropped the
          long axis — at the "whole town" zoom, West Main Street was off the
          side of a map that claimed to be showing everything. Letterboxing is
          the honest one, and the ground below is drawn oversized so the bands
          are the same stone rather than two grey stripes.
        */
        preserveAspectRatio="xMidYMid meet"
        /*
          A group, not an image: the pins inside are buttons, and an image's
          children are hidden from assistive technology. The arrow keys pan it
          and +/- zoom it. The pins are not each a tab stop, because seven
          hundred of them would be a trap; the list view one toggle away is the
          keyboard's way to every place on this map.
        */
        role="group"
        aria-roledescription={t('map')}
        tabIndex={0}
        onKeyDown={(event) => {
          const step = 60 * unitsPerPixel
          const deltas: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
          const delta = deltas[event.key]
          if (delta) { event.preventDefault(); setCamera(c => clampCamera({ ...c, x: c.x + delta[0], y: c.y + delta[1] }, bounds)) }
          else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomBy(1.6) }
          else if (event.key === '-') { event.preventDefault(); zoomBy(1 / 1.6) }
        }}
        aria-label={localMap
          ? tn(places.length, 'OpenStreetMap map of Russellville with {count} directory places', 'OpenStreetMap map of Russellville with {count} directory places')
          : tn(places.length, 'Approximate directory map with {count} listings', 'Approximate directory map with {count} listings')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={(e) => zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15)}
      >
        <rect
          x={-MAP_WIDTH}
          y={-height}
          width={MAP_WIDTH * 3}
          height={height * 3}
          className="map-ground"
        />

        {localMap && <LocalBasemap map={localMap} bounds={bounds} unitsPerPixel={unitsPerPixel} zoom={camera.zoom} />}
        {!localMap && corridors.map(({ street, d, width }) => (
          <path key={street.name} className="map-street" d={d} strokeWidth={width} />
        ))}

        {places.map((place) => {
          const { x, y } = project(place.lat, place.lng, bounds)
          const selected = place.id === props.selectedId
          /*
            Smaller when the whole town is in frame. At one fixed size the
            corridors downtown became a solid band of colour — which is a
            density plot pretending to be pins. Zoomed in, each one is a place
            you could tap.
          */
          const r = px(selected ? 9 : 2.5 + Math.min(3.5, camera.zoom - 1))
          return (
            <circle
              key={place.id}
              className="map-pin"
              data-kind={place.kind}
              data-selected={selected || undefined}
              cx={x}
              cy={y}
              r={r}
              strokeWidth={px(1.5)}
              onClick={() => props.onSelect(place)}
              role="button"
              tabIndex={selected ? 0 : -1}
              aria-label={place.name}
              onKeyDown={event => { if(event.key === 'Enter' || event.key === ' ') { event.preventDefault(); props.onSelect(place) } }}
            >
              <title>{place.name}</title>
            </circle>
          )
        })}

        {/*
          Last, so a street name is never overprinted by the next corridor's
          band or by the pins on it. The halo is the same stone as the ground,
          scaled with the camera so it stays a hairline at every zoom.
        */}
        {!localMap && corridors.map(({ street, label }) =>
          label ? (
            <text
              key={`${street.name}-label`}
              className="map-street-label"
              x={label.x}
              y={label.y}
              transform={`rotate(${label.angle} ${label.x} ${label.y})`}
              // The label rides the corridor, so it must not scale with it.
              style={{ fontSize: px(10.5), strokeWidth: px(3) }}
            >
              {street.name.toUpperCase()}
            </text>
          ) : null,
        )}

        {me && (
          <g className="map-me">
            <circle cx={me.x} cy={me.y} r={px(20)} className="map-me-halo" />
            <circle
              cx={me.x}
              cy={me.y}
              r={px(7)}
              strokeWidth={px(3)}
              className="map-me-dot"
            />
          </g>
        )}
      </svg>

      <div className="map-controls">
        <button
          className="map-control"
          onClick={() => setCamera(position ? centreOn(position.lat, position.lng, bounds) : wholeTown(bounds))}
          aria-label={position ? t('Centre on me') : t('Show the whole town')}
        >
          <Icon name={position ? 'target' : 'compass'} size={20} />
        </button>
        <button className="map-control" onClick={() => zoomBy(1.6)} aria-label={t('Zoom in')}>
          <Icon name="add" size={20} />
        </button>
        <button className="map-control" onClick={() => zoomBy(1 / 1.6)} aria-label={t('Zoom out')}>
          <Icon name="minus" size={20} />
        </button>
      </div>

      {/*
        The one caption on the map, and it is the point. A resident looking at a
        drawn town deserves to know what it was drawn from — and that the
        precision they are reading is a block, not a survey.
      */}
      <p className="map-provenance">
        {localMap ? <>{t('Map ©')} <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">{t('OpenStreetMap contributors')}</a>. {t('Served by Town Square; no map provider receives your location.')}</> : <>{t('Approximate streets from directory addresses. Places can be explored in the list if the map is unavailable.')}</>}
      </p>
    </div>
  )
}

/**
 * Where a street's name goes, and which way up.
 *
 * On the longest segment of the corridor, so the name has room, and always
 * reading left to right — a label rotated past vertical is upside down, which
 * is worse than one at an awkward angle.
 */
function labelFor(
  street: StreetCorridor,
  bounds: Bounds,
): { x: number; y: number; angle: number } | null {
  if (street.count < LABEL_AT || street.points.length < 2) return null

  let best = { length: 0, a: street.points[0]!, b: street.points[1]! }
  for (let i = 0; i + 1 < street.points.length; i++) {
    const a = project(street.points[i]![0], street.points[i]![1], bounds)
    const b = project(street.points[i + 1]![0], street.points[i + 1]![1], bounds)
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (length > best.length) best = { length, a: street.points[i]!, b: street.points[i + 1]! }
  }

  const a = project(best.a[0], best.a[1], bounds)
  const b = project(best.b[0], best.b[1], bounds)
  let angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
  if (angle > 90) angle -= 180
  if (angle < -90) angle += 180

  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, angle }
}
