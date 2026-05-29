// Auto-generated TypeScript types for edf_stream.proto
// Package: edf_stream.v1
// These are hand-written to match the proto schema to avoid requiring
// buf/protoc toolchain in the frontend build.

// ─── Channel Info ────────────────────────────────────────────────────────────

export interface ChannelInfo {
  name: string;
  type: string;  // "eeg" | "eog" | "emg" | "misc"
  unit: string;
  low_freq: number;
  high_freq: number;
}

// ─── Metadata ────────────────────────────────────────────────────────────────

export interface EDFMetadataRequest {
  file_path?: string;
}

export interface EDFMetadataResponse {
  channels: ChannelInfo[];
  sfreq: number;
  n_samples: number;
  duration_seconds: number;
  subject_info: string;
  annotations: string[];
}

// ─── Streaming ───────────────────────────────────────────────────────────────

export interface StreamEDFRequest {
  start_sample: number;
  chunk_size: number;
  window_samples: number;
  channel_indices: number[];
  file_path?: string;
}

export interface EDFChunk {
  /** Flat Float32Array bytes: shape [n_channels × n_samples], row-major */
  samples: Uint8Array;
  n_channels: number;
  n_samples: number;
  start_sample: number;
  chunk_index: number;
  is_last: boolean;
  /** Only populated on chunk_index === 0 */
  channel_names: string[];
  /** Only populated on chunk_index === 0 */
  sfreq: number;
}

// ─── Parsed chunk (after client-side decoding) ───────────────────────────────

export interface ParsedEDFChunk {
  /** Shape: [n_channels][n_samples] */
  data: Float32Array[];
  channelNames: string[];
  sfreq: number;
  startSample: number;
  chunkIndex: number;
  isLast: boolean;
}
