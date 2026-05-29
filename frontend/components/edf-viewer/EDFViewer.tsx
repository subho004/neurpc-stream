"use client";

/**
 * EDFViewer — top-level client component.
 *
 * Orchestrates:
 *  1. Metadata fetch (useEDFMetadata)
 *  2. Channel selection
 *  3. Time-window navigation
 *  4. Streaming (useEDFStream)
 *  5. Imperative chart update (WaveformChart.updateRef)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEDFMetadata } from "@/lib/hooks/useEDFMetadata";
import { useEDFStream, type StreamParams } from "@/lib/hooks/useEDFStream";
import { ChannelSelector } from "./ChannelSelector";
import { MetadataPanel } from "./MetadataPanel";
import { TimeControls, type WindowSize } from "./TimeControls";
import { WaveformChart, type WaveformSeries } from "./WaveformChart";

const DEFAULT_WINDOW_SIZE: WindowSize = 10;
const DEFAULT_CHUNK_SIZE = 2048;
/** Max channels to show at once (increased to support full 36-ch EEG files). */
const MAX_DISPLAY_CHANNELS = 36;

/**
 * EDF EEG signals are stored in SI units (Volts).
 * The backend already scales EEG/EOG/EMG channels to µV (×1e6) and removes DC offset.
 * Therefore, the scale factor in the frontend is 1.0.
 */
const SCALE_FACTOR = 1.0;

/** Vertical separation between channels in µV. */
const DEFAULT_OFFSET_UV = 100;

export function EDFViewer() {
  const metaState = useEDFMetadata();

  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [windowSizeSeconds, setWindowSizeSeconds] = useState<WindowSize>(DEFAULT_WINDOW_SIZE);
  const [currentPositionSeconds, setCurrentPositionSeconds] = useState(0);
  const [streamParams, setStreamParams] = useState<StreamParams | null>(null);
  const [offsetUV, setOffsetUV] = useState(DEFAULT_OFFSET_UV);

  // Track active channel names for y-axis labels
  const [activeChannelNames, setActiveChannelNames] = useState<string[]>([]);

  // Declarative chart data state
  const [chartData, setChartData] = useState<{
    series: WaveformSeries[];
  }>({ series: [] });

  // ── Chart update callback (called by useEDFStream on every chunk) ─────────
  const handleBufferUpdate = useCallback(
    (buffer: Float32Array[], channelNames: string[], sfreq: number) => {
      if (!sfreq) return;

      const nChannels = buffer.length;
      const nSamples = buffer[0]?.length ?? 0;

      setActiveChannelNames(channelNames);

      const dt = 1 / sfreq;

      /**
       * Apply scale + vertical offset:
       *   - Scale:  × 1.0  →  Backend already did Volts to µV
       *   - Offset: channel 0 sits at top (highest offset), each channel
       *             below is shifted down by `offsetUV` µV.
       *             offset[i] = (nChannels - 1 - i) * offsetUV
       */
      const series: WaveformSeries[] = buffer.map((ch, bufIdx) => {
        const channelOffset = (nChannels - 1 - bufIdx) * offsetUV;
        const data = Array.from(ch, (v, i) => ({
          x: +(currentPositionSeconds + i * dt).toFixed(4),
          y: +(v * SCALE_FACTOR + channelOffset).toFixed(4),
        }));
        return {
          name: channelNames[bufIdx] ?? `Ch ${bufIdx}`,
          data,
        };
      });

      setChartData({ series });
    },
    [currentPositionSeconds, offsetUV]
  );

  const streamState = useEDFStream(streamParams, handleBufferUpdate);

  // ── Metadata-driven init ─────────────────────────────────────────────────
  const metadata =
    metaState.status === "success" ? metaState.data : null;

  // Auto-select first N channels when metadata loads
  const prevMetaRef = useRef(false);
  if (metadata && !prevMetaRef.current) {
    prevMetaRef.current = true;
    const autoSelect = metadata.channels
      .slice(0, MAX_DISPLAY_CHANNELS)
      .map((_, i) => i);
    setSelectedIndices(autoSelect);
  }

  // ── Navigation handlers ───────────────────────────────────────────────────
  const buildParams = useCallback(
    (posSeconds: number): StreamParams => ({
      startSample: Math.round(posSeconds * (metadata?.sfreq ?? 256)),
      windowSamples: Math.round(windowSizeSeconds * (metadata?.sfreq ?? 256)),
      channelIndices: selectedIndices.slice(0, MAX_DISPLAY_CHANNELS),
      chunkSize: DEFAULT_CHUNK_SIZE,
      bufferSamples:
        Math.round(windowSizeSeconds * (metadata?.sfreq ?? 256)) + DEFAULT_CHUNK_SIZE,
    }),
    [metadata, windowSizeSeconds, selectedIndices]
  );

  // Debounce and auto-trigger stream when position, window size, or channel selection changes
  useEffect(() => {
    if (!metadata || selectedIndices.length === 0) return;

    const delayDebounceFn = setTimeout(() => {
      setStreamParams(buildParams(currentPositionSeconds));
    }, 200);

    return () => clearTimeout(delayDebounceFn);
  }, [currentPositionSeconds, windowSizeSeconds, selectedIndices, metadata, buildParams]);

  // Clear chart data immediately when a new stream is initiated
  useEffect(() => {
    if (streamParams) {
      setChartData({ series: [] });
      setActiveChannelNames([]);
    }
  }, [streamParams]);

  const handleLoad = useCallback(() => {
    setStreamParams(buildParams(currentPositionSeconds));
  }, [buildParams, currentPositionSeconds]);

  const handleSeek = useCallback((posSeconds: number) => {
    setCurrentPositionSeconds(posSeconds);
  }, []);

  const handlePrev = useCallback(() => {
    const newPos = Math.max(0, currentPositionSeconds - windowSizeSeconds);
    setCurrentPositionSeconds(newPos);
  }, [currentPositionSeconds, windowSizeSeconds]);

  const handleNext = useCallback(() => {
    const max = (metadata?.duration_seconds ?? 0) - windowSizeSeconds;
    const newPos = Math.min(max, currentPositionSeconds + windowSizeSeconds);
    setCurrentPositionSeconds(newPos);
  }, [currentPositionSeconds, windowSizeSeconds, metadata]);

  const handleWindowSizeChange = useCallback((size: WindowSize) => {
    setWindowSizeSeconds(size);
  }, []);

  // ── Initial empty series for chart ───────────────────────────────────────
  const initialSeries = useMemo<WaveformSeries[]>(() => {
    if (!metadata) return [];
    return selectedIndices.slice(0, MAX_DISPLAY_CHANNELS).map((idx) => ({
      name: metadata.channels[idx]?.name ?? `Ch ${idx}`,
      data: [],
    }));
  }, [metadata, selectedIndices]);

  // Pre-compute channel baselines for the y-axis labels
  const channelBaselines = useMemo(() => {
    const n = activeChannelNames.length || selectedIndices.slice(0, MAX_DISPLAY_CHANNELS).length;
    return Array.from({ length: n }, (_, i) => (n - 1 - i) * offsetUV);
  }, [activeChannelNames.length, selectedIndices, offsetUV]);

  // Dynamically calculate chart height based on active channels to keep spacing clean
  const chartHeight = useMemo(() => {
    const n = activeChannelNames.length || selectedIndices.slice(0, MAX_DISPLAY_CHANNELS).length || 1;
    return Math.max(480, n * 65);
  }, [activeChannelNames.length, selectedIndices]);

  // ── Render states ─────────────────────────────────────────────────────────

  if (metaState.status === "loading") {
    return (
      <div className="viewer-loading">
        <div className="viewer-loading__spinner" />
        <p>Connecting to EDF backend…</p>
      </div>
    );
  }

  if (metaState.status === "error") {
    return (
      <div className="viewer-error">
        <div className="viewer-error__icon">⚠️</div>
        <h2>Cannot reach backend</h2>
        <p>{metaState.message}</p>
        <p className="viewer-error__hint">
          Start the backend: <code>uvicorn main:app --reload --port 8000</code>
        </p>
      </div>
    );
  }

  if (!metadata) return null;

  return (
    <div className="edf-viewer">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="viewer-header">
        <div className="viewer-header__brand">
          <span className="brand-icon">⚡</span>
          <span className="brand-name">EDF Viewer</span>
        </div>
        <div className="viewer-header__info">
          <span className="header-badge">
            {metadata.channels.length} ch · {metadata.sfreq.toFixed(0)} Hz
          </span>

          {/* Offset control */}
          <div className="offset-control">
            <span className="offset-control__label">Offset</span>
            <input
              id="offset-slider"
              type="range"
              min={50}
              max={1000}
              step={50}
              value={offsetUV}
              onChange={(e) => setOffsetUV(Number(e.target.value))}
              className="offset-slider"
            />
            <span className="offset-control__value">{offsetUV} µV</span>
          </div>

          {streamState.isStreaming && (
            <span className="header-badge header-badge--live">
              <span className="live-dot" />
              LIVE
            </span>
          )}
          {streamState.error && (
            <span className="header-badge header-badge--error">
              ⚠ {streamState.error}
            </span>
          )}
        </div>
      </header>

      {/* ── Main layout ─────────────────────────────────────────────── */}
      <div className="viewer-layout">
        {/* Sidebar */}
        <aside className="viewer-sidebar">
          <MetadataPanel metadata={metadata} />
          <ChannelSelector
            channels={metadata.channels}
            selectedIndices={selectedIndices}
            onChange={setSelectedIndices}
          />
        </aside>

        {/* Main content */}
        <main className="viewer-main">
          <TimeControls
            durationSeconds={metadata.duration_seconds}
            currentPositionSeconds={currentPositionSeconds}
            windowSizeSeconds={windowSizeSeconds}
            isStreaming={streamState.isStreaming}
            onSeek={handleSeek}
            onWindowSizeChange={handleWindowSizeChange}
            onPrev={handlePrev}
            onNext={handleNext}
            onLoad={handleLoad}
          />

          <div className="chart-card">
            <div className="chart-card__header">
              <span className="chart-card__title">Waveform</span>
              <span className="chart-card__subtitle">
                {selectedIndices.slice(0, MAX_DISPLAY_CHANNELS).length} channel
                {selectedIndices.length !== 1 ? "s" : ""} · µV scale · {offsetUV} µV/div
              </span>
            </div>
            <WaveformChart
              series={chartData.series.length > 0 ? chartData.series : initialSeries}
              channelNames={activeChannelNames.length > 0 ? activeChannelNames : metadata.channels.slice(0, MAX_DISPLAY_CHANNELS).map(c => c.name)}
              channelBaselines={channelBaselines}
              offsetUV={offsetUV}
              height={chartHeight}
              minX={currentPositionSeconds}
              maxX={currentPositionSeconds + windowSizeSeconds}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
