"use client";

/**
 * TimeControls — seek bar, window size selector, and prev/next navigation.
 */

import { memo } from "react";

export type WindowSize = 5 | 10 | 20 | 30 | 60;

interface TimeControlsProps {
  durationSeconds: number;
  currentPositionSeconds: number;
  windowSizeSeconds: WindowSize;
  isStreaming: boolean;
  onSeek: (positionSeconds: number) => void;
  onWindowSizeChange: (size: WindowSize) => void;
  onPrev: () => void;
  onNext: () => void;
  onLoad: () => void;
}

const WINDOW_SIZES: WindowSize[] = [5, 10, 20, 30, 60];

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export const TimeControls = memo(function TimeControls({
  durationSeconds,
  currentPositionSeconds,
  windowSizeSeconds,
  isStreaming,
  onSeek,
  onWindowSizeChange,
  onPrev,
  onNext,
  onLoad,
}: TimeControlsProps) {
  const progressPct =
    durationSeconds > 0
      ? Math.min(100, (currentPositionSeconds / durationSeconds) * 100)
      : 0;

  return (
    <div className="time-controls">
      {/* Top row: position + duration */}
      <div className="time-controls__row">
        <span className="time-label time-label--current">
          {formatTime(currentPositionSeconds)}
        </span>

        {/* Seek bar */}
        <div className="seek-wrapper">
          <input
            id="seek-bar"
            type="range"
            min={0}
            max={durationSeconds}
            step={1}
            value={currentPositionSeconds}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="seek-bar"
            style={
              { "--seek-progress": `${progressPct}%` } as React.CSSProperties
            }
          />
        </div>

        <span className="time-label time-label--total">
          {formatTime(durationSeconds)}
        </span>
      </div>

      {/* Bottom row: navigation + window selector */}
      <div className="time-controls__row time-controls__row--nav">
        {/* Window size */}
        <div className="window-selector">
          <span className="window-selector__label">Window</span>
          {WINDOW_SIZES.map((size) => (
            <button
              key={size}
              id={`window-size-${size}`}
              className={`window-btn ${windowSizeSeconds === size ? "window-btn--active" : ""}`}
              onClick={() => onWindowSizeChange(size)}
            >
              {size}s
            </button>
          ))}
        </div>

        {/* Navigation */}
        <div className="nav-controls">
          <button
            id="btn-prev"
            className="nav-btn"
            onClick={onPrev}
            disabled={currentPositionSeconds <= 0 || isStreaming}
            title="Previous window"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M19 20L9 12l10-8v16z" />
              <line x1="5" y1="4" x2="5" y2="20" />
            </svg>
          </button>

          <button
            id="btn-load"
            className={`load-btn ${isStreaming ? "load-btn--loading" : ""}`}
            onClick={onLoad}
            disabled={isStreaming}
          >
            {isStreaming ? (
              <>
                <span className="spinner" />
                Streaming…
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="10" />
                  <path d="M10 8l6 4-6 4V8z" fill="currentColor" stroke="none" />
                </svg>
                Load
              </>
            )}
          </button>

          <button
            id="btn-next"
            className="nav-btn"
            onClick={onNext}
            disabled={
              currentPositionSeconds + windowSizeSeconds >= durationSeconds || isStreaming
            }
            title="Next window"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M5 4l10 8-10 8V4z" />
              <line x1="19" y1="4" x2="19" y2="20" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
});
