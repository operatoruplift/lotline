export type Size = { width: number; height: number };
export type Rect = Size & { left: number; top: number };
export type GlassGeometry = { card: Rect; cover: Rect; source: Size };

export const GLASS_OPTICS = { radius: 16, distort: 0.06, edgeCurl: 0.04, brightness: 0.06, specular: 0.20, border: 0.18, borderWidth: 1 } as const;
export const GLASS_POSITION = { x: 0.5, y: 0.5 } as const;
export const GLASS_LIMITS = { fps: 24, dpr: 1.5, edge: 1_000, pixels: 600_000, textureEdge: 960 } as const;

const validSize = ({ width, height }: Size) => Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;

/** All rectangles use CSS pixels; only the output buffer is scaled by DPR. */
export function glassGeometry(scene: Rect, card: Rect, source: Size, position: { x: number; y: number } = GLASS_POSITION): GlassGeometry | null {
  if (![scene, card, source].every(validSize) || ![scene.left, scene.top, card.left, card.top, position.x, position.y].every(Number.isFinite)) return null;
  const scale = Math.max(scene.width / source.width, scene.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  return {
    source,
    card: { left: card.left - scene.left, top: card.top - scene.top, width: card.width, height: card.height },
    cover: { left: (scene.width - width) * position.x, top: (scene.height - height) * position.y, width, height },
  };
}

export function glassBufferSize(size: Size, dpr: number): Size {
  if (!validSize(size)) return { width: 1, height: 1 };
  const scale = Math.min(Number.isFinite(dpr) && dpr > 0 ? dpr : 1, GLASS_LIMITS.dpr, GLASS_LIMITS.edge / Math.max(size.width, size.height), Math.sqrt(GLASS_LIMITS.pixels / (size.width * size.height)));
  return { width: Math.max(1, Math.floor(size.width * scale)), height: Math.max(1, Math.floor(size.height * scale)) };
}

export function glassTextureSize(size: Size): Size {
  if (!validSize(size)) return { width: 1, height: 1 };
  const scale = Math.min(1, GLASS_LIMITS.textureEdge / Math.max(size.width, size.height));
  return { width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) };
}

/** The undistorted sample corresponding to one card-local CSS point. */
export function glassSample(geometry: GlassGeometry, x: number, y: number) {
  return { x: (geometry.card.left + x - geometry.cover.left) / geometry.cover.width, y: (geometry.card.top + y - geometry.cover.top) / geometry.cover.height };
}
