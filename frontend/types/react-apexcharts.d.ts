// Type augmentation for the ApexCharts global (available after react-apexcharts loads)
// and module declaration for react-apexcharts

declare module "react-apexcharts" {
  import { Component } from "react";

  interface ApexChartProps {
    type?:
      | "line"
      | "area"
      | "bar"
      | "pie"
      | "donut"
      | "scatter"
      | "bubble"
      | "heatmap"
      | "candlestick"
      | "radar"
      | "polarArea"
      | "rangeBar"
      | "rangeArea"
      | "treemap";
    series?: ApexAxisChartSeries | ApexNonAxisChartSeries;
    width?: string | number;
    height?: string | number;
    options?: ApexCharts.ApexOptions;
    [key: string]: unknown;
  }

  export default class ReactApexChart extends Component<ApexChartProps> {}
}
