"use client";

/**
 * useEDFStream — manages streaming a window of EDF data.
 *
 * Accumulates incoming chunks into a per-channel sliding buffer and
 * triggers a callback so the chart can update imperatively (no React
 * re-render on every chunk).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { streamEDFWindow } from "@/lib/grpc/edf-client";
import type { ParsedEDFChunk } from "@/proto/edf_stream";

export interface StreamParams {
  startSample: number;
  windowSamples: number;
  channelIndices: number[];
  chunkSize?: number;
  /** Max samples to keep in the sliding buffer per channel (≈ display window). */
  bufferSamples?: number;
}

export interface StreamState {
  /** Whether a stream is currently in-flight. */
  isStreaming: boolean;
  /** Whether the last stream finished normally. */
  isComplete: boolean;
  /** Error message if the stream failed. */
  error: string | null;
  /** Accumulated data buffer: one Float32Array per channel. */
  buffer: Float32Array[];
  /** Channel names (set from first chunk). */
  channelNames: string[];
  /** Sampling frequency (set from first chunk). */
  sfreq: number;
  /** Absolute sample index of first sample in buffer. */
  bufferStartSample: number;
}

const INITIAL_STATE: StreamState = {
  isStreaming: false,
  isComplete: false,
  error: null,
  buffer: [],
  channelNames: [],
  sfreq: 0,
  bufferStartSample: 0,
};

export function useEDFStream(
  params: StreamParams | null,
  onBufferUpdate?: (buffer: Float32Array[], channelNames: string[], sfreq: number) => void
): StreamState {
  const [state, setState] = useState<StreamState>(INITIAL_STATE);
  const bufferRef = useRef<Float32Array[]>([]);
  const channelNamesRef = useRef<string[]>([]);
  const sfreqRef = useRef<number>(0);
  const bufferStartRef = useRef<number>(0);
  const cleanupRef = useRef<(() => void) | null>(null);

  const bufferSamples = params?.bufferSamples ?? 20_000;

  const onBufferUpdateRef = useRef(onBufferUpdate);
  useEffect(() => {
    onBufferUpdateRef.current = onBufferUpdate;
  }, [onBufferUpdate]);

  const appendChunk = useCallback(
    (chunk: ParsedEDFChunk) => {
      // First chunk initialises the buffer and caches metadata
      if (chunk.chunkIndex === 0) {
        channelNamesRef.current = chunk.channelNames;
        sfreqRef.current = chunk.sfreq;
        bufferStartRef.current = chunk.startSample;
        bufferRef.current = chunk.data.map((ch) => new Float32Array(ch));
      } else {
        // Append new data, then trim to bufferSamples
        bufferRef.current = bufferRef.current.map((existing, c) => {
          const incoming = chunk.data[c];
          const combined = new Float32Array(existing.length + incoming.length);
          combined.set(existing, 0);
          combined.set(incoming, existing.length);
          if (combined.length > bufferSamples) {
            const trimmed = combined.slice(combined.length - bufferSamples);
            // Update the start sample pointer
            bufferStartRef.current = chunk.startSample - (trimmed.length - incoming.length);
            return trimmed;
          }
          return combined;
        });
      }

      onBufferUpdateRef.current?.(
        bufferRef.current,
        channelNamesRef.current,
        sfreqRef.current
      );

      if (chunk.isLast) {
        setState((prev) => ({ ...prev, isStreaming: false, isComplete: true }));
      }
    },
    [bufferSamples]
  );

  useEffect(() => {
    if (!params) return;

    // Cancel any in-flight stream
    cleanupRef.current?.();

    bufferRef.current = [];
    setState({ ...INITIAL_STATE, isStreaming: true });

    const cleanup = streamEDFWindow({
      start_sample: params.startSample,
      chunk_size: params.chunkSize ?? 2048,
      window_samples: params.windowSamples,
      channel_indices: params.channelIndices,
      onChunk: appendChunk,
      onComplete: () => {
        setState((prev) => ({ ...prev, isStreaming: false, isComplete: true }));
      },
      onError: (err) => {
        setState((prev) => ({
          ...prev,
          isStreaming: false,
          error: err.message,
        }));
      },
    });

    cleanupRef.current = cleanup;
    return cleanup;
  }, [
    params?.startSample,
    params?.windowSamples,
    params?.channelIndices?.join(","),
    appendChunk,
  ]);

  return state;
}
