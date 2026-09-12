"""Resolve Franken's Gemeinden against Bavarian ATKIS and dump the geometry the
build step needs, as WKB hex.

Two jobs, both of which have to fail closed:

  1. Resolve the 138 Gemeinden the product specification names to ATKIS
     municipalities. German place names are written differently in a legal text
     and a survey register -- "Sand a. Main" against "Sand a.Main", "Üttingen"
     against "Uettingen", "Viereth" against the merged "Viereth-Trunstadt" --
     so the matcher tries a bounded set of documented variants and nothing
     fuzzier. Anything still unmatched is REPORTED, never dropped: a Gemeinde
     that silently disappears shrinks the region with no other symptom.

  2. Pull the Rebflaeche parcels. The GeoPackage stores the land-use class as a
     decoded label rather than a numeric code, so there is no codelist to
     misread -- the Hessen build took 1020 for vineyard when it means Gruenland
     and produced 135 763 "vineyards" for a state with 3 600 ha.

Output is WKB hex, which PostGIS ingests directly, so no geometry passes
through a hand-written parser.

Usage: python scripts/wine-map-sources/extract-bayern-weinbau.py
"""
import json
import os
import sqlite3
import sys
import unicodedata

GPKG = os.path.join(".tiles-build", "sources", "bayern", "by_basisdlm_plus.gpkg")
MEMBERSHIP = os.path.join("data", "wine-map", "germany-weinbau-membership.json")
OUT = os.path.join(".tiles-build", "sources", "bayern")
REGION = "franken"


def strip_accents(s):
    s = unicodedata.normalize("NFD", s or "")
    return "".join(c for c in s if not unicodedata.combining(c))


def variants(name):
    """The documented ways the same Gemeinde is written in the two sources."""
    out = {name}
    # "a. Main" / "a.Main" / "am Main"; likewise an der, bei, im.
    for a, b in ((" a. ", " am "), (" a. ", " a."), (" a.d. ", " an der "),
                 (" a. d. ", " an der "), (" b. ", " bei "), (" i. ", " im "),
                 (" i.d. ", " in der ")):
        out |= {v.replace(a, b) for v in list(out) if a in v}
    # Regierungsbezirk suffixes the register does not carry.
    out |= {v.rsplit(" i. UFr", 1)[0].rsplit(" i. OFr", 1)[0].strip() for v in list(out)}
    return {v for v in out if v}


def keys(name):
    """Comparison keys: umlauts collapse two ways and the register picks one.

    ß expands to BOTH ss and s. Usually it is ss, but the Main-Spessart
    municipality the specification spells "Haßloch" is "Hasloch" in the survey
    register -- one s, and the only one of the 138 that the ss rule alone
    missed. Emitting both is safe because a match must still be UNIQUE: an
    extra key that collides simply makes the name ambiguous and reportable
    rather than silently wrong."""
    out = set()
    for v in variants(name):
        for sharp in ("ss", "s"):
            low = v.lower().replace("ß", sharp)
            expanded = low.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue")
            for form in (strip_accents(low), expanded):
                out.add("".join(ch for ch in form if ch.isalnum()))
    return out


def main():
    membership = json.load(open(MEMBERSHIP, encoding="utf-8"))
    region = membership["anbaugebiete"][REGION]
    wanted, in_kreis = region["places"], region.get("in_kreis", {})

    db = sqlite3.connect(GPKG)
    gem = list(db.execute(
        "select GKZ_gemeindekennzeichen, BEZ_bezeichnung from F_75003_KommunalesGebiet"
        " where BEZ_bezeichnung is not null"))
    by_key = {}
    for gkz, bez in gem:
        for k in keys(bez):
            by_key.setdefault(k, set()).add((gkz, bez))

    # Kreis -> the Gemeinde keys inside it, for disambiguation. Bavaria has two
    # Adelshofens and two Holzkirchens and the specification says which is meant.
    kreis_of = {}
    for krs, name in db.execute(
            "select KRS_kreis, BEZ_bezeichnung from F_75007_Gebiet_Kreis"
            " where BEZ_bezeichnung is not null"):
        kreis_of[krs] = name

    resolved, unresolved = {}, []
    for place in wanted:
        hits = set()
        for k in keys(place):
            hits |= by_key.get(k, set())
        if len(hits) > 1:
            want_kreis = (in_kreis.get(place) or "").replace("Landkreis", "").strip().lower()
            narrowed = {h for h in hits
                        if want_kreis and want_kreis in (kreis_of.get(h[0][:5], "") or "").lower()}
            if len(narrowed) == 1:
                hits = narrowed
        if not hits:
            # A merged municipality keeps the old name as its first component:
            # the specification's "Viereth" is today's "Viereth-Trunstadt".
            prefix_hits = {(g, b) for g, b in gem
                           for k in keys(place)
                           if "".join(ch for ch in strip_accents(b.lower().replace("ß", "ss"))
                                      if ch.isalnum()).startswith(k) and len(k) >= 5}
            hits = prefix_hits if len(prefix_hits) == 1 else set()
        if len(hits) == 1:
            gkz, bez = hits.pop()
            resolved[place] = {"gkz": gkz, "atkis_name": bez}
        else:
            unresolved.append({"place": place, "candidates": sorted(b for _, b in hits)})

    print(f"{REGION}: {len(wanted)} named, {len(resolved)} resolved, {len(unresolved)} unresolved")
    for u in unresolved:
        print(f"   {u['place']:28s} {u['candidates'] or '(no candidate)'}")

    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, f"{REGION}-gemeinden.tsv"), "w", encoding="utf-8") as fh:
        gkzs = {v["gkz"] for v in resolved.values()}
        n = 0
        for gkz, blob in db.execute(
                "select GKZ_gemeindekennzeichen, geom from F_75003_KommunalesGebiet"):
            if gkz in gkzs and blob:
                fh.write(f"{gkz}\t{gpb_to_wkb_hex(blob)}\n")
                n += 1
        print(f"   wrote {n} Gemeinde polygons")

    with open(os.path.join(OUT, "rebflaeche.wkb"), "w", encoding="utf-8") as fh:
        n = 0
        for (blob,) in db.execute(
                "select geom from F_43001_Landwirtschaft"
                " where VEG_vegetationsmerkmal = 'Rebfläche'"):
            if blob:
                fh.write(gpb_to_wkb_hex(blob) + "\n")
                n += 1
        print(f"   wrote {n} Rebflaeche parcels")

    json.dump({"resolved": resolved, "unresolved": unresolved},
              open(os.path.join(OUT, f"{REGION}-resolution.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    if unresolved:
        print("\nUnresolved Gemeinden are NOT silently dropped -- resolve them before building.")
        sys.exit(1)


def gpb_to_wkb_hex(blob):
    """Strip the GeoPackage binary header, leaving standard WKB.

    Header: 'GP', version, flags, srs_id (4), then an envelope whose size the
    flags' bits 1-3 encode. Assuming a fixed header length silently truncates
    the geometry of every row that carries an envelope."""
    flags = blob[3]
    env = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}[(flags >> 1) & 0x07]
    return blob[8 + env:].hex()


if __name__ == "__main__":
    main()
