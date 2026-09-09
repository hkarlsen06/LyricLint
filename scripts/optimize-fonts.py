"""Regenerate shipped variable fonts, retaining the design system's 400+ weights.

Requires fontTools[woff] 4.63.0. Normal builds consume the checked-in output.
Original Fontsource 5.3.0 files are verified before processing; no glyphs are removed.
See https://fonttools.readthedocs.io/en/latest/varLib/instancer.html.
"""
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from urllib.request import urlopen

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

SOURCES = {
    "ibm-plex-sans-latin-ext-wght-normal.woff2": "d160e20920ae4d6556518d352d3af27a74e9b0de3d8fe17b1c1044fc75aa2f81",
    "ibm-plex-sans-latin-wght-normal.woff2": "e2291e842cf5af167122a22881a740c7f2dda7716f1e8cd76680264f4a859470",
    "karla-latin-ext-wght-italic.woff2": "7632f99508aa20752ff0ac6f315e9bcd38b33b2fb860d66841939c9c5c58af4d",
    "karla-latin-ext-wght-normal.woff2": "14291dd5043b30e82448f15e1e7556a740c9e89378efc91d22c6324ae229f04c",
    "karla-latin-wght-italic.woff2": "29363b0222790517ca0ba475177483ee0c0db57f9dd050d31c6acaaba8ed1530",
    "karla-latin-wght-normal.woff2": "cd614fed3fa0bf1b083d1a127a593081e2a1aa732ad61481eb12baee212c933d"
}
ROOT = Path(__file__).resolve().parents[1] / "static" / "fonts"
WEIGHTS = (400, 550, 650, 700, 750, 800)

for name, digest in SOURCES.items():
    family = "karla" if name.startswith("karla-") else "ibm-plex-sans"
    url = f"https://cdn.jsdelivr.net/npm/@fontsource-variable/{family}@5.3.0/files/{name}"
    with urlopen(url, timeout=30) as response:
        data = response.read()
    if sha256(data).hexdigest() != digest:
        raise ValueError(f"Unexpected Fontsource bytes: {name}")
    original = TTFont(BytesIO(data), recalcTimestamp=False)
    maximum = original["fvar"].axes[0].maxValue
    result = instantiateVariableFont(original, {"wght": (400, maximum)}, inplace=False)
    if result.getBestCmap() != original.getBestCmap():
        raise ValueError(f"Character coverage changed: {name}")
    # Check the actual outlines and advance widths at every design-token weight.
    for weight in WEIGHTS:
        if weight > maximum:
            continue
        before = instantiateVariableFont(original, {"wght": weight}, inplace=False)
        after = instantiateVariableFont(result, {"wght": weight}, inplace=False)
        if before["hmtx"].metrics != after["hmtx"].metrics:
            raise ValueError(f"Advance widths changed: {name} at {weight}")
        for glyph in before.getGlyphOrder():
            old_outline = before["glyf"][glyph].getCoordinates(before["glyf"])[0]
            new_outline = after["glyf"][glyph].getCoordinates(after["glyf"])[0]
            if old_outline != new_outline:
                raise ValueError(f"Outline changed: {name}, {glyph} at {weight}")
    destination = ROOT / name
    result.save(destination)
    print(
        f"{name}: {len(data):,} → {destination.stat().st_size:,} bytes; "
        "coverage and outlines verified"
    )
