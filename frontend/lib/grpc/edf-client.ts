/**
 * EDF API client — communicates with the FastAPI SSE + REST endpoints.
 *
 * Why SSE instead of raw gRPC in the browser?
 * Browsers cannot speak raw gRPC (HTTP/2 binary framing). The backend
 * exposes:
 *   GET /api/v1/edf/metadata   → JSON
 *   GET /api/v1/edf/stream     → Server-Sent Events (JSON per chunk)
 *
 * This client wraps both endpoints with typed responses that match the
 * proto schema defined in /proto/edf_stream.ts.
 */

import type {
  EDFMetadataResponse,
  StreamEDFRequest,
  ParsedEDFChunk,
} from "@/proto/edf_stream";

const BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function fetchEDFMetadata(): Promise<EDFMetadataResponse> {
  const res = await fetch(`${BASE_URL}/api/v1/edf/metadata`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Metadata fetch failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  // Backend wraps in { status, message, data }
  return json.data as EDFMetadataResponse;
}

// ─── Streaming ────────────────────────────────────────────────────────────────

export interface StreamOptions extends Pick<StreamEDFRequest, "start_sample" | "chunk_size" | "window_samples" | "channel_indices"> {
  onChunk: (chunk: ParsedEDFChunk) => void;
  onComplete?: () => void;
  onError?: (err: Error) => void;
  signal?: AbortSignal;
}

/**
 * Open an SSE stream from the backend and call `onChunk` for each received
 * data chunk. The chunk's `samples` bytes are decoded into Float32Arrays
 * (one per channel).
 *
 * @returns A cleanup function that aborts the stream.
 */
export function streamEDFWindow(opts: StreamOptions): () => void {
  const {
    start_sample = 0,
    chunk_size = 2048,
    window_samples = 0,
    channel_indices = [],
    onChunk,
    onComplete,
    onError,
    signal,
  } = opts;

  const params = new URLSearchParams({
    start_sample: String(start_sample),
    chunk_size: String(chunk_size),
    window_samples: String(window_samples),
    channel_indices: channel_indices.join(","),
  });

  const url = `${BASE_URL}/api/v1/edf/stream?${params}`;
  const controller = new AbortController();

  // Merge with external signal
  if (signal) {
    signal.addEventListener("abort", () => controller.abort());
  }

  // Cache channel names + sfreq from first chunk
  let cachedChannelNames: string[] = [];
  let cachedSfreq = 0;

  (async () => {
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "text/event-stream" },
      });

      if (!res.ok || !res.body) {
        throw new Error(`Stream failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(raw);
          } catch {
            continue;
          }

          if (payload.error) {
            onError?.(new Error(String(payload.error)));
            return;
          }

          // Decode base64 samples → Float32Array per channel
          const b64 = payload.samples as string;
          const binary = atob(b64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          const floats = new Float32Array(bytes.buffer);

          const nChannels = payload.n_channels as number;
          const nSamples = payload.n_samples as number;

          // Split flat array into per-channel arrays
          const channelData: Float32Array[] = [];
          for (let c = 0; c < nChannels; c++) {
            channelData.push(floats.slice(c * nSamples, (c + 1) * nSamples));
          }

          // Cache channel metadata from first chunk
          if ((payload.chunk_index as number) === 0) {
            cachedChannelNames = payload.channel_names as string[];
            cachedSfreq = payload.sfreq as number;
          }

          const parsed: ParsedEDFChunk = {
            data: channelData,
            channelNames: cachedChannelNames,
            sfreq: cachedSfreq,
            startSample: payload.start_sample as number,
            chunkIndex: payload.chunk_index as number,
            isLast: payload.is_last as boolean,
          };

          onChunk(parsed);

          if (parsed.isLast) {
            onComplete?.();
            return;
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    }
  })();

  return () => controller.abort();
}
