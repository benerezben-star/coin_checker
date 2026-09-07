"""Microscope image enhancement.

These filters do not detect anything. They make raised metal, notching, and
die cracks easier for *you* to see under the scope. The eye stays in charge --
that is deliberate, because no filter can reliably tell a doubled die from
machine doubling, and a confident wrong answer is worse than no answer.
"""

from pathlib import Path

from PIL import Image, ImageFilter, ImageOps

FILTERS = {
    "original": {
        "label": "Original",
        "help": "Untouched, as captured.",
    },
    "autocontrast": {
        "label": "Auto contrast",
        "help": "Stretches the tonal range. First thing to try on a flat, "
                "grey microscope capture.",
    },
    "equalize": {
        "label": "Histogram equalize",
        "help": "Aggressively flattens the histogram. Ugly, but it drags detail "
                "out of shadowed recesses and dark toning.",
    },
    "gray": {
        "label": "Grayscale",
        "help": "Removes colour. Copper tone can disguise shape -- stripping it "
                "makes doubling and notching easier to judge.",
    },
    "sharpen": {
        "label": "Unsharp mask",
        "help": "Boosts local edge contrast. Good for split serifs and the "
                "notched corners of a true doubled die.",
    },
    "edges": {
        "label": "Edge detection",
        "help": "Outlines only. Doubled devices show as two distinct closed "
                "outlines; machine doubling usually collapses into one smear.",
    },
    "relief": {
        "label": "Relief / emboss",
        "help": "The most useful filter for error work. Exaggerates whether "
                "something is RAISED (a die crack or cud, so a mint error) or "
                "INCUSE (a dent or scratch, so post-mint damage).",
    },
    "invert": {
        "label": "Invert",
        "help": "Flips light and dark. Sometimes a weak mint mark under a "
                "repunch reads far better inverted.",
    },
}


def apply_filter(src_path, name):
    img = Image.open(src_path)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    if name == "original":
        return img
    if name == "autocontrast":
        return ImageOps.autocontrast(img, cutoff=1)
    if name == "equalize":
        return ImageOps.equalize(img)
    if name == "gray":
        return img.convert("L")
    if name == "sharpen":
        return img.filter(ImageFilter.UnsharpMask(radius=3, percent=200, threshold=3))
    if name == "edges":
        return img.convert("L").filter(ImageFilter.FIND_EDGES)
    if name == "relief":
        return ImageOps.autocontrast(img.convert("L").filter(ImageFilter.EMBOSS))
    if name == "invert":
        return ImageOps.invert(img.convert("RGB"))

    raise ValueError(f"unknown filter: {name}")


def render(src_path, name, cache_dir):
    """Apply a filter, caching the result next to the original."""
    src_path = Path(src_path)
    if name == "original":
        return src_path

    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    out = cache_dir / f"{src_path.stem}__{name}.png"

    if not out.exists() or out.stat().st_mtime < src_path.stat().st_mtime:
        apply_filter(src_path, name).save(out)
    return out


def make_thumbnail(src_path, dest_path, size=400):
    img = Image.open(src_path)
    img.thumbnail((size, size))
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    Path(dest_path).parent.mkdir(parents=True, exist_ok=True)
    img.save(dest_path, "JPEG", quality=85)
