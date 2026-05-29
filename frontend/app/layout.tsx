import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "EDF Viewer — Real-Time gRPC EEG Signal Viewer",
  description:
    "Stream and visualise EDF biosignal data in real-time over gRPC using ConnectRPC and ApexCharts.",
  keywords: ["EDF", "EEG", "gRPC", "neuroscience", "biosignal", "real-time", "MNE"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="page-root">{children}</body>
    </html>
  );
}
