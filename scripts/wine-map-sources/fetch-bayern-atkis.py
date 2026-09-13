"""Stream Bavaria's ATKIS Basis-DLM GeoPackage out of its open-data archive.

Bavaria publishes ATKIS Basis-DLM statewide only -- no tiles, no bbox WFS --
in three formats. Choosing between them is not a matter of taste:

    NAS 7.1.2 (2.0 GB zip)    Deflate64. Python's zipfile knows the method name
    BKG Shape (1.34 GB zip)   and refuses it; the PyPI shim has no wheel for
                              Python 3.14 and needs a C toolchain; and Windows'
                              bundled bsdtar/libarchive reports
                              "Unsupported ZIP compression method (9)" and
                              writes the right number of ZERO bytes, which is
                              worse than failing. Both are unreadable here.

    GeoPackage (1.86 GB zip)  Plain DEFLATE. Python reads it, and a GeoPackage
                              is just SQLite: the layers can be queried with the
                              standard library, and geometry comes out as WKB
                              that PostGIS ingests directly. No GDAL, no
                              shapefile parser, no third-party reader.

So the format that looked like the awkward one is the only one that works
unattended, and the zip is streamed member-by-member rather than saved: 1.86 GB
crosses the wire, 5.5 GB lands on disk, and no intermediate archive is kept.

Licence CC BY 4.0, open since 2023, no registration.
Attribution: "Datenquelle: Bayerische Vermessungsverwaltung - www.geodaten.bayern.de"

Usage: python scripts/wine-map-sources/fetch-bayern-atkis.py [--refresh]
"""
import io
import json
import os
import sys
import urllib.request
import zipfile
from datetime import date

URL = "https://geodaten.bayern.de/odd/m/2/basisdlm/plus/by_basisdlm_plus.zip"
MEMBER = "by_basisdlm_plus.gpkg"
OUT = os.path.join(".tiles-build", "sources", "bayern")
ATTRIBUTION = "Datenquelle: Bayerische Vermessungsverwaltung - www.geodaten.bayern.de"
LICENCE = "CC BY 4.0"
REFRESH = "--refresh" in sys.argv


class HttpRangeFile(io.RawIOBase):
    """Seekable file over HTTP range requests. A zip keeps its central directory
    at the END, so this lets zipfile read the index in a few KB and then stream
    one member, instead of downloading an archive to reach part of it."""

    def __init__(self, url):
        self.url = url
        self.pos = 0
        self.fetched = 0
        with urllib.request.urlopen(
            urllib.request.Request(url, method="HEAD"), timeout=60
        ) as r:
            self.size = int(r.headers["Content-Length"])

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, off, whence=0):
        self.pos = (
            off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        )
        return self.pos

    def read(self, n=-1):
        if n < 0:
            n = self.size - self.pos
        if n == 0:
            return b""
        end = min(self.pos + n, self.size) - 1
        req = urllib.request.Request(self.url, headers={"Range": f"bytes={self.pos}-{end}"})
        with urllib.request.urlopen(req, timeout=900) as r:
            data = r.read()
        self.pos += len(data)
        self.fetched += len(data)
        return data


def main():
    os.makedirs(OUT, exist_ok=True)
    target = os.path.join(OUT, MEMBER)
    if os.path.exists(target) and not REFRESH:
        print(f"{target} already present ({os.path.getsize(target)/1e9:.2f} GB)")
        return

    src = HttpRangeFile(URL)
    z = zipfile.ZipFile(src)
    info = z.getinfo(MEMBER)
    print(f"archive {src.size/1e9:.2f} GB; {MEMBER} is "
          f"{info.file_size/1e9:.2f} GB ({info.compress_size/1e9:.2f} GB compressed)")

    written = 0
    with z.open(MEMBER) as fh, open(target, "wb") as out:
        while True:
            chunk = fh.read(1 << 23)
            if not chunk:
                break
            out.write(chunk)
            written += len(chunk)
            if written % (500 << 20) < (1 << 23):
                print(f"    {written/1e9:5.2f} GB written", flush=True)
    print(f"  {written/1e9:.2f} GB written, {src.fetched/1e9:.2f} GB transferred")

    with open(os.path.join(OUT, "provenance.json"), "w", encoding="utf-8") as fh:
        json.dump({
            "source": URL,
            "member": MEMBER,
            "attribution": ATTRIBUTION,
            "licence": LICENCE,
            "crs": "EPSG:25832",
            "vegetationsmerkmal": {"1040": "Rebflaeche"},
            "note": "GeoPackage chosen over NAS and Shape because those archives use "
                    "Deflate64, which no reader available here can decompress.",
            "retrieved": date.today().isoformat(),
        }, fh, indent=2)
    print(f"wrote {os.path.join(OUT, 'provenance.json')}")


if __name__ == "__main__":
    main()
