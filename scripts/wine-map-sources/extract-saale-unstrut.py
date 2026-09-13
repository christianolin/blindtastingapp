# Pull the Saale-Unstrut inputs out of three states' open geobasis downloads:
# the ATKIS vineyard land-use class, and the administrative areas the product
# specification names.
#
# WHY THREE STATES. Saale-Unstrut is the only German Anbaugebiet whose
# specification crosses three Laender. Section 5 delimits it as Rebflaechen in
# five Sachsen-Anhalt Landkreisen, five Thueringen Landkreisen, the Weimar
# Ortsteile Schoendorf and Tiefurt, the kreisfreie Staedte Jena and Erfurt, and
# four Gemarkungen of Stadt Werder (Havel) in Landkreis Potsdam-Mittelmark --
# which is in BRANDENBURG, about 90 km north of everything else. Dropping that
# exclave would be a different region from the one the register protects.
#
# WHAT EACH STATE PUBLISHES, AND WHY THE SOURCES DIFFER.
#
#   ST  LVermGeo Basis-DLM, statewide shapefile download. Open data.
#   TH  TLBG Basis-DLM, published as thematic slices; only "veg" (vegetation)
#       and "geb" (Gebietseinheiten) are needed. Open data.
#   BB  LGB publishes NO open Basis-DLM. It publishes ALKIS -- the cadastre --
#       per Landkreis, which is better here, not worse: the specification names
#       GEMARKUNGEN, which are cadastral districts that Basis-DLM does not
#       carry at all, and ALKIS holds both them and the land use.
#
# THE VINEYARD KEY. In ATKIS this is AX_Landwirtschaft.vegetationsmerkmal 1040,
# Rebflaeche, the same code the Hessen and Bavaria adapters use; 1020 is
# Gruenland and returns two orders of magnitude too much. In ALKIS the same
# class surfaces as nutzart "Landwirtschaft" / bez "Rebflaeche".
#
# GEOMETRY IS NOT PARSED BY HAND. pyshp groups shapefile rings into polygons and
# holes via __geo_interface__; PostGIS parses that GeoJSON. Neither side runs a
# ring-winding heuristic written here.
#
# Usage: python scripts/wine-map-sources/extract-saale-unstrut.py
import json
import os
import sys
import zipfile

import shapefile

SRC = os.path.join(".tiles-build", "sources", "saale-unstrut")

# Sachsen-Anhalt and Thueringen are surveyed in UTM zone 32N, Brandenburg in
# 33N. Carrying the SRID per row is what lets one build mix them.
UTM32, UTM33 = 25832, 25833

REBFLAECHE = "1040"

MEMBERSHIP = os.path.join("data", "wine-map", "germany-weinbau-membership.json")

ARCHIVES = {
    "th-veg.zip": ["veg01_f"],
    "th-geb.zip": ["geb01_f"],
    "st-bdlm.zip": ["veg01_f", "geb01_f"],
    "bb-pm.zip": ["Nutzung", "KatasterBezirk"],
}
# Gemarkung 0504 is Schoendorf, 0505 is Tiefurt, four Flure each. Both belong to
# Gemeinde Weimar, which is what makes them the Ortsteile the specification
# names; a second Gemarkung 4451 is also called Schoendorf and belongs to a
# Gemeinde of that name, so the KatasterBezirk's own `gemeinde` field -- not the
# Gemarkung name -- is the test.
WEIMAR_FLURE = [f"{g}-{n:03d}" for g in ("0504", "0505") for n in range(1, 5)]
for _f in WEIMAR_FLURE:
    ARCHIVES[f"weimar-ot/{_f}.zip"] = [f"{_f}_KatasterBezirk"]


def unpack():
    for name, bases in ARCHIVES.items():
        z = os.path.join(SRC, name)
        if not os.path.exists(z):
            sys.exit(f"missing {z}; run fetch-saale-unstrut.mjs first")
        out = os.path.join(SRC, name[:-4].replace("/", os.sep))
        os.makedirs(out, exist_ok=True)
        with zipfile.ZipFile(z) as f:
            for entry in f.namelist():
                base = os.path.basename(entry)
                stem, ext = os.path.splitext(base)
                if stem in bases and ext.lower() in (".shp", ".dbf", ".shx", ".prj", ".cpg"):
                    target = os.path.join(out, base)
                    if not os.path.exists(target):
                        with open(target, "wb") as fh:
                            fh.write(f.read(entry))


def rows(rel):
    r = shapefile.Reader(os.path.join(SRC, rel), encoding="utf-8", encodingErrors="replace")
    names = [f[0] for f in r.fields[1:]]
    for sr in r.iterShapeRecords():
        yield dict(zip(names, list(sr.record))), sr.shape


def geo(shape):
    return json.dumps(shape.__geo_interface__, separators=(",", ":"))


unpack()
spec = json.load(open(MEMBERSHIP, encoding="utf-8"))["anbaugebiete"]["saale-unstrut"]

# The specification's Landkreis names, split by which state's download holds
# them. "Jena" and "Erfurt" are kreisfreie Staedte and appear in the Thueringen
# file as their own Kreis, so they need no special case.
ST_KREISE = {"Burgenlandkreis", "Harz", "Mansfeld-Südharz", "Saalekreis", "Salzlandkreis"}
TH_KREISE = {
    "Weimarer Land", "Saale-Holzland-Kreis", "Saalfeld-Rudolstadt",
    "Sömmerda", "Unstrut-Hainich-Kreis", "Jena", "Erfurt",
}
# The register writes "Werder/Havel"; the cadastre writes "Werder (Havel)".
# Same place, two house styles for the same suffix. Mapped explicitly rather
# than normalised by rule, so a future mismatch fails loudly instead of
# silently matching the wrong Gemarkung.
CADASTRE_SPELLING = {"Werder/Havel": "Werder (Havel)"}
GEMARKUNGEN = {CADASTRE_SPELLING.get(g["name"], g["name"]) for g in spec["gemarkungen"]}
# Schoendorf and Tiefurt are Ortsteile of Weimar, not Gemeinden, and Weimar as a
# whole is NOT in the region. Basis-DLM stops at the Gemeinde, so these two come
# from the cadastre instead, as Gemarkungen whose Gemeinde is Weimar.
ORTSTEILE = {o["name"] for o in spec["ortsteile"]}
ORTSTEIL_CITY = "Weimar"

named = ST_KREISE | TH_KREISE | GEMARKUNGEN | ORTSTEILE
expected = set(spec["places"]) | GEMARKUNGEN | ORTSTEILE
missing = expected - named
if missing:
    sys.exit(f"specification names places this extractor does not resolve: {sorted(missing)}")

areas, vines, seen = [], [], set()

for rel, srid, wanted in (("st-bdlm/geb01_f", UTM32, ST_KREISE),
                          ("th-geb/geb01_f", UTM32, TH_KREISE)):
    for rec, shape in rows(rel):
        if rec["OBJART_TXT"] != "AX_KommunalesGebiet":
            continue
        kreis = rec["BEZ_KRS"]
        if kreis not in wanted:
            continue
        seen.add(kreis)
        areas.append((f"KREIS:{kreis}", srid, geo(shape)))

for rel, srid, veg in (("st-bdlm/veg01_f", UTM32, "VEG"), ("th-veg/veg01_f", UTM32, "VEG")):
    for rec, shape in rows(rel):
        if rec[veg] == REBFLAECHE:
            vines.append((srid, geo(shape)))

for flur in WEIMAR_FLURE:
    for rec, shape in rows(f"weimar-ot/{flur}/{flur}_KatasterBezirk"):
        if rec["art"] != "Gemarkung":
            continue
        if rec["gemeinde"] != ORTSTEIL_CITY:
            sys.exit(f"{flur}: Gemarkung {rec['name']} belongs to {rec['gemeinde']}, "
                     f"not {ORTSTEIL_CITY} -- wrong Gemarkung number")
        if rec["name"] not in ORTSTEILE:
            sys.exit(f"{flur}: unexpected Gemarkung {rec['name']}")
        seen.add(rec["name"])
        areas.append((f"ORTSTEIL:{rec['name']}", UTM32, geo(shape)))

for rec, shape in rows("bb-pm/KatasterBezirk"):
    if rec["art"] == "Gemarkung" and rec["name"] in GEMARKUNGEN:
        seen.add(rec["name"])
        areas.append((f"GEMARKUNG:{rec['name']}", UTM33, geo(shape)))

for rec, shape in rows("bb-pm/Nutzung"):
    if rec["nutzart"] == "Landwirtschaft" and rec["bez"] == "Rebfläche":
        vines.append((UTM33, geo(shape)))

unresolved = named - seen
if unresolved:
    sys.exit(f"named in the specification but not found in the downloads: {sorted(unresolved)}")

with open(os.path.join(SRC, "areas.tsv"), "w", encoding="utf-8", newline="\n") as fh:
    for key, srid, gj in areas:
        fh.write(f"{key}\t{srid}\t{gj}\n")
with open(os.path.join(SRC, "rebflaeche.tsv"), "w", encoding="utf-8", newline="\n") as fh:
    for srid, gj in vines:
        fh.write(f"{srid}\t{gj}\n")

by_key = {}
for key, _, _ in areas:
    by_key[key] = by_key.get(key, 0) + 1
print(f"areas: {len(areas)} polygons over {len(by_key)} named units")
for key in sorted(by_key):
    print(f"  {key:44} {by_key[key]:4}")
print(f"Rebflaeche parcels: {len(vines)}")
