"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearScratchpad,
  loadScratchpad,
  saveScratchpad,
} from "@/features/scratchpad/services/scratchpadDb";
import {
  strokeToPath,
  type Point,
} from "@/features/scratchpad/hooks/useFreehandStroke";
import { Button } from "@/components/shadcnui/button";

type Stroke = { points: Point[]; size: number; erase: boolean };

type Props = {
  attemptId: string;
};

export const DigitalScratchpad = ({ attemptId }: Props) => {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [livePoints, setLivePoints] = useState<Point[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [erase, setErase] = useState(false);
  const [size, setSize] = useState(4);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let cancelled = false;
    void loadScratchpad(attemptId).then((row) => {
      if (cancelled || !row) return;
      try {
        setStrokes(JSON.parse(row.strokesJson) as Stroke[]);
      } catch {
        /* ignore corrupt */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  const persist = useCallback(
    (next: Stroke[]) => {
      void saveScratchpad(attemptId, JSON.stringify(next));
    },
    [attemptId],
  );

  const pointerPos = (e: React.PointerEvent): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure || 0.5,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrawing(true);
    setRedoStack([]);
    setLivePoints([pointerPos(e)]);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing) return;
    setLivePoints((pts) => [...pts, pointerPos(e)]);
  };

  const onPointerUp = () => {
    if (!drawing) return;
    setDrawing(false);
    setLivePoints((pts) => {
      if (pts.length >= 2) {
        setStrokes((prev) => {
          const next = [...prev, { points: pts, size, erase }];
          persist(next);
          return next;
        });
      }
      return [];
    });
  };

  const undo = () => {
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const copy = [...prev];
      const last = copy.pop()!;
      setRedoStack((r) => [...r, last]);
      persist(copy);
      return copy;
    });
  };

  const redo = () => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const copy = [...prev];
      const stroke = copy.pop()!;
      setStrokes((s) => {
        const next = [...s, stroke];
        persist(next);
        return next;
      });
      return copy;
    });
  };

  const clear = async () => {
    setStrokes([]);
    setRedoStack([]);
    setLivePoints([]);
    await clearScratchpad(attemptId);
  };

  const livePath =
    drawing && livePoints.length > 1 ? strokeToPath(livePoints, size) : "";

  return (
    <div className="border-border grid gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={erase ? "outline" : "default"}
          size="lg"
          onClick={() => setErase(false)}>
          Pen
        </Button>
        <Button
          type="button"
          variant={erase ? "default" : "outline"}
          size="lg"
          onClick={() => setErase(true)}>
          Eraser
        </Button>
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          Width
          <input
            type="range"
            min={2}
            max={24}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
          />
        </label>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={undo}
          disabled={strokes.length === 0}>
          Undo
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={redo}
          disabled={redoStack.length === 0}>
          Redo
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => void clear()}>
          Clear
        </Button>
      </div>
      <svg
        ref={svgRef}
        className="bg-muted/30 touch-none h-56 w-full rounded-md"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}>
        {strokes.map((s, i) => (
          <path
            key={i}
            d={strokeToPath(s.points, s.size)}
            fill={s.erase ? "#000" : "currentColor"}
            className={s.erase ? "mix-blend-destination-out" : "text-foreground"}
          />
        ))}
        {livePath ?
          <path
            d={livePath}
            fill={erase ? "#000" : "currentColor"}
            className={
              erase ? "mix-blend-destination-out" : "text-foreground opacity-80"
            }
          />
        : null}
      </svg>
      <p className="text-muted-foreground text-xs">
        Scratchpad only — not part of your submitted answers. Saved locally in
        this browser.
      </p>
    </div>
  );
};
