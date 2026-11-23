/**
 * ============================================================
 *  © 2026 Hover Business Services LLP — a brand of Hover Business Services LLP
 * Original Author: BTPL Engineering Team
 * Website: https://hoverbusinessservices.com
 * Contact: info@hovermedia.in
 *
  
 *
  
 * ============================================================
 */

import { useTranslation } from "@/lib/i18n";
import { useRef } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

/** Fixed colour per series (validated categorical slots; failed = red). */
export const MESSAGE_SERIES = [
  { key: "sent", labelKey: "dashboard.sent", color: "#2a78d6" },
  { key: "delivered", labelKey: "dashboard.delivered", color: "#1baf7a" },
  { key: "read", labelKey: "dashboard.read", color: "#6250d6" },
  { key: "failed", labelKey: "dashboard.failed", color: "#e34948" },
] as const;

interface MessageChartProps {
  data: Array<{
    date: string;
    sent?: number;
    delivered?: number;
    read?: number;
    failed?: number;
  }>;
}

export function MessageChart({ data }: MessageChartProps) {
  const { t } = useTranslation();
  const chartRef = useRef<ChartJS<"line">>(null);

  const line = (label: string, key: "sent" | "delivered" | "read" | "failed", color: string) => ({
    label,
    data: data.map((d) => d[key] ?? 0),
    borderColor: color,
    backgroundColor: color,
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 5,
    pointHitRadius: 12,
    pointBackgroundColor: color,
    pointBorderColor: "#fff",
    pointBorderWidth: 2,
    tension: 0.35,
    fill: false,
  });

  const chartData: ChartData<"line"> = {
    labels: data.map((d) => d.date),
    datasets: MESSAGE_SERIES.map((s) => line(t(s.labelKey), s.key, s.color)),
  };

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index",
      intersect: false,
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: "rgba(17, 17, 17, 0.9)",
        titleFont: { size: 12, weight: 600 },
        bodyFont: { size: 12 },
        padding: 10,
        cornerRadius: 8,
        boxWidth: 8,
        boxHeight: 8,
        usePointStyle: true,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: {
          font: { size: 11 },
          color: "#8a8986",
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 8,
        },
      },
      y: {
        beginAtZero: true,
        grid: { color: "rgba(120, 120, 120, 0.12)" },
        border: { display: false },
        ticks: {
          font: { size: 11 },
          color: "#8a8986",
          precision: 0,
          maxTicksLimit: 5,
        },
      },
    },
  };

  return (
    <div className="w-full" style={{ height: "280px" }}>
      <Line ref={chartRef} data={chartData} options={options} />
    </div>
  );
}
