/**
 * Latitude and longitude onto an SVG, and back.
 *
 * Equirectangular with the longitude scaled by `cos(lat)`. Web Mercator is what
 * a tile layer would force, and this map has no tiles to line up with — over a
 * town six miles across the two differ by less than the width of a pin, and
 * this one is four lines of arithmetic that anybody can check.
 *
 * Pure and tested, for the same reason `rankPlaces` is: it decides where every
 * pin on the screen goes, and a projection that is subtly wrong looks exactly
 * like a projection that is right.
 */

export interface Bounds {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

export interface Viewport {
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

/**
 * The map's internal coordinate system, before pan and zoom.
 *
 * Fixed at 1000 units wide, with the height falling out of the town's own
 * aspect ratio. Working in a stable space means pan and zoom are one `viewBox`
 * string and no projection has to be redone when the window resizes.
 */
export const MAP_WIDTH = 1000

export function mapHeight(bounds: Bounds): number {
  const spanLng = (bounds.maxLng - bounds.minLng) * Math.cos((midLat(bounds) * Math.PI) / 180)
  const spanLat = bounds.maxLat - bounds.minLat
  if (spanLng <= 0) return MAP_WIDTH
  return Math.round((MAP_WIDTH * spanLat) / spanLng)
}

function midLat(bounds: Bounds): number {
  return (bounds.minLat + bounds.maxLat) / 2
}

export function project(lat: number, lng: number, bounds: Bounds): Point {
  const cos = Math.cos((midLat(bounds) * Math.PI) / 180)
  const spanLng = (bounds.maxLng - bounds.minLng) * cos
  const height = mapHeight(bounds)
  return {
    x: spanLng === 0 ? MAP_WIDTH / 2 : ((lng - bounds.minLng) * cos * MAP_WIDTH) / spanLng,
    // SVG's y grows downward and latitude grows northward.
    y: height - ((lat - bounds.minLat) * height) / (bounds.maxLat - bounds.minLat),
  }
}

/** Feet to map units, so a corridor's measured spread can be its stroke width. */
export function feetToUnits(feet: number, bounds: Bounds): number {
  const spanFeet = (bounds.maxLng - bounds.minLng) * 364_000 * Math.cos((midLat(bounds) * Math.PI) / 180)
  return spanFeet === 0 ? 0 : (feet * MAP_WIDTH) / spanFeet
}

export interface Camera {
  /** Centre of the view, in map units. */
  x: number
  y: number
  /** 1 is the whole town. Higher is closer in. */
  zoom: number
}

/**
 * How far in the camera may go.
 *
 * The floor is the whole town, because zooming out past the data is a screen of
 * empty cream. The ceiling is eight, at which a six-mile town is three quarters
 * of a mile across the phone — past that the corridors, which are accurate to a
 * couple of hundred feet, would start being read as survey lines.
 */
export const MIN_ZOOM = 1
export const MAX_ZOOM = 8

export function clampCamera(camera: Camera, bounds: Bounds): Camera {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom))
  const height = mapHeight(bounds)
  const halfW = MAP_WIDTH / (2 * zoom)
  const halfH = height / (2 * zoom)
  return {
    zoom,
    // Kept inside the town, so a flick never leaves a resident staring at
    // nothing with no obvious way back.
    x: Math.min(MAP_WIDTH - halfW, Math.max(halfW, camera.x)),
    y: Math.min(height - halfH, Math.max(halfH, camera.y)),
  }
}

export function viewBoxOf(camera: Camera, bounds: Bounds): string {
  const height = mapHeight(bounds)
  const w = MAP_WIDTH / camera.zoom
  const h = height / camera.zoom
  return `${camera.x - w / 2} ${camera.y - h / 2} ${w} ${h}`
}

export function wholeTown(bounds: Bounds): Camera {
  return { x: MAP_WIDTH / 2, y: mapHeight(bounds) / 2, zoom: MIN_ZOOM }
}

/**
 * A camera centred on a point, at a readable zoom.
 *
 * Used by the recenter control. Four rather than the maximum: dropped all the
 * way in, a resident loses every landmark they were orienting by and has to
 * pinch back out to work out where they are.
 */
export function centreOn(lat: number, lng: number, bounds: Bounds): Camera {
  const { x, y } = project(lat, lng, bounds)
  return clampCamera({ x, y, zoom: 4 }, bounds)
}
