"use client";

/**
 * ChannelSelector — multi-select list of EDF channels.
 */

import { memo } from "react";
import type { ChannelInfo } from "@/proto/edf_stream";

interface ChannelSelectorProps {
  channels: ChannelInfo[];
  selectedIndices: number[];
  onChange: (indices: number[]) => void;
  maxVisible?: number;
}

const TYPE_COLORS: Record<string, string> = {
  eeg: "badge-eeg",
  eog: "badge-eog",
  emg: "badge-emg",
  ecg: "badge-ecg",
  misc: "badge-misc",
};

export const ChannelSelector = memo(function ChannelSelector({
  channels,
  selectedIndices,
  onChange,
}: ChannelSelectorProps) {
  const toggle = (idx: number) => {
    if (selectedIndices.includes(idx)) {
      onChange(selectedIndices.filter((i) => i !== idx));
    } else {
      onChange([...selectedIndices, idx]);
    }
  };

  const selectAll = () => onChange(channels.map((_, i) => i));
  const clearAll = () => onChange([]);

  const groupedByType = channels.reduce<Record<string, { ch: ChannelInfo; idx: number }[]>>(
    (acc, ch, idx) => {
      const t = ch.type || "misc";
      (acc[t] ??= []).push({ ch, idx });
      return acc;
    },
    {}
  );

  return (
    <div className="channel-selector">
      <div className="channel-selector__header">
        <h3 className="channel-selector__title">Channels</h3>
        <div className="channel-selector__actions">
          <button className="btn-text" onClick={selectAll}>All</button>
          <span className="divider">|</span>
          <button className="btn-text" onClick={clearAll}>None</button>
        </div>
      </div>

      <div className="channel-selector__count">
        {selectedIndices.length} / {channels.length} selected
      </div>

      <div className="channel-selector__list">
        {Object.entries(groupedByType).map(([type, items]) => (
          <div key={type} className="channel-group">
            <div className="channel-group__label">
              <span className={`badge ${TYPE_COLORS[type] ?? "badge-misc"}`}>
                {type.toUpperCase()}
              </span>
            </div>
            {items.map(({ ch, idx }) => (
              <label key={idx} className="channel-item">
                <input
                  id={`channel-${idx}`}
                  type="checkbox"
                  checked={selectedIndices.includes(idx)}
                  onChange={() => toggle(idx)}
                  className="channel-item__checkbox"
                />
                <span className="channel-item__name">{ch.name}</span>
                {ch.unit && (
                  <span className="channel-item__unit">{ch.unit}</span>
                )}
              </label>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
});
