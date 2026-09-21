#!/usr/bin/env python3
"""Generate NexaDesk app icons (SVG master + PNG sizes) with pure Pillow."""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "icons")
os.makedirs(OUT, exist_ok=True)

# Brand colours
C1 = (124, 108, 255)   # violet
C2 = (51, 184, 163)    # teal


def gradient(w, h, c1, c2, diagonal=True):
    """Linear gradient image (diagonal 135deg)."""
    img = Image.new("RGBA", (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = ((x / max(1, w - 1)) + (y / max(1, h - 1))) / 2 if diagonal else x / max(1, w - 1)
            r = int(c1[0] + (c2[0] - c1[0]) * t)
            g = int(c1[1] + (c2[1] - c1[1]) * t)
            b = int(c1[2] + (c2[2] - c1[2]) * t)
            px[x, y] = (r, g, b, 255)
    return img


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def draw_N(size, stroke_ratio=0.082, pad_ratio=0.30, color=(255, 255, 255, 255), ss=4):
    """Draw the stylised N glyph at high resolution then downsample (antialiasing)."""
    S = size * ss
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    pad = S * pad_ratio
    sw = S * stroke_ratio
    x0, y0, x1, y1 = pad, pad, S - pad, S - pad
    # left vertical
    d.rounded_rectangle([x0, y0, x0 + sw, y1], radius=sw / 2, fill=color)
    # right vertical
    d.rounded_rectangle([x1 - sw, y0, x1, y1], radius=sw / 2, fill=color)
    # diagonal
    d.line([x0 + sw / 2, y0 + sw / 2, x1 - sw / 2, y1 - sw / 2], fill=color, width=int(sw))
    # round the diagonal caps
    r = sw / 2
    d.ellipse([x0, y0, x0 + sw, y0 + sw], fill=color)
    d.ellipse([x1 - sw, y1 - sw, x1, y1], fill=color)
    return layer.resize((size, size), Image.LANCZOS)


def make_icon(size, radius_ratio=0.245, ss=4):
    S = size * ss
    grad = gradient(S, S, C1, C2)
    mask = rounded_mask(S, int(S * radius_ratio))
    icon = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    icon.paste(grad, (0, 0), mask)
    # subtle inner highlight
    hl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl)
    hd.rounded_rectangle([S * 0.04, S * 0.04, S * 0.96, S * 0.52], radius=int(S * radius_ratio * 0.9),
                         fill=(255, 255, 255, 26))
    icon.alpha_composite(hl)
    icon = Image.composite(icon, Image.new("RGBA", (S, S), (0, 0, 0, 0)), mask)
    # glyph
    icon.alpha_composite(draw_N(S, ss=1))
    return icon.resize((size, size), Image.LANCZOS)


# ---- PNGs ----
for s in (16, 24, 32, 48, 64, 128, 256, 512, 1024):
    make_icon(s).save(os.path.join(OUT, f"icon-{s}.png"))
    print("  wrote icon-%d.png" % s)

make_icon(256).save(os.path.join(OUT, "icon.png"))
print("  wrote icon.png (256)")

# tray icon: monochrome-ish, simple, works as a template image on macOS
tray = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
tray.alpha_composite(draw_N(64, stroke_ratio=0.10, pad_ratio=0.20, color=(255, 255, 255, 255)))
# give it a soft dark plate so it is visible on light taskbars too
plate = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
pd = ImageDraw.Draw(plate)
pd.rounded_rectangle([2, 2, 61, 61], radius=15, fill=(40, 40, 44, 235))
out = Image.alpha_composite(plate, tray)
out.save(os.path.join(OUT, "tray.png"))
print("  wrote tray.png")

# ---- SVG master ----
svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7c6cff"/>
      <stop offset="1" stop-color="#33b8a3"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="64" height="64" rx="15.7" fill="url(#g)"/>
  <path d="M19.5 44.5V19.5l25 25V19.5" fill="none" stroke="#ffffff"
        stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
'''
with open(os.path.join(OUT, "icon.svg"), "w") as f:
    f.write(svg)
print("  wrote icon.svg")
print("\nDone -> %s" % OUT)
