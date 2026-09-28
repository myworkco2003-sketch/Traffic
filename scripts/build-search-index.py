import gzip
import json
import math
import sqlite3
from pathlib import Path

import mapbox_vector_tile


# ============================================================
# Paths
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parent.parent

MBTILES_PATH = PROJECT_ROOT / "assets" / "damascus.mbtiles"
OUTPUT_PATH = PROJECT_ROOT / "assets" / "search-index.json"


# ============================================================
# Configuration
# ============================================================

SEARCH_LAYERS = {
    "poi",
    "place",
    "aerodrome_label",
    "mountain_peak",
}

# نستخدم zoom عالي للحصول على أكبر قدر ممكن من التفاصيل
MIN_ZOOM = 12
MAX_ZOOM = 14

EXTENT = 4096


# ============================================================
# Coordinate conversion
# ============================================================

def tile_local_to_lonlat(x_local, y_local, tile_x, tile_y, zoom):
    """
    Convert vector-tile local coordinates to longitude/latitude.
    """

    n = 2 ** zoom

    world_x = (tile_x + (x_local / EXTENT)) / n
    world_y = (tile_y + (y_local / EXTENT)) / n

    longitude = world_x * 360.0 - 180.0

    latitude = math.degrees(
        math.atan(
            math.sinh(
                math.pi * (1 - 2 * world_y)
            )
        )
    )

    return longitude, latitude


# ============================================================
# Geometry helpers
# ============================================================

def collect_coordinates(geometry):
    """
    Recursively collect [x, y] coordinates from decoded geometry.
    """

    coordinates = geometry.get("coordinates")

    if coordinates is None:
        return []

    result = []

    def walk(value):
        if (
            isinstance(value, list)
            and len(value) >= 2
            and isinstance(value[0], (int, float))
            and isinstance(value[1], (int, float))
        ):
            result.append((value[0], value[1]))
            return

        if isinstance(value, list):
            for item in value:
                walk(item)

    walk(coordinates)

    return result


def geometry_to_point(feature, tile_x, tile_y, zoom):
    """
    Get an approximate representative point for a feature.
    """

    geometry = feature.get("geometry")

    if not geometry:
        return None

    coordinates = collect_coordinates(geometry)

    if not coordinates:
        return None

    # متوسط الإحداثيات المحلية داخل الـ tile
    avg_x = sum(x for x, _ in coordinates) / len(coordinates)
    avg_y = sum(y for _, y in coordinates) / len(coordinates)

    return tile_local_to_lonlat(
        avg_x,
        avg_y,
        tile_x,
        tile_y,
        zoom,
    )


# ============================================================
# Name handling
# ============================================================

def get_name(properties):
    """
    Prefer Arabic name, then normal name, then English.
    """

    name_ar = (
        properties.get("name:ar")
        or properties.get("name_ar")
        or properties.get("name")
    )

    name_en = (
        properties.get("name:en")
        or properties.get("name_en")
        or properties.get("name_int")
    )

    if not name_ar and not name_en:
        return None, None

    return name_ar or name_en, name_en


def get_kind(layer_name, properties):
    """
    Human-readable category.
    """

    if layer_name == "poi":
        return "poi"

    if layer_name == "place":
        return "place"

    if layer_name == "aerodrome_label":
        return "airport"

    if layer_name == "mountain_peak":
        return "landmark"

    return layer_name


# ============================================================
# Deduplication
# ============================================================

def make_key(name, longitude, latitude):
    """
    Create a stable approximate key.

    Rounding avoids duplicate entries caused by the same feature
    appearing in multiple zoom levels / tiles.
    """

    return (
        name.strip().lower(),
        round(longitude, 5),
        round(latitude, 5),
    )


# ============================================================
# Main
# ============================================================

def main():

    if not MBTILES_PATH.exists():
        raise FileNotFoundError(
            f"MBTiles file not found:\n{MBTILES_PATH}"
        )

    print("=" * 70)
    print("Building local search index")
    print("=" * 70)

    print(f"MBTiles : {MBTILES_PATH}")
    print(f"Output  : {OUTPUT_PATH}")
    print()

    connection = sqlite3.connect(str(MBTILES_PATH))
    cursor = connection.cursor()

    entries = {}
    tile_count = 0
    feature_count = 0

    # --------------------------------------------------------
    # Read tiles
    # --------------------------------------------------------

    for zoom in range(MIN_ZOOM, MAX_ZOOM + 1):

        print(f"Scanning zoom {zoom}...")

        cursor.execute(
            """
            SELECT tile_column, tile_row, tile_data
            FROM tiles
            WHERE zoom_level = ?
            """,
            (zoom,),
        )

        rows = cursor.fetchall()

        print(f"  Tiles: {len(rows)}")

        for tile_x, tile_row_tms, tile_data in rows:

            tile_count += 1

            # MBTiles uses TMS Y.
            # Vector tiles use XYZ Y.
            tile_y = (2 ** zoom - 1) - tile_row_tms

            try:
                decompressed = gzip.decompress(tile_data)
            except gzip.BadGzipFile:
                # بعض الملفات قد تكون غير مضغوطة
                decompressed = tile_data

            try:
                decoded = mapbox_vector_tile.decode(decompressed)
            except Exception as exc:
                print(
                    f"  Warning: failed decoding tile "
                    f"z={zoom}, x={tile_x}, y={tile_y}: {exc}"
                )
                continue

            for layer_name in SEARCH_LAYERS:

                layer = decoded.get(layer_name)

                if not layer:
                    continue

                features = layer.get("features", [])

                for feature in features:

                    feature_count += 1

                    properties = feature.get("properties", {})

                    name, name_en = get_name(properties)

                    if not name:
                        continue

                    point = geometry_to_point(
                        feature,
                        tile_x,
                        tile_y,
                        zoom,
                    )

                    if point is None:
                        continue

                    longitude, latitude = point

                    # Damascus bounds
                    if not (
                        35.841 <= longitude <= 36.73
                        and
                        33.112 <= latitude <= 33.805
                    ):
                        continue

                    kind = get_kind(
                        layer_name,
                        properties,
                    )

                    key = make_key(
                        name,
                        longitude,
                        latitude,
                    )

                    if key not in entries:

                        entries[key] = {
                            "name": name,
                            "nameAr": properties.get("name:ar"),
                            "nameEn": name_en,
                            "kind": kind,
                            "longitude": round(longitude, 7),
                            "latitude": round(latitude, 7),
                        }

    connection.close()

    # --------------------------------------------------------
    # Sort
    # --------------------------------------------------------

    result = list(entries.values())

    result.sort(
        key=lambda item: (
            item["name"] or ""
        )
    )

    # --------------------------------------------------------
    # Save
    # --------------------------------------------------------

    OUTPUT_PATH.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with open(
        OUTPUT_PATH,
        "w",
        encoding="utf-8",
    ) as file:

        json.dump(
            result,
            file,
            ensure_ascii=False,
            indent=2,
        )

    print()
    print("=" * 70)
    print("DONE")
    print("=" * 70)
    print(f"Tiles scanned   : {tile_count}")
    print(f"Features scanned: {feature_count}")
    print(f"Search entries  : {len(result)}")
    print()
    print(f"Created:")
    print(OUTPUT_PATH)
    print("=" * 70)


if __name__ == "__main__":
    main()