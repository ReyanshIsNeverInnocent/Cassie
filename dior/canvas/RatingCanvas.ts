// xoxo/canvas/RatingCanvas.ts
//
// Unified canvas generator for ALL 4 rating commands:
//   $howcute   (pink)  |  $gay      (rainbow)
//   $intelligent (blue)|  $autistic (teal)
//
// Same file. One shared function. Each command keeps its own restrained accent
// color while using the same realistic profile-card composition.

import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { readFileSync } from 'node:fs';
import type { RatingContext } from '../config/rating/ratingBackgrounds.js';
import { ratingBackgrounds } from '../config/rating/ratingBackgrounds.js';
import { getResourcePath } from '../helpers/resourceAttachments.js';

// ── Font loading ───────────────────────────────────────────────────────────────
try { GlobalFonts.loadFontsFromDir('/usr/share/fonts'); } catch { /* ignore */ }
try { GlobalFonts.loadFontsFromDir('/usr/share/fonts/truetype'); } catch { /* ignore */ }
for (const fontName of ['Poppins-Regular.ttf', 'Poppins-SemiBold.ttf', 'Poppins-Bold.ttf']) {
  for (const fontPath of [
    new URL(`../resources/fonts/${fontName}`, import.meta.url),
    new URL(`../../dior/resources/fonts/${fontName}`, import.meta.url),
  ]) {
    try {
      GlobalFonts.register(readFileSync(fontPath), 'Poppins');
      break;
    } catch { /* font may not exist yet */ }
  }
}

// ── Theme types ───────────────────────────────────────────────────────────────

export interface RatingTierTheme {
  ring:         string;
  shadow:       string;
  gradientFrom: string;
  gradientTo:   string;
  captionColor: string;
  bloom:        string; // rgba()
  particle:     string; // colour for small decorative shapes
}

export interface RatingTheme {
  normal:    RatingTierTheme;
  rare:      RatingTierTheme;
  infinite:  RatingTierTheme;
  bgFrom:    string;
  bgMid:     string;
  bgTo:      string;
  bokeh:     string;
  // Kept for compatibility with the existing theme presets.
  decoStyle: 'pinkHearts' | 'prismStripe' | 'cornerStars' | 'tealDashes';
}

// ── Preset themes ─────────────────────────────────────────────────────────────

export const pinkTheme: RatingTheme = {
  normal: {
    ring: '#e88da8', shadow: '#ffaed2',
    gradientFrom: '#ffb6c1', gradientTo: '#ff69b4',
    captionColor: '#f8bbd0',
    bloom: 'rgba(255,174,210,0.22)',
    particle: '#ff91a4',
  },
  rare: {
    ring: '#d97706', shadow: '#fbbf24',
    gradientFrom: '#fde68a', gradientTo: '#f59e0b',
    captionColor: '#fcd34d',
    bloom: 'rgba(251,191,36,0.20)',
    particle: '#fbbf24',
  },
  infinite: {
    ring: '#fbbf24', shadow: '#fff176',
    gradientFrom: '#fff9c4', gradientTo: '#ffd54f',
    captionColor: '#fff59d',
    bloom: 'rgba(255,241,118,0.22)',
    particle: '#fff176',
  },
  bgFrom: '#2b0a1a', bgMid: '#3d1226', bgTo: '#2b0a1a',
  bokeh: 'rgba(255,182,193,0.30)',
  decoStyle: 'pinkHearts',
};

export const blueTheme: RatingTheme = {
  normal: {
    ring: '#4dabf7', shadow: '#74c0fc',
    gradientFrom: '#a5d8ff', gradientTo: '#4dabf7',
    captionColor: '#b2ebf2',
    bloom: 'rgba(77,171,247,0.20)',
    particle: '#74c0fc',
  },
  rare: {
    ring: '#00b4d8', shadow: '#90e0ef',
    gradientFrom: '#caf0f8', gradientTo: '#00b4d8',
    captionColor: '#caf0f8',
    bloom: 'rgba(0,180,216,0.20)',
    particle: '#90e0ef',
  },
  infinite: {
    ring: '#4895ef', shadow: '#90e0ef',
    gradientFrom: '#e0f7fa', gradientTo: '#4cc9f0',
    captionColor: '#e0f7fa',
    bloom: 'rgba(76,201,240,0.22)',
    particle: '#90e0ef',
  },
  bgFrom: '#0a0e2b', bgMid: '#0f153d', bgTo: '#0a0e2b',
  bokeh: 'rgba(165,216,255,0.28)',
  decoStyle: 'cornerStars',
};

export const rainbowTheme: RatingTheme = {
  normal: {
    ring: '#b983ff', shadow: '#e0aaff',
    gradientFrom: '#f0abfc', gradientTo: '#c77dff',
    captionColor: '#e0aaff',
    bloom: 'rgba(176,131,255,0.20)',
    particle: '#e0aaff',
  },
  rare: {
    ring: '#ff6d00', shadow: '#ff9e00',
    gradientFrom: '#ffea00', gradientTo: '#ff6d00',
    captionColor: '#ffea00',
    bloom: 'rgba(255,109,0,0.20)',
    particle: '#ff9e00',
  },
  infinite: {
    ring: '#ff00ff', shadow: '#ff5dff',
    gradientFrom: '#ffccff', gradientTo: '#ff5dff',
    captionColor: '#ffccff',
    bloom: 'rgba(255,93,255,0.22)',
    particle: '#ff5dff',
  },
  bgFrom: '#1a0a2b', bgMid: '#241040', bgTo: '#1a0a2b',
  bokeh: 'rgba(224,170,255,0.28)',
  decoStyle: 'prismStripe',
};

export const tealTheme: RatingTheme = {
  normal: {
    ring: '#4ecdc4', shadow: '#7ee8d9',
    gradientFrom: '#a8f0e0', gradientTo: '#4ecdc4',
    captionColor: '#b5ead7',
    bloom: 'rgba(78,205,196,0.20)',
    particle: '#7ee8d9',
  },
  rare: {
    ring: '#ffd93d', shadow: '#fff176',
    gradientFrom: '#fff9c4', gradientTo: '#ffd93d',
    captionColor: '#fff59d',
    bloom: 'rgba(255,217,61,0.20)',
    particle: '#fff176',
  },
  infinite: {
    ring: '#00e5ff', shadow: '#84ffff',
    gradientFrom: '#e0f7fa', gradientTo: '#18ffff',
    captionColor: '#e0f7fa',
    bloom: 'rgba(132,255,255,0.22)',
    particle: '#84ffff',
  },
  bgFrom: '#051e1e', bgMid: '#082b2a', bgTo: '#051e1e',
  bokeh: 'rgba(168,240,224,0.28)',
  decoStyle: 'tealDashes',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function pickTier(theme: RatingTheme, isInfinite: boolean, isRare: boolean) {
  return isInfinite ? theme.infinite : isRare ? theme.rare : theme.normal;
}

function bokehDot(ctx: any, x: number, y: number, r: number, color: string, glow: string, blur: number) {
  ctx.save();
  ctx.shadowColor = glow;
  ctx.shadowBlur  = blur;
  ctx.fillStyle   = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function smallHeart(ctx: any, cx: number, cy: number, size: number, color: string, shadow: string) {
  ctx.save();
  ctx.shadowColor = shadow;
  ctx.shadowBlur  = 4;
  ctx.fillStyle   = color;
  ctx.beginPath();
  const topY = cy - size * 0.25;
  const botY = cy + size * 0.40;
  const leftX = cx - size * 0.50;
  const rightX = cx + size * 0.50;
  ctx.moveTo(cx, botY);
  ctx.bezierCurveTo(leftX, cy, leftX, topY, cx - size * 0.12, topY);
  ctx.bezierCurveTo(cx + size * 0.12, topY, rightX, cy, cx, botY);
  ctx.fill();
  ctx.restore();
}

function fourPointStar(ctx: any, cx: number, cy: number, outer: number, inner: number, color: string, shadow: string) {
  ctx.save();
  ctx.shadowColor = shadow;
  ctx.shadowBlur  = 6;
  ctx.fillStyle   = color;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 - Math.PI / 2;
    ctx.moveTo(cx, cy);
    ctx.quadraticCurveTo(cx + Math.cos(a + 0.2) * inner, cy + Math.sin(a + 0.2) * inner, cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
    ctx.quadraticCurveTo(cx + Math.cos(a - 0.2) * inner, cy + Math.sin(a - 0.2) * inner, cx, cy);
  }
  ctx.fill();
  ctx.restore();
}

// ── Theme-specific decorations ───────────────────────────────────────────────────

function drawPinkHearts(ctx: any, tier: RatingTierTheme, W: number, H: number) {
  // Scattered tiny hearts
  smallHeart(ctx, 520, 32,  8, tier.particle, tier.shadow);
  smallHeart(ctx, 50,  160, 6, tier.particle, tier.shadow);
  smallHeart(ctx, 560, 155, 5, tier.particle, tier.shadow);
  smallHeart(ctx, 300, 22,  4, tier.particle, tier.shadow);
  // Sparkle
  fourPointStar(ctx, 500, 160, 10, 4, tier.gradientTo, tier.shadow);
}

function drawPrismStripe(ctx: any, tier: RatingTierTheme, W: number, H: number) {
  // Diagonal translucent stripe across right side
  ctx.save();
  ctx.globalAlpha = 0.06;
  const grad = ctx.createLinearGradient(380, 0, 580, H);
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(0.5, tier.gradientFrom);
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(420, 0);
  ctx.lineTo(520, 0);
  ctx.lineTo(600, H);
  ctx.lineTo(500, H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // A few bright sparkles
  fourPointStar(ctx, 520, 40,  12, 5, tier.particle, tier.shadow);
  fourPointStar(ctx, 565, 165, 8,  3, tier.particle, tier.shadow);
}

function drawCornerStars(ctx: any, tier: RatingTierTheme, W: number, H: number) {
  // Constellation dots in corners
  const dots = [
    [28, 22], [44, 14], [22, 38],
    [572, 18], [584, 30], [560, 28],
    [28, 178], [42, 186], [14, 170],
    [574, 178], [586, 170], [560, 186],
  ];
  for (const [x, y] of dots) {
    bokehDot(ctx, x, y, 1.2, tier.particle, tier.shadow, 3);
  }
  // One 4-point star
  fourPointStar(ctx, 300, 14, 10, 4, tier.gradientFrom, tier.shadow);
}

function drawTealDashes(ctx: any, tier: RatingTierTheme, W: number, H: number) {
  // Small dashed arc near the avatar right edge
  ctx.save();
  ctx.strokeStyle = tier.particle;
  ctx.lineWidth   = 1.5;
  ctx.globalAlpha = 0.35;
  ctx.setLineDash([5, 6]);
  ctx.beginPath();
  ctx.arc(118, H / 2, 78, -Math.PI / 3, Math.PI / 3);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  // Ripple ring (very faint)
  ctx.save();
  ctx.strokeStyle = tier.bloom.replace(/[\d.]+%?\)/, '0.12)');
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.arc(118, H / 2, 86, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface RatingCanvasOptions {
  avatarURLs:  string[];
  username:    string;
  pct:         number;
  caption:     string;
  theme:       RatingTheme;
  context:     RatingContext;
}

export async function generateRatingCanvas(opts: RatingCanvasOptions): Promise<Buffer> {
  const { avatarURLs, username, pct, caption, context } = opts;

  const W = 600, H = 540;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const isInfinite = !isFinite(pct);
  const isRare     = isFinite(pct) && pct > 100;
  const avatarURL = avatarURLs.find(Boolean);
  const backgroundPath = getResourcePath(ratingBackgrounds[context]);
  const [img, background] = await Promise.all([
    (async () => {
      for (const url of avatarURLs) {
        if (!url) continue;
        const loaded = await loadImage(url).catch((): null => null);
        if (loaded) return loaded;
      }
      return null;
    })(),
    loadImage(backgroundPath).catch((): null => null),
  ]);

  // ── 1. User-provided background ──────────────────────────────────────────
  ctx.fillStyle = '#d8d8d5';
  ctx.fillRect(0, 0, W, H);
  if (background) {
    ctx.save();
    const scale = Math.max(W / background.width, H / background.height);
    const drawW = background.width * scale;
    const drawH = background.height * scale;
    ctx.globalAlpha = 0.72;
    ctx.drawImage(background, (W - drawW) / 2, (H - drawH) / 2, drawW, drawH);
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.36)';
    ctx.fillRect(0, 0, W, H);
  }

  // A soft light wash keeps white typography readable without hiding the image.
  const wash = ctx.createLinearGradient(0, 0, 0, H);
  wash.addColorStop(0, 'rgba(0,0,0,0.18)');
  wash.addColorStop(0.46, 'rgba(0,0,0,0.04)');
  wash.addColorStop(1, 'rgba(0,0,0,0.30)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);

  // ── 2. Avatar and avatar-derived border colors ────────────────────────────
  const avX = W / 2, avY = 246, avR = 106;
  let avatarColors: [string, string] = ['#ffffff', '#9b9b9b'];
  if (img) {
    const sample = createCanvas(24, 24);
    const sampleCtx = sample.getContext('2d');
    sampleCtx.drawImage(img, 0, 0, 24, 24);
    const pixels = sampleCtx.getImageData(0, 0, 24, 24).data;
    let totalR = 0, totalG = 0, totalB = 0, count = 0;
    let vivid: [number, number, number] = [255, 255, 255];
    let vividScore = -1;
    for (let i = 0; i < pixels.length; i += 4) {
      const alpha = pixels[i + 3];
      if (alpha < 180) continue;
      const red = pixels[i], green = pixels[i + 1], blue = pixels[i + 2];
      totalR += red; totalG += green; totalB += blue; count++;
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      const score = max - min + max * 0.15;
      if (score > vividScore) { vivid = [red, green, blue]; vividScore = score; }
    }
    if (count) {
      const average: [number, number, number] = [totalR / count, totalG / count, totalB / count];
      avatarColors = [
        `rgb(${vivid[0]}, ${vivid[1]}, ${vivid[2]})`,
        `rgb(${average[0]}, ${average[1]}, ${average[2]})`,
      ];
    }
  }

  const ring = ctx.createLinearGradient(avX - avR, avY - avR, avX + avR, avY + avR);
  ring.addColorStop(0, avatarColors[0]);
  ring.addColorStop(0.5, '#ffffff');
  ring.addColorStop(1, avatarColors[1]);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur  = 12;
  ctx.strokeStyle = ring;
  ctx.lineWidth   = 5;
  ctx.beginPath();
  ctx.arc(avX, avY, avR + 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(avX, avY, avR, 0, Math.PI * 2);
  if (!img) {
    ctx.fillStyle = '#333333';
    ctx.fill();
  } else {
    ctx.clip();
    ctx.drawImage(img, avX - avR, avY - avR, avR * 2, avR * 2);
  }
  ctx.restore();

  // ── 3. White reference-style typography ──────────────────────────────────
  const nameLabel = (username ?? '?').slice(0, 24);
  const titleLine = context === 'rizz' ? 'How much rizz does' : `How ${context} is`;
  const nameLine = context === 'rizz' ? `${nameLabel} have?` : `${nameLabel}?`;
  ctx.save();
  ctx.font         = '600 31px Poppins, sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = '#ffffff';
  ctx.shadowColor  = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur   = 5;
  ctx.fillText(titleLine, W / 2, 52);
  ctx.fillText(nameLine, W / 2, 92);
  ctx.restore();

  const pctText   = isInfinite ? '\u221e%' : `${pct}%`;
  ctx.save();
  ctx.font         = '700 58px Poppins, sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(255,255,255,0.9)';
  ctx.shadowBlur = 18;
  ctx.globalAlpha = 0.9;
  ctx.fillText(pctText, W / 2, 407);
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 5;
  ctx.globalAlpha = 1;
  ctx.fillText(pctText, W / 2, 407);
  ctx.restore();

  ctx.save();
  ctx.font         = '600 27px Poppins, sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = '#ffffff';
  ctx.shadowColor  = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur   = 5;
  ctx.fillText(caption.slice(0, 64), W / 2, 482);
  ctx.restore();

  return canvas.toBuffer('image/png');
}
