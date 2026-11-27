"use client";

import { getStroke } from "perfect-freehand";

export type Point = { x: number; y: number; pressure?: number };

export const strokeToPath = (points: Point[], size: number) => {
  const outline = getStroke(
    points.map((p) => [p.x, p.y, p.pressure ?? 0.5]),
    {
      size,
      thinning: 0.6,
      smoothing: 0.5,
      streamline: 0.5,
    },
  );
  if (outline.length === 0) return "";
  const [first, ...rest] = outline;
  let d = `M ${first![0]} ${first![1]}`;
  for (const [x, y] of rest) d += ` L ${x} ${y}`;
  return d + " Z";
};
