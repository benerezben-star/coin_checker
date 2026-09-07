// Microscope image enhancement, done on a canvas.
//
// Ported from app/imaging.py, which used Pillow. Same eight filters, same
// intent: these do not detect anything. They make raised metal, notching, and
// die cracks easier for *you* to see. No filter can reliably separate a
// doubled die from machine doubling, and a confident wrong answer is worse
// than no answer.

export const FILTERS = {
  original: { label: "Original", help: "Untouched, as captured." },
  autocontrast: {
    label: "Auto contrast",
    help: "Stretches the tonal range. First thing to try on a flat, grey microscope capture.",
  },
  equalize: {
    label: "Histogram equalize",
    help: "Aggressively flattens the histogram. Ugly, but it drags detail out of shadowed recesses and dark toning.",
  },
  gray: {
    label: "Grayscale",
    help: "Removes colour. Copper tone can disguise shape -- stripping it makes doubling and notching easier to judge.",
  },
  sharpen: {
    label: "Unsharp mask",
    help: "Boosts local edge contrast. Good for split serifs and the notched corners of a true doubled die.",
  },
  edges: {
    label: "Edge detection",
    help: "Outlines only. Doubled devices show as two distinct closed outlines; machine doubling usually collapses into one smear.",
  },
  relief: {
    label: "Relief / emboss",
    help: "The most useful filter for error work. Exaggerates whether something is RAISED (a die crack or cud, so a mint error) or INCUSE (a dent or scratch, so post-mint damage).",
  },
  invert: {
    label: "Invert",
    help: "Flips light and dark. Sometimes a weak mint mark under a repunch reads far better inverted.",
  },
};

function toGray(d) {
  for (let i = 0; i < d.length; i += 4) {
    // Rec. 601 luma, matching Pillow's "L" conversion.
    const y = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    d[i] = d[i + 1] = d[i + 2] = y;
  }
}

function autocontrast(d, cutoff = 1) {
  for (let c = 0; c < 3; c++) {
    const hist = new Uint32Array(256);
    let n = 0;
    for (let i = c; i < d.length; i += 4) {
      hist[d[i]]++;
      n++;
    }
    // Discard the darkest and brightest `cutoff` percent before stretching, so
    // a few stray specular pixels can't flatten the whole image.
    const drop = Math.floor((n * cutoff) / 100);
    let lo = 0, hi = 255, seen = 0;
    for (let v = 0; v < 256; v++) {
      seen += hist[v];
      if (seen > drop) { lo = v; break; }
    }
    seen = 0;
    for (let v = 255; v >= 0; v--) {
      seen += hist[v];
      if (seen > drop) { hi = v; break; }
    }
    if (hi <= lo) continue;
    const scale = 255 / (hi - lo);
    for (let i = c; i < d.length; i += 4) {
      d[i] = Math.max(0, Math.min(255, (d[i] - lo) * scale));
    }
  }
}

function equalize(d) {
  for (let c = 0; c < 3; c++) {
    const hist = new Uint32Array(256);
    let n = 0;
    for (let i = c; i < d.length; i += 4) {
      hist[d[i]]++;
      n++;
    }
    const lut = new Uint8Array(256);
    let cum = 0;
    for (let v = 0; v < 256; v++) {
      cum += hist[v];
      lut[v] = Math.round((cum * 255) / n);
    }
    for (let i = c; i < d.length; i += 4) d[i] = lut[d[i]];
  }
}

/** 3x3 convolution. `divisor`/`offset` mirror Pillow's kernel conventions. */
function convolve(src, w, h, kernel, divisor = 1, offset = 0) {
  const out = new Uint8ClampedArray(src.length);
  const k = kernel;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        // Leave the 1px border as-is rather than inventing edge pixels.
        out[o] = src[o]; out[o + 1] = src[o + 1]; out[o + 2] = src[o + 2];
        out[o + 3] = src[o + 3];
        continue;
      }
      for (let c = 0; c < 3; c++) {
        let sum = 0, ki = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            sum += src[((y + dy) * w + (x + dx)) * 4 + c] * k[ki++];
          }
        }
        out[o + c] = sum / divisor + offset;
      }
      out[o + 3] = src[o + 3];
    }
  }
  return out;
}

function unsharp(src, w, h, amount = 2.0) {
  // Blur with a 3x3 box, then push each pixel away from its blurred version.
  const blurred = convolve(src, w, h, [1, 1, 1, 1, 1, 1, 1, 1, 1], 9);
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      out[i + c] = src[i + c] + amount * (src[i + c] - blurred[i + c]);
    }
    out[i + 3] = src[i + 3];
  }
  return out;
}

/** Apply a named filter to an ImageData, returning new ImageData. */
export function applyFilter(imageData, name) {
  const { width: w, height: h } = imageData;
  let d = new Uint8ClampedArray(imageData.data);

  switch (name) {
    case "original":
      break;
    case "gray":
      toGray(d);
      break;
    case "invert":
      for (let i = 0; i < d.length; i += 4) {
        d[i] = 255 - d[i];
        d[i + 1] = 255 - d[i + 1];
        d[i + 2] = 255 - d[i + 2];
      }
      break;
    case "autocontrast":
      autocontrast(d);
      break;
    case "equalize":
      equalize(d);
      break;
    case "sharpen":
      d = unsharp(d, w, h);
      break;
    case "edges":
      toGray(d);
      d = convolve(d, w, h, [-1, -1, -1, -1, 8, -1, -1, -1, -1]);
      break;
    case "relief":
      toGray(d);
      d = convolve(d, w, h, [-1, 0, 0, 0, 1, 0, 0, 0, 0], 1, 128);
      autocontrast(d);
      break;
    default:
      throw new Error(`unknown filter: ${name}`);
  }
  return new ImageData(d, w, h);
}

/** Decode a blob, cap its size, and return a canvas ready to filter. */
export async function blobToCanvas(blob, maxSide = 1400) {
  const bitmap = await createImageBitmap(blob);
  let { width, height } = bitmap;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas;
}

const _cache = new Map();

/** Filtered image as an object URL, cached per photo+filter. */
export async function renderFiltered(photoId, blob, name) {
  const key = `${photoId}:${name}`;
  if (_cache.has(key)) return _cache.get(key);

  const canvas = await blobToCanvas(blob);
  if (name !== "original") {
    const ctx = canvas.getContext("2d");
    const out = applyFilter(
      ctx.getImageData(0, 0, canvas.width, canvas.height),
      name
    );
    ctx.putImageData(out, 0, 0);
  }
  const url = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(URL.createObjectURL(b)), "image/png")
  );
  _cache.set(key, url);
  return url;
}

export function clearCache(photoId = null) {
  for (const [key, url] of [..._cache]) {
    if (photoId == null || key.startsWith(`${photoId}:`)) {
      URL.revokeObjectURL(url);
      _cache.delete(key);
    }
  }
}

/** Downscaled JPEG for list thumbnails. */
export async function makeThumbnail(blob, size = 400) {
  const canvas = await blobToCanvas(blob, size);
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85)
  );
}
