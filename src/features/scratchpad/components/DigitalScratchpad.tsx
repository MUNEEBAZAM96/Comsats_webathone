"use client";

import { useEffect, useRef, useState } from "react";
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
  disabled?: boolean;
};

export const DigitalScratchpad = ({ attemptId, disabled }: Props) => {
  const [notes, setNotes] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [livePoints, setLivePoints] = useState<Point[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [erase, setErase] = useState(false);
  const [size, setSize] = useState(4);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    void loadScratchpad(attemptId)
      .then((row) => {
        if (cancelled) return;
        setReady(true);
        if (!row) return;
        setNotes(row.notes ?? "");
        try {
          setStrokes(JSON.parse(row.strokesJson) as Stroke[]);
        } catch {
          /* ignore corrupt */
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  const persist = (next: Stroke[], nextNotes = notes) => {
    void saveScratchpad(attemptId, JSON.stringify(next), nextNotes).catch(() =>
      setError(true),
    );
  };

  const pointerPos = (e: React.PointerEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure || 0.5,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || !ready || drawing || !e.isPrimary || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrawing(true);
    setRedoStack([]);
    setLivePoints([pointerPos(e)]);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing || disabled || !e.isPrimary) return;
    const point = pointerPos(e);
    setLivePoints((pts) => (pts.length >= 4000 ? pts : [...pts, point]));
  };

  const onPointerUp = () => {
    if (!drawing) return;
    setDrawing(false);
    if (!disabled && livePoints.length > 0 && strokes.length < 500) {
      const next = [...strokes, { points: livePoints, size, erase }];
      setStrokes(next);
      persist(next);
    }
    setLivePoints([]);
  };

  const undo = () => {
    const last = strokes.at(-1);
    if (!last) return;
    const next = strokes.slice(0, -1);
    setStrokes(next);
    setRedoStack([...redoStack, last]);
    persist(next);
  };

  const redo = () => {
    const last = redoStack.at(-1);
    if (!last) return;
    const next = [...strokes, last];
    setRedoStack(redoStack.slice(0, -1));
    setStrokes(next);
    persist(next);
  };

  const clear = async () => {
    setStrokes([]);
    setRedoStack([]);
    setLivePoints([]);
    setNotes("");
    await clearScratchpad(attemptId).catch(() => setError(true));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const paint = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.scale(ratio, ratio);
      context.fillStyle = getComputedStyle(canvas).color;
      const draw = (stroke: Stroke) => {
        context.globalCompositeOperation = stroke.erase
          ? "destination-out"
          : "source-over";
        context.fill(new Path2D(strokeToPath(stroke.points, stroke.size)));
      };
      strokes.forEach(draw);
      if (drawing && livePoints.length)
        draw({ points: livePoints, size, erase });
    };
    const observer = new ResizeObserver(paint);
    observer.observe(canvas);
    const themeObserver = new MutationObserver(paint);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    paint();
    return () => {
      observer.disconnect();
      themeObserver.disconnect();
    };
  }, [drawing, erase, livePoints, size, strokes]);

  return (
    <details open className="rounded-lg border p-3">
      <summary className="cursor-pointer font-medium">
        Private scratchpad
      </summary>
      <fieldset
        disabled={disabled || !ready}
        className="mt-3 grid min-w-0 gap-3"
      >
        <label className="grid gap-1 text-sm">
          Notes
          <textarea
            className="min-h-24 rounded border bg-background p-2"
            maxLength={10000}
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
              persist(strokes, event.target.value);
            }}
          />
        </label>
        {error && (
          <p role="status" className="text-destructive text-sm">
            Scratchpad storage is unavailable. Changes may be lost on refresh.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={erase ? "outline" : "default"}
            size="lg"
            onClick={() => setErase(false)}
          >
            Pen
          </Button>
          <Button
            type="button"
            variant={erase ? "default" : "outline"}
            size="lg"
            onClick={() => setErase(true)}
          >
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
            disabled={strokes.length === 0}
          >
            Undo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={redo}
            disabled={redoStack.length === 0}
          >
            Redo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => void clear()}
          >
            Clear
          </Button>
        </div>
        <canvas
          ref={canvasRef}
          className="bg-muted/30 touch-none h-56 w-full rounded-md"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          aria-label="Freehand scratchpad"
          onPointerCancel={() => {
            setDrawing(false);
            setLivePoints([]);
          }}
        />
        <p className="text-muted-foreground text-xs">
          Private notes and drawings are stored in this browser and excluded
          from grading.
        </p>
      </fieldset>
    </details>
  );
};
