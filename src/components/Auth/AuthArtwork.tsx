"use client";

import { PauseIcon, PlayIcon } from "lucide-react";
import { useState } from "react";

const checklistRows = [140, 168, 196];

const AuthArtwork = () => {
  const [paused, setPaused] = useState(false);
  const toggleLabel = paused
    ? "Resume illustration animation"
    : "Pause illustration animation";

  return (
    <div
      className="auth-illustration relative w-full max-w-[33rem]"
      data-paused={paused || undefined}
    >
      <svg
        viewBox="0 0 520 325"
        fill="none"
        aria-hidden="true"
        className="auth-artwork block w-full"
      >
        <g className="text-brand-panel-muted/25" stroke="currentColor">
          <ellipse cx="260" cy="167" rx="223" ry="121" />
          <ellipse cx="260" cy="167" rx="177" ry="121" />
          <ellipse cx="260" cy="167" rx="121" ry="121" />
          <path d="M37 167h446M71 103h378M71 231h378M260 46v242" />
          <path d="M23 167h14m-7-7v14m460-7h14m-7-7v14M260 32v14m-7-7h14m-7 249v14m-7-7h14" />
        </g>
        <g className="auth-artwork-orbits">
          <circle
            cx="111"
            cy="101"
            r="4"
            className="auth-artwork-dot fill-brand-art-accent"
          />
          <circle
            cx="420"
            cy="236"
            r="4"
            className="auth-artwork-dot fill-brand-art-accent"
          />
          <circle
            cx="408"
            cy="105"
            r="3"
            className="auth-artwork-dot fill-brand-panel-muted"
          />
        </g>
        <g strokeWidth="1.2" className="auth-artwork-documents">
          <g className="auth-artwork-back-page">
            <rect
              x="184"
              y="76"
              width="160"
              height="190"
              rx="13"
              transform="rotate(13 184 76)"
              className="fill-brand-panel stroke-brand-panel-muted/45"
            />
          </g>
          <g className="auth-artwork-middle-page">
            <rect
              x="171"
              y="69"
              width="162"
              height="186"
              rx="13"
              transform="rotate(-10 171 69)"
              className="fill-brand-panel stroke-brand-panel-muted/60"
            />
          </g>
          <rect
            x="197"
            y="66"
            width="151"
            height="190"
            rx="12"
            className="fill-brand-panel-foreground stroke-brand-panel-foreground"
          />
          <path
            d="M222 95h39m-39 14h75"
            strokeLinecap="round"
            className="stroke-brand-panel/60"
          />
          <g className="auth-artwork-checklist">
            {checklistRows.map((y) => (
              <g
                key={y}
                className="auth-artwork-check"
                transform={`translate(222 ${y})`}
              >
                <path
                  d="M0 0h102"
                  strokeLinecap="round"
                  className="stroke-brand-panel/23"
                />
                <rect
                  y="-7"
                  width="14"
                  height="14"
                  rx="3"
                  className="auth-artwork-checkbox fill-brand-panel-foreground stroke-brand-panel/50"
                />
                <path
                  d="m4 -1 3 3 5-6"
                  pathLength={1}
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="auth-artwork-tick stroke-brand-panel"
                />
              </g>
            ))}
          </g>
          <path
            d="M222 225h62"
            strokeLinecap="round"
            className="stroke-brand-panel/23"
          />
          <g className="auth-artwork-seal">
            <circle
              cx="346"
              cy="210"
              r="39"
              className="fill-brand-panel stroke-brand-panel-foreground"
            />
            <path
              d="M346 190c-4 4-10 7-16 8v10c0 10 7 17 16 21 9-4 16-11 16-21v-10c-6-1-12-4-16-8Z"
              strokeWidth="1.65"
              strokeLinejoin="round"
              className="stroke-brand-panel-foreground"
            />
            <path
              d="m340 209 4 4 8-9"
              strokeWidth="1.65"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="stroke-brand-art-accent"
            />
          </g>
        </g>
      </svg>
      <button
        type="button"
        aria-label={toggleLabel}
        title={toggleLabel}
        onClick={() => setPaused((current) => !current)}
        className="absolute right-0 bottom-0 grid size-9 place-items-center rounded-full border border-brand-panel-muted/30 bg-brand-panel text-brand-panel-muted hover:bg-brand-panel-foreground/10 hover:text-brand-panel-foreground focus-visible:outline-2 focus-visible:outline-brand-panel-foreground motion-reduce:hidden"
      >
        {paused ? (
          <PlayIcon aria-hidden="true" className="size-4" />
        ) : (
          <PauseIcon aria-hidden="true" className="size-4" />
        )}
      </button>
    </div>
  );
};

export { AuthArtwork };
