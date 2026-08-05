import { describe, expect, it } from 'vitest'
import {
  MAP_WIDTH,
  MAX_ZOOM,
  MIN_ZOOM,
  centreOn,
  clampCamera,
  feetToUnits,
  mapHeight,
  project,
  viewBoxOf,
  wholeTown,
  type Bounds,
} from './mapProjection.js'

/** Roughly the real payload's box: about six miles across, five tall. */
const BOUNDS: Bounds = {
  minLat: 35.2329,
  maxLat: 35.3213,
  minLng: -93.174,
  maxLng: -93.0829,
}

describe('project', () => {
  it('puts the corners of the box at the corners of the map', () => {
    const topLeft = project(BOUNDS.maxLat, BOUNDS.minLng, BOUNDS)
    const bottomRight = project(BOUNDS.minLat, BOUNDS.maxLng, BOUNDS)

    expect(topLeft.x).toBeCloseTo(0, 6)
    expect(topLeft.y).toBeCloseTo(0, 6)
    expect(bottomRight.x).toBeCloseTo(MAP_WIDTH, 6)
    expect(bottomRight.y).toBeCloseTo(mapHeight(BOUNDS), 6)
  })

  /** SVG's y grows downward and latitude grows northward. */
  it('puts north at the top', () => {
    const north = project(35.31, -93.13, BOUNDS)
    const south = project(35.24, -93.13, BOUNDS)
    expect(north.y).toBeLessThan(south.y)
  })

  /**
   * The `cos(lat)` term is the whole reason this is not a bare linear scale.
   * Without it the town comes out stretched east-west by about a fifth.
   */
  it('keeps the aspect ratio honest, so a mile north looks like a mile east', () => {
    const feetPerLat = 364_000
    const feetPerLng = 364_000 * Math.cos((35.2771 * Math.PI) / 180)

    const origin = project(35.2771, -93.13, BOUNDS)
    const oneMileNorth = project(35.2771 + 5280 / feetPerLat, -93.13, BOUNDS)
    const oneMileEast = project(35.2771, -93.13 + 5280 / feetPerLng, BOUNDS)

    // Within a tenth of a percent, not exact: the projection scales longitude
    // at the box's middle latitude and this mile is measured at its own, which
    // is the residual an equirectangular projection is defined to have.
    const ratio =
      Math.abs(oneMileNorth.y - origin.y) / Math.abs(oneMileEast.x - origin.x)
    expect(ratio).toBeGreaterThan(0.999)
    expect(ratio).toBeLessThan(1.001)
  })
})

describe('feetToUnits', () => {
  it('scales a corridor spread into the same space as the pins', () => {
    const oneMile = feetToUnits(5280, BOUNDS)
    expect(feetToUnits(2640, BOUNDS)).toBeCloseTo(oneMile / 2, 6)
    expect(oneMile).toBeGreaterThan(0)
    expect(oneMile).toBeLessThan(MAP_WIDTH)
  })
})

describe('clampCamera', () => {
  it('holds the zoom inside its range', () => {
    expect(clampCamera({ x: 500, y: 200, zoom: 0.2 }, BOUNDS).zoom).toBe(MIN_ZOOM)
    expect(clampCamera({ x: 500, y: 200, zoom: 99 }, BOUNDS).zoom).toBe(MAX_ZOOM)
  })

  /** A flick must never leave a resident staring at nothing. */
  it('will not let the view leave the town', () => {
    const flungRight = clampCamera({ x: 99_999, y: 200, zoom: 4 }, BOUNDS)
    expect(flungRight.x).toBeLessThanOrEqual(MAP_WIDTH)

    const flungUp = clampCamera({ x: 500, y: -99_999, zoom: 4 }, BOUNDS)
    expect(flungUp.y).toBeGreaterThan(0)
  })

  it('centres exactly when the whole town is in view', () => {
    const out = clampCamera({ x: 0, y: 0, zoom: MIN_ZOOM }, BOUNDS)
    expect(out.x).toBeCloseTo(MAP_WIDTH / 2, 6)
    expect(out.y).toBeCloseTo(mapHeight(BOUNDS) / 2, 6)
  })
})

describe('viewBoxOf', () => {
  it('frames the whole map at zoom 1', () => {
    expect(viewBoxOf(wholeTown(BOUNDS), BOUNDS)).toBe(`0 0 ${MAP_WIDTH} ${mapHeight(BOUNDS)}`)
  })

  it('halves the window each time the zoom doubles', () => {
    const [, , w] = viewBoxOf({ x: 500, y: 200, zoom: 2 }, BOUNDS).split(' ').map(Number)
    expect(w).toBeCloseTo(MAP_WIDTH / 2, 6)
  })
})

describe('centreOn', () => {
  it('puts the point in the middle, zoomed in but not all the way', () => {
    const camera = centreOn(35.2784, -93.1338, BOUNDS)
    const target = project(35.2784, -93.1338, BOUNDS)
    expect(camera.x).toBeCloseTo(target.x, 6)
    expect(camera.zoom).toBeGreaterThan(MIN_ZOOM)
    expect(camera.zoom).toBeLessThan(MAX_ZOOM)
  })

  it('clamps to the town when the point is outside it', () => {
    const camera = centreOn(36.9, -86.9, BOUNDS)
    expect(camera.x).toBeLessThanOrEqual(MAP_WIDTH)
    expect(camera.y).toBeGreaterThan(0)
  })
})
