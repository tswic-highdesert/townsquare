# Russellville offline basemap provenance

`apps/web/public/maps/russellville.json` is a static, simplified OpenStreetMap extract for the Town Square map. It contains actual public mapped geometry, not inferred streets or decorative geography. No resident location or search data was sent to the source.

## Source and attribution

- Data source: OpenStreetMap, downloaded from `https://overpass-api.de/api/interpreter`.
- Basemap source timestamp: `2026-10-02T00:49:48Z`.
- Water relation source timestamp: `2026-10-02T00:50:49Z`.
- The exact download time and both raw-response SHA-256 hashes are embedded in the JSON metadata.
- Bounding box, in south/west/north/east order: `35.20, -93.30, 35.36, -93.03`.
- Display this exact attribution visibly with the map: **© OpenStreetMap contributors**. Link it to [OpenStreetMap copyright](https://www.openstreetmap.org/copyright).
- This derived data is provided under [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The public JSON is the downloadable derived database. Its license is separate from the application source license.

OpenStreetMap's [copyright page](https://www.openstreetmap.org/copyright) provides the primary licensing and attribution instructions. The [OpenStreetMap Overpass documentation](https://wiki.openstreetmap.org/wiki/Overpass_API) describes the read-only data API and usage policies. This is a frozen data export; browsers must not contact Overpass or an external tile server during map use.

## Coverage and transformation

The extract contains 2,604 features: 2,344 road segments, 140 water areas, 93 waterways, and 27 parks or recreation areas. Lake Dardanelle, Galla Creek Lake, waterways, park boundaries, street geometry, names, and road classes come from OSM tags and coordinates. Labels should use those names rather than inferred identities.

The pipeline joins complete relation boundaries into polygons, subtracts inner rings, clips geometry to the requested bounding box, simplifies with an 8-meter tolerance in a local metric projection, and rounds coordinates to five decimal places. It retains OSM feature IDs. Open, missing, or invalid polygon boundaries are never artificially closed. A very large Ozark-Saint Francis National Forest relation without returned members was excluded; valid local tagged areas remain. This extract is for orientation, not navigation, cadastral measurement, or access claims.

The initial bounded query returned relation tags and bounds but no member geometry. A second narrow query fetched body geometry for the five returned water relation IDs. Both exact successful queries are saved alongside this document. The primary server initially returned HTTP 406 to the generic curl user agent; a mirror timed out. The successful requests used an identifying Town Square user agent, as the provider requests. No scraping loop or scheduled fetch was added.

The file is 666,620 bytes as uncompressed GeoJSON and 99,923 bytes with standard gzip. The full neighborhood street network is retained rather than deleting geographic detail to reach the approximate 200 KB transfer target. Serve with HTTP compression if available; do not claim the uncompressed payload is 100 KB.

## Rendering contract

- Standard GeoJSON `FeatureCollection` with additional provenance metadata.
- `coordinates` always use **[longitude, latitude]**. Call the existing projection as `project(coordinate[1], coordinate[0], bounds)`.
- Each feature has an OSM ID such as `way/123` or `relation/1604650`.
- `properties.kind` is `road`, `water`, `waterway`, or `park`.
- `properties.class` is the source OSM highway, waterway, water, or leisure classification. Optional `name` and `ref` are source tags.
- Handle `LineString`, `MultiLineString`, `Polygon`, and `MultiPolygon`. Each polygon's first ring is its outer boundary; remaining rings are holes. Use SVG `fill-rule="evenodd"` so islands remain land.
- Recommended layer order: parks, water areas, waterways, minor roads, major roads, then application pins and labels.
- The included `bounds` object has the same shape as `mapProjection.ts` requires. The renderer may use a tighter existing viewport, clipping naturally.

## Reproduction and validation

With the two Overpass responses saved locally:

```sh
python3 docs/execution-2026-10-01/maps/build-basemap.py \
  /tmp/rvts-basemap-osm.json \
  apps/web/public/maps/russellville.json \
  /tmp/rvts-basemap-water.json
```

The converter requires Shapely 2; generation used Shapely 2.0.7. Both source queries use bounded server timeouts. Keep downloads explicit and infrequent rather than making the build depend on a live data service.

Validation checked every emitted geometry for validity, nonempty shape, and bounds containment. A static visual review confirmed the lake shoreline, river corridor, islands, road network, and local parks render together without artificial polygon-closing edges. The real application map still needs its own browser review after integration; this task does not claim that integration is complete.
