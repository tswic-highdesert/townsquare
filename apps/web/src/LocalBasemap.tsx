import { useEffect, useMemo, useState } from 'react'
import { project, type Bounds } from './mapProjection.js'

interface MapFeature { kind: 'water' | 'waterway' | 'park' | 'major' | 'road'; name: string; paths: number[][][] }
interface LocalMap { features: MapFeature[] }
type Coordinates = number[]
interface GeoFeature {
  properties: { kind: 'road' | 'water' | 'waterway' | 'park'; class?: string; name?: string }
  geometry: { type: string; coordinates: unknown }
}
/** GeoJSON longitude/latitude becomes the projection's latitude/longitude. */
function normalize(features: GeoFeature[]): MapFeature[] {
  return features.map((feature): MapFeature => {
    const { geometry, properties } = feature
    let paths: Coordinates[][]
    if (geometry.type === 'LineString') paths = [geometry.coordinates as Coordinates[]]
    else if (geometry.type === 'MultiPolygon') paths = (geometry.coordinates as Coordinates[][][]).flat()
    else paths = geometry.coordinates as Coordinates[][]
    const major = properties.kind === 'road' && /^(motorway|trunk|primary|secondary|tertiary)/.test(properties.class ?? '')
    return { kind: major ? 'major' : properties.kind, name: properties.name ?? '',
      paths: paths.map(path => path.map(([lng, lat]) => [lat!, lng!])) }
  }).sort((a,b) => ['park','water','waterway','road','major'].indexOf(a.kind) - ['park','water','waterway','road','major'].indexOf(b.kind))
}
let cached: LocalMap | null = null
let pending: Promise<LocalMap | null> | null = null

/** A bounded, attributed OpenStreetMap snapshot served from our own origin. */
export function useLocalBasemap() {
  const [map, setMap] = useState<LocalMap | null>(cached)
  useEffect(() => {
    let active = true
    if (!pending) pending = fetch('/maps/russellville.json').then(async response => {
      if (!response.ok) return null
      const data = await response.json() as { features: GeoFeature[] }
      if (!Array.isArray(data.features)) return null
      cached = { features: normalize(data.features) }
      return cached
    }).catch(() => null)
    void pending.then(data => { if (active) setMap(data) })
    return () => { active = false }
  }, [])
  return map
}

export function LocalBasemap({ map, bounds, unitsPerPixel, zoom }: { map: LocalMap; bounds: Bounds; unitsPerPixel: number; zoom: number }) {
  const features = useMemo(() => map.features.map((feature, id) => ({
    ...feature, id,
    d: feature.paths.map(path => path.map(([lat,lng], index) => {
      const p = project(lat!,lng!,bounds)
      return `${index ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`
    }).join(' ') + (feature.kind === 'water' || feature.kind === 'park' ? 'Z' : '')).join(' '),
  })),[map,bounds])
  const labels = useMemo(() => {
    const longest = new Map<string,{x:number;y:number;angle:number;length:number;name:string}>()
    for (const feature of map.features) {
      if (feature.kind !== 'major' || !feature.name) continue
      for (const path of feature.paths) for(let i=1;i<path.length;i++) {
        const a=path[i-1]!,b=path[i]!
        const midLat=(a[0]!+b[0]!)/2, midLng=(a[1]!+b[1]!)/2
        if(midLat<bounds.minLat || midLat>bounds.maxLat || midLng<bounds.minLng || midLng>bounds.maxLng)continue
        const p=project(a[0]!,a[1]!,bounds),q=project(b[0]!,b[1]!,bounds)
        const length=Math.hypot(q.x-p.x,q.y-p.y)
        if((longest.get(feature.name)?.length??0)>=length)continue
        let angle=Math.atan2(q.y-p.y,q.x-p.x)*180/Math.PI
        if(angle>90)angle-=180;if(angle< -90)angle+=180
        longest.set(feature.name,{x:(p.x+q.x)/2,y:(p.y+q.y)/2,angle,length,name:feature.name})
      }
    }
    return [...longest.values()].sort((a,b)=>b.length-a.length).slice(0,zoom>2?14:7)
  },[map,bounds,zoom])
  return <g className="local-basemap" aria-hidden="true" pointerEvents="none">
    {features.map(f=><path key={f.id} d={f.d} className={`local-map-${f.kind}`} fillRule="evenodd" strokeWidth={f.kind==='major'?Math.max(2.2*unitsPerPixel,5):f.kind==='road'?Math.max(.85*unitsPerPixel,1.7):undefined}/>) }
    {labels.map(label=><text key={label.name} className="local-map-label" x={label.x} y={label.y} transform={`rotate(${label.angle} ${label.x} ${label.y})`} style={{fontSize:11*unitsPerPixel,strokeWidth:3*unitsPerPixel}}>{label.name}</text>)}
  </g>
}
