"use client";

/**
 * MetadataPanel — displays EDF file metadata (sfreq, duration, annotations).
 */

import { memo } from "react";
import type { EDFMetadataResponse } from "@/proto/edf_stream";

interface MetadataPanelProps {
  metadata: EDFMetadataResponse;
}

export const MetadataPanel = memo(function MetadataPanel({
  metadata,
}: MetadataPanelProps) {
  const hours = Math.floor(metadata.duration_seconds / 3600);
  const mins = Math.floor((metadata.duration_seconds % 3600) / 60);
  const secs = Math.floor(metadata.duration_seconds % 60);
  const durationStr =
    hours > 0
      ? `${hours}h ${mins}m ${secs}s`
      : `${mins}m ${secs}s`;

  return (
    <aside className="metadata-panel">
      <h3 className="metadata-panel__title">Recording Info</h3>

      <dl className="metadata-grid">
        <dt>Channels</dt>
        <dd>{metadata.channels.length}</dd>

        <dt>Sample Rate</dt>
        <dd>{metadata.sfreq.toFixed(0)} Hz</dd>

        <dt>Total Samples</dt>
        <dd>{metadata.n_samples.toLocaleString()}</dd>

        <dt>Duration</dt>
        <dd>{durationStr}</dd>

        {metadata.subject_info && (
          <>
            <dt>Subject</dt>
            <dd>{metadata.subject_info}</dd>
          </>
        )}
      </dl>

      {metadata.annotations.length > 0 && (
        <div className="annotations">
          <h4 className="annotations__title">Annotations</h4>
          <ul className="annotations__list">
            {metadata.annotations.slice(0, 20).map((ann, i) => (
              <li key={i} className="annotation-item">
                {ann}
              </li>
            ))}
            {metadata.annotations.length > 20 && (
              <li className="annotation-item annotation-item--more">
                +{metadata.annotations.length - 20} more…
              </li>
            )}
          </ul>
        </div>
      )}
    </aside>
  );
});
