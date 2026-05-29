"""EDF data service using MNE-Python.

Encapsulates all MNE I/O operations so the gRPC servicer remains
thin and testable. All methods are synchronous (MNE is sync-only);
call them from a thread executor inside async servicers.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Generator

import mne
import numpy as np

logger = logging.getLogger(__name__)

# EEG-like channel types that should be converted V → µV (×1e6)
_MICRO_VOLT_TYPES = {"eeg", "eog", "emg", "ecg", "seeg", "ecog", "dbs"}


def _scale_for_type(ch_type: str) -> float:
    """Return the display scale multiplier for a channel type.

    EEG/EOG/EMG channels are stored in Volts; multiply by 1e6 to get µV.
    All other types (respiratory, temperature, events, etc.) are kept as-is.
    """
    return 1e6 if ch_type.lower() in _MICRO_VOLT_TYPES else 1.0


class EDFService:
    """Reads an EDF file via MNE and provides chunked data access.

    The raw object is loaded once (lazy) and reused across calls.
    MNE is inherently synchronous, so all methods here are sync;
    wrap them with ``asyncio.to_thread`` in async contexts.
    """

    def __init__(self, file_path: str) -> None:
        self._file_path: str = file_path
        self._raw: mne.io.BaseRaw | None = None
        # Per-channel DC offset (mean of first 10 s) — used for DC removal
        self._dc_offsets: dict[int, float] = {}

    # ── Private helpers ──────────────────────────────────────────────────────

    def _load(self) -> mne.io.BaseRaw:
        """Lazy-load the EDF raw object (preload=False for memory efficiency)."""
        if self._raw is None:
            resolved = Path(self._file_path)
            if not resolved.is_absolute():
                # Try relative to the project root (one level up from backend/)
                root = Path(__file__).resolve().parents[3]
                resolved = root / self._file_path
            if not resolved.exists():
                raise FileNotFoundError("EDF file not found: %s" % resolved)
            logger.info("Loading EDF file: %s", resolved)
            self._raw = mne.io.read_raw_edf(str(resolved), preload=False, verbose=False)
            logger.info(
                "EDF loaded — %d channels, %.1f Hz, %.1f s",
                len(self._raw.ch_names),
                self._raw.info["sfreq"],
                self._raw.times[-1],
            )
        return self._raw

    def _get_dc_offset(self, raw: mne.io.BaseRaw, pick_idx: int) -> float:
        """Compute (and cache) the DC offset for a channel.

        Uses the mean of the first 10 seconds so that the waveform
        oscillates around zero regardless of the signal baseline.
        """
        if pick_idx not in self._dc_offsets:
            n_cal = min(int(raw.info["sfreq"] * 10), raw.n_times)
            data, _ = raw[[pick_idx], :n_cal]  # type: ignore[index]
            self._dc_offsets[pick_idx] = float(data.mean())
        return self._dc_offsets[pick_idx]

    # ── Public API ───────────────────────────────────────────────────────────

    def get_metadata(self) -> dict:
        """Return file-level metadata as a plain dict.

        Returns:
            Dict with keys: channels, sfreq, n_samples,
            duration_seconds, subject_info, annotations.
        """
        raw = self._load()
        info = raw.info

        channels = []
        for idx, ch_name in enumerate(raw.ch_names):
            ch_type = mne.channel_type(info, idx)
            unit = str(info["chs"][idx].get("unit", ""))
            lo = float(info["chs"][idx].get("lowpass") or 0.0)
            hi = float(info["chs"][idx].get("highpass") or 0.0)
            scale = _scale_for_type(ch_type)
            channels.append(
                {
                    "name": ch_name,
                    "type": ch_type,
                    "unit": "µV" if scale == 1e6 else unit,
                    "low_freq": lo,
                    "high_freq": hi,
                    "scale": scale,   # client uses this to convert raw values
                }
            )

        subject_info = ""
        if info.get("subject_info"):
            si = info["subject_info"]
            parts = [si.get("first_name", ""), si.get("last_name", "")]
            subject_info = " ".join(p for p in parts if p)

        annotation_strs: list[str] = []
        if raw.annotations is not None:
            for ann in raw.annotations:
                annotation_strs.append(
                    "%.2fs: %s (%.2fs)" % (ann["onset"], ann["description"], ann["duration"])
                )

        return {
            "channels": channels,
            "sfreq": float(info["sfreq"]),
            "n_samples": int(raw.n_times),
            "duration_seconds": float(raw.times[-1]),
            "subject_info": subject_info,
            "annotations": annotation_strs,
        }

    def stream_window(
        self,
        start_sample: int,
        chunk_size: int,
        window_samples: int,
        channel_indices: list[int],
    ) -> Generator[dict, None, None]:
        """Yield chunks of EDF data as plain dicts.

        Data is:
          1. DC-removed (subtract per-channel mean of first 10 s)
          2. Scaled per channel type (EEG/EOG/EMG: ×1e6 → µV; others: ×1)

        Args:
            start_sample:    First sample to read (0-based, absolute).
            chunk_size:      Samples per channel per chunk.
            window_samples:  Total samples to cover. 0 = to end of file.
            channel_indices: Which channels to include (empty = all).

        Yields:
            Dict with keys: samples (bytes), n_channels, n_samples,
            start_sample, chunk_index, is_last, channel_names, sfreq.
        """
        raw = self._load()
        info = raw.info
        total_file_samples = raw.n_times

        # Resolve channel selection
        all_indices = list(range(len(raw.ch_names)))
        picks = channel_indices if channel_indices else all_indices
        picks = [i for i in picks if 0 <= i < len(raw.ch_names)]
        channel_names = [raw.ch_names[i] for i in picks]
        sfreq = float(info["sfreq"])

        # Pre-compute DC offsets and scale factors for selected channels
        dc_offsets = np.array(
            [self._get_dc_offset(raw, i) for i in picks], dtype=np.float32
        )
        scale_factors = np.array(
            [_scale_for_type(mne.channel_type(info, i)) for i in picks],
            dtype=np.float32,
        )

        # Resolve window end
        if window_samples <= 0:
            end_sample = total_file_samples
        else:
            end_sample = min(start_sample + window_samples, total_file_samples)

        chunk_index = 0
        cursor = start_sample

        while cursor < end_sample:
            chunk_end = min(cursor + chunk_size, end_sample)
            is_last = chunk_end >= end_sample

            # MNE returns shape (n_channels, n_times)
            data, _ = raw[picks, cursor:chunk_end]  # type: ignore[index]
            data_f32: np.ndarray = data.astype(np.float32)

            # DC removal: subtract per-channel mean baseline
            data_f32 -= dc_offsets[:, np.newaxis]

            # Apply per-channel scale (V → µV for EEG, ×1 for others)
            data_f32 *= scale_factors[:, np.newaxis]

            yield {
                "samples": data_f32.tobytes(),
                "n_channels": len(picks),
                "n_samples": int(data_f32.shape[1]),
                "start_sample": cursor,
                "chunk_index": chunk_index,
                "is_last": is_last,
                # Metadata only on first chunk — saves bandwidth
                "channel_names": channel_names if chunk_index == 0 else [],
                "sfreq": sfreq if chunk_index == 0 else 0.0,
            }

            cursor = chunk_end
            chunk_index += 1
