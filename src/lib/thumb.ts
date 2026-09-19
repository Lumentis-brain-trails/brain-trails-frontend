/**
 * Geometry for trail thumbnails: fit a trail (and the terrain nodes behind it) into
 * a small box without distorting it, and thin it to a number of points an SVG can
 * draw one segment at a time.
 */

export interface XY {
  x: number;
  y: number;
}

/**
 * Evenly thin `points` to at most `max`, always keeping the first and the last
 * (where the trail starts and ends is the point of the picture).
 */
export function downsample<T>(points: T[], max: number): T[] {
  if (points.length <= max || max < 2) return points.slice();
  const out: T[] = [];
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i += 1) out.push(points[Math.round(i * step)]);
  return out;
}

/**
 * A mapping from data space into a `width` x `height` box with `pad` pixels on
 * every side, uniformly scaled (one unit is the same length on both axes) and
 * centred. The y axis is flipped so up in the data is up on screen. `extent` is
 * every point that must fit, not only the ones that will be drawn.
 */
export function fitToBox(
  extent: XY[],
  width: number,
  height: number,
  pad: number
): (p: XY) => XY {
  if (extent.length === 0) return () => ({ x: width / 2, y: height / 2 });
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of extent) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const innerW = Math.max(0, width - 2 * pad);
  const innerH = Math.max(0, height - 2 * pad);
  const scale = Math.min(
    spanX > 0 ? innerW / spanX : Infinity,
    spanY > 0 ? innerH / spanY : Infinity
  );
  const k = Number.isFinite(scale) ? scale : 0;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return (p) => ({
    x: width / 2 + (p.x - cx) * k,
    y: height / 2 - (p.y - cy) * k,
  });
}
