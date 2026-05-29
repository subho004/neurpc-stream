"use client";

/**
 * WaveformChart — EEG-style stacked multi-channel chart.
 *
 * Each channel is rendered at a vertical offset so the waveforms are
 * clearly separated. The y-axis shows channel name labels at each
 * channel's baseline (zero-crossing) instead of raw numeric ticks.
 *
 * It uses explicit numeric { x, y } series data to map timestamps correctly,
 * and updates x-axis limits reactively using minX and maxX props.
 */

import dynamic from "next/dynamic";
import { memo, useId, useMemo } from "react";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
  loading: () => (
    <div className="waveform-loading">
      <div className="pulse-ring" />
      <span>Initialising chart…</span>
    </div>
  ),
});

export interface WaveformDataPoint {
  x: number;
  y: number;
}

export interface WaveformSeries {
  name: string;
  data: WaveformDataPoint[];
}

interface WaveformChartProps {
  series: WaveformSeries[];
  channelNames?: string[];
  /** Y-value at which each channel's baseline (zero) sits after offsetting. */
  channelBaselines?: number[];
  /** Current offset between channels in µV (used to set y-axis min/max). */
  offsetUV?: number;
  height?: number;
  minX: number;
  maxX: number;
}

// Distinct colours — one per channel (cycles if > 12)
const CHANNEL_COLORS = [
  "#a78bfa", // violet
  "#67e8f9", // cyan
  "#6ee7b7", // emerald
  "#fcd34d", // amber
  "#f87171", // rose
  "#818cf8", // indigo
  "#34d399", // green
  "#fb923c", // orange
  "#60a5fa", // blue
  "#e879f9", // fuchsia
  "#a3e635", // lime
  "#f472b6", // pink
];

export const WaveformChart = memo(function WaveformChart({
  series,
  channelNames = [],
  channelBaselines = [],
  offsetUV = 300,
  height = 520,
  minX,
  maxX,
}: WaveformChartProps) {
  const chartId = useId().replace(/:/g, "edf");

  // ── Chart options ────────────────────────────────────────────────────────
  const options = useMemo<ApexCharts.ApexOptions>(() => {
    const n = series.length || 1;
    const yMin = -offsetUV * 1.5; // Added extra vertical buffer space on the bottom (1.5x offset instead of 0.6x)
    const yMax = (n - 1) * offsetUV + offsetUV * 1.5; // Added extra vertical buffer space on the top (1.5x offset instead of 0.6x)

    const yAnnotations = channelBaselines.map((baseline, i) => ({
      y: baseline,
      borderColor: "rgba(255,255,255,0.10)",
      borderWidth: 1,
      strokeDashArray: 4,
      label: {
        text: channelNames[i] ?? `Ch ${i}`,
        position: "left" as const,
        offsetX: 8,
        style: {
          color: CHANNEL_COLORS[i % CHANNEL_COLORS.length],
          background: "transparent",
          fontSize: "10px",
          fontFamily: "'JetBrains Mono', monospace",
          padding: { top: 2, bottom: 2, left: 4, right: 4 },
        },
      },
    }));

    return {
      chart: {
        id: chartId,
        type: "line",
        height,
        background: "transparent",
        animations: { enabled: false },
        toolbar: { show: false },
        zoom: { enabled: true, type: "x" },
        selection: { enabled: false },
        fontFamily: "Inter, sans-serif",
        sparkline: { enabled: false },
      },
      colors: CHANNEL_COLORS,
      stroke: {
        curve: "straight",
        width: 1.2,
      },
      grid: {
        show: true,
        borderColor: "rgba(255,255,255,0.04)",
        strokeDashArray: 0,
        xaxis: { lines: { show: true } },
        yaxis: { lines: { show: false } },
        padding: { left: 80, right: 20, top: 15 },
      },
      annotations: {
        yaxis: yAnnotations,
      },
      xaxis: {
        type: "numeric",
        position: "top", // Renders the x-axis timeline at the top
        min: minX,
        max: maxX,
        tickAmount: 10,
        labels: {
          style: { colors: "#64748b", fontSize: "10px" },
          formatter: (v: string) => `${parseFloat(v).toFixed(2)}s`,
        },
        title: {
          text: "Time (s)",
          style: { color: "#475569", fontSize: "11px" },
        },
        axisBorder: { color: "rgba(255,255,255,0.06)" },
        axisTicks: { color: "rgba(255,255,255,0.06)" },
      },
      yaxis: {
        min: yMin,
        max: yMax,
        labels: {
          show: true,
          style: { colors: "#334155", fontSize: "9px" },
          formatter: () => "", // Hide numeric y ticks since channel baselines labels cover it
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      legend: {
        show: true,
        position: "top",
        horizontalAlign: "left",
        labels: { colors: "#94a3b8" },
        markers: { size: 5 },
        itemMargin: { horizontal: 10 },
        onItemClick: { toggleDataSeries: true },
        formatter: (name: string) => name,
      },
      tooltip: {
        enabled: true,
        theme: "dark",
        shared: false,
        x: {
          formatter: (v: number) => `${typeof v === "number" ? v.toFixed(3) : v}s`,
        },
        y: {
          formatter: (v: number, opts?: { seriesIndex?: number }) => {
            const baseline = channelBaselines[opts?.seriesIndex ?? 0] ?? 0;
            return `${(v - baseline).toFixed(2)} µV`;
          },
        },
      },
      dataLabels: { enabled: false },
      theme: { mode: "dark" },
    };
  }, [series.length, minX, maxX, channelNames, channelBaselines, offsetUV, height, chartId]);

  return (
    <div className="waveform-chart-wrapper">
      <ReactApexChart
        options={options}
        series={series}
        type="line"
        height={height}
      />
    </div>
  );
});
