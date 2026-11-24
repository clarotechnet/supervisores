"""Build the small, offline VT map asset from public IBGE shapefiles (see docs/vt-revisitas.md)."""

import argparse
import io
import json
import zipfile
from pathlib import Path

import shapefile
from shapely.geometry import shape


SCOPE = {
    "fortaleza": ("CE", {"2304400"}, {
        "Fortaleza", "Aquiraz", "Caucaia", "Eusébio", "Itaitinga", "Maracanaú",
        "Maranguape", "Pacatuba",
    }),
    "natal": ("RN", {"2408102", "2403251"}, {
        "Natal", "Parnamirim", "Extremoz", "São Gonçalo do Amarante",
        "Macaíba", "São José de Mipibu", "Nísia Floresta",
    }),
}


def reader(archive):
    with zipfile.ZipFile(archive) as data:
        stem = next(file[:-4] for file in data.namelist() if file.lower().endswith(".shp"))
        cpg = stem + ".cpg"
        codec = data.read(cpg).decode("ascii").strip() if cpg in data.namelist() else "utf-8"
        if codec.isnumeric():
            codec = "cp" + codec
        return shapefile.Reader(
            shp=io.BytesIO(data.read(stem + ".shp")),
            shx=io.BytesIO(data.read(stem + ".shx")),
            dbf=io.BytesIO(data.read(stem + ".dbf")),
            encoding=codec,
        )


def coords(point, precision):
    return [round(value, precision) for value in point[:2]]


def polygons(geometry):
    return geometry.geoms if geometry.geom_type == "MultiPolygon" else [geometry]


def middle(geometry):
    largest = max(polygons(geometry), key=lambda polygon: polygon.area)
    point = largest.centroid
    return coords((point if largest.covers(point) else largest.representative_point()).coords[0], 5)


def outline(geometry, tolerance=0.0006):
    geometry = geometry.simplify(tolerance, preserve_topology=True)
    return [
        [coords(coord, 5) for coord in ring.coords]
        for polygon in polygons(geometry)
        for ring in [polygon.exterior, *polygon.interiors]
    ]


def build(folder):
    neighborhoods = {}
    refs = set().union(*(ids for _, ids, _ in SCOPE.values()))
    with reader(folder / "BR_bairros_CD2022.zip") as data:
        # Avoid reading geometries for all Brazilian neighborhoods.
        for record in data.iterRecords():
            city = str(record["CD_MUN"])
            if city in refs:
                geometry = shape(data.shape(record.oid).__geo_interface__)
                neighborhoods.setdefault(city, []).append([record["NM_BAIRRO"], *middle(geometry)])

    result = {}
    for region, (state, ids, cities) in SCOPE.items():
        maps = []
        with reader(folder / f"{state}_Municipios_2024.zip") as data:
            for record in data.iterRecords():
                name = record["NM_MUN"]
                if name not in cities:
                    continue
                code = str(record["CD_MUN"])
                geometry = shape(data.shape(record.oid).__geo_interface__)
                maps.append({
                    "name": name,
                    "main": code in ids,
                    "point": middle(geometry),
                    "rings": outline(geometry),
                    "neighborhoods": sorted(neighborhoods.get(code, [])),
                })
        if {area["name"] for area in maps} != cities or any(
            area["main"] and not area["neighborhoods"] for area in maps
        ):
            raise ValueError(f"Missing data from IBGE for {region}")
        with reader(folder / f"{state}_UF_2024.zip") as data:
            land = outline(shape(data.shape(0).__geo_interface__), 0.0014)
        result[region] = {
            "land": land,
            "cities": sorted(maps, key=lambda area: (not area["main"], area["name"])),
        }
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archives", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    # One line per municipality keeps diffs manageable without padding every vertex.
    records = []
    for region, area in build(args.archives).items():
        rows = ",\n".join("      " + json.dumps(city, ensure_ascii=False, separators=(",", ":"))
                          for city in area["cities"])
        land = json.dumps(area["land"], separators=(",", ":"))
        records.append(f'  "{region}": {{\n    "land": {land},\n    "cities": [\n{rows}\n    ]\n  }}')
    args.output.write_text("{\n" + ",\n".join(records) + "\n}\n", encoding="utf-8")
