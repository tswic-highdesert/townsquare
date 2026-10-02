"""Build the offline OSM map extract. Requires Python 3 and Shapely 2.

Usage: python3 build-basemap.py RAW_OVERPASS_JSON OUTPUT_JSON WATER_RELATIONS_JSON
No network calls are performed by this conversion step.
"""
import collections
import datetime
import hashlib
import json
import math
import sys
from pathlib import Path

from shapely import affinity
from shapely.geometry import LineString, Polygon, box, mapping, shape
from shapely.ops import polygonize, unary_union

SOUTH, WEST, NORTH, EAST = 35.20, -93.30, 35.36, -93.03
CLIP = box(WEST, SOUTH, EAST, NORTH)
X_METERS = 111_320 * math.cos(math.radians((SOUTH + NORTH) / 2))
Y_METERS = 111_132


def coordinates(points):
    return [(p["lon"], p["lat"]) for p in points if "lon" in p and "lat" in p]


def relation_polygon(element):
    roles = {"outer": [], "inner": []}
    for member in element.get("members", []):
        if member["type"] != "way" or "geometry" not in member:
            continue
        role = member.get("role") or "outer"
        if role not in roles:
            continue
        points = coordinates(member["geometry"])
        if len(points) >= 2:
            roles[role].append(LineString(points))
    outer = unary_union(list(polygonize(roles["outer"])))
    inner = unary_union(list(polygonize(roles["inner"])))
    return outer.difference(inner)


def simplify(geometry, meters):
    metric = affinity.scale(geometry, xfact=X_METERS, yfact=Y_METERS, origin=(0, 0))
    metric = metric.simplify(meters, preserve_topology=True)
    return affinity.scale(metric, xfact=1 / X_METERS, yfact=1 / Y_METERS, origin=(0, 0))


def rounded(value):
    if isinstance(value, (tuple, list)):
        return [rounded(v) for v in value]
    return round(value, 5)


def convert(raw, tolerance):
    features = []
    skipped = []
    for element in raw["elements"]:
        tags = element.get("tags", {})
        if "highway" in tags:
            kind, classification = "road", tags["highway"]
        elif tags.get("natural") == "water":
            kind, classification = "water", tags.get("water", "water")
        elif "waterway" in tags:
            kind, classification = "waterway", tags["waterway"]
        elif "leisure" in tags:
            kind, classification = "park", tags["leisure"]
        else:
            continue
        osm_id = f'{element["type"]}/{element["id"]}'
        if element["type"] == "relation":
            geometry = relation_polygon(element)
        else:
            points = coordinates(element.get("geometry", []))
            if len(points) < 2:
                skipped.append(osm_id)
                continue
            if kind in {"park", "water"}:
                # Never close an unclosed OSM boundary by inventing an edge.
                if points[0] != points[-1] or len(points) < 4:
                    skipped.append(osm_id)
                    continue
                geometry = Polygon(points)
            else:
                geometry = LineString(points)
        if geometry.is_empty or not geometry.is_valid:
            skipped.append(osm_id)
            continue
        geometry = geometry.intersection(CLIP)
        if geometry.is_empty:
            continue
        geometry = simplify(geometry, tolerance)
        if geometry.geom_type not in {"LineString", "MultiLineString", "Polygon", "MultiPolygon"}:
            skipped.append(osm_id)
            continue
        geojson = mapping(geometry)
        geojson["coordinates"] = rounded(geojson["coordinates"])
        if not shape(geojson).is_valid:
            skipped.append(osm_id)
            continue
        properties = {"kind": kind, "class": classification}
        if tags.get("name"):
            properties["name"] = tags["name"]
        if tags.get("ref"):
            properties["ref"] = tags["ref"]
        features.append({"type": "Feature", "id": osm_id, "properties": properties, "geometry": geojson})
    return features, skipped


source = Path(sys.argv[1])
destination = Path(sys.argv[2])
raw = json.loads(source.read_text())
if raw.get("remark"):
    raise RuntimeError(f'Incomplete Overpass response: {raw["remark"]}')
relation_source = Path(sys.argv[3])
relations = json.loads(relation_source.read_text())
if relations.get("remark"):
    raise RuntimeError(f'Incomplete relation response: {relations["remark"]}')
replacement = {element["id"]: element for element in relations["elements"]}
raw["elements"] = [replacement.get(element["id"], element) if element["type"] == "relation" else element for element in raw["elements"]]
features, skipped = convert(raw, 8)
payload = {
    "type": "FeatureCollection",
    "bbox": [WEST, SOUTH, EAST, NORTH],
    "bounds": {"minLat": SOUTH, "maxLat": NORTH, "minLng": WEST, "maxLng": EAST},
    "coordinateOrder": "longitude,latitude",
    "attribution": "© OpenStreetMap contributors",
    "attributionUrl": "https://www.openstreetmap.org/copyright",
    "license": "ODbL-1.0",
    "licenseUrl": "https://opendatacommons.org/licenses/odbl/1-0/",
    "source": "OpenStreetMap via https://overpass-api.de/api/interpreter",
    "osmTimestamp": raw["osm3s"]["timestamp_osm_base"],
    "relationOsmTimestamp": relations["osm3s"]["timestamp_osm_base"],
    "fetchedAt": datetime.datetime.fromtimestamp(max(source.stat().st_mtime, relation_source.stat().st_mtime), datetime.timezone.utc).isoformat(),
    "rawSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "relationsSha256": hashlib.sha256(relation_source.read_bytes()).hexdigest(),
    "simplificationMeters": 8,
    "coordinateDecimals": 5,
    "features": features,
}
destination.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
print(json.dumps({"bytes": destination.stat().st_size, "features": len(features), "kinds": dict(collections.Counter(f["properties"]["kind"] for f in features)), "skipped": skipped}, indent=2))
