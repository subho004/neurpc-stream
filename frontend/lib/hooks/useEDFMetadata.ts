"use client";

/**
 * useEDFMetadata — fetches EDF file metadata once on mount.
 */

import { useEffect, useState } from "react";
import { fetchEDFMetadata } from "@/lib/grpc/edf-client";
import type { EDFMetadataResponse } from "@/proto/edf_stream";

export type MetadataState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: EDFMetadataResponse }
  | { status: "error"; message: string };

export function useEDFMetadata(): MetadataState {
  const [state, setState] = useState<MetadataState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    fetchEDFMetadata()
      .then((data) => {
        if (!cancelled) setState({ status: "success", data });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ status: "error", message: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
