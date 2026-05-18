"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { Data, Layout } from "plotly.js";
import type { MPTResult, PinnedPortfolio, Portfolio } from "@/lib/portfolio/types";
import { prettySymbol } from "@/lib/portfolio/format";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface Props {
  result: MPTResult;
  pinned?: PinnedPortfolio[];
  maxDisplayPoints?: number;
}

// Sharpe colorscale matched to the MVP's cyan→violet brand.
const SHARPE_COLORSCALE: [number, string][] = [
  [0.0, "#0c1a2c"],
  [0.25, "#1f3f6f"],
  [0.5, "#22d3ee"],
  [0.7, "#7c3aed"],
  [0.85, "#a78bfa"],
  [1.0, "#f5f3ff"],
];

export function FrontierChart({
  result,
  pinned = [],
  maxDisplayPoints = 5000,
}: Props) {
  const traces = useMemo<Data[]>(() => {
    const sampled = sample(result.portfolios, maxDisplayPoints, 1337);

    const cloud: Data = {
      type: "scatter",
      mode: "markers",
      x: sampled.map((p) => p.volatility),
      y: sampled.map((p) => p.return),
      marker: {
        size: 4,
        color: sampled.map((p) => p.sharpe),
        colorscale: SHARPE_COLORSCALE,
        showscale: true,
        opacity: 0.85,
        colorbar: {
          title: { text: "Sharpe", font: { color: "#d4d4d8", size: 11 } },
          tickfont: { color: "#a1a1aa", size: 10 },
          thickness: 10,
          len: 0.55,
          x: 1.02,
          xanchor: "left",
          outlinewidth: 0,
        },
      },
      hovertemplate:
        "Vol: %{x:.3f}<br>Return: %{y:.3f}<br>Sharpe: %{marker.color:.3f}<extra></extra>",
      name: "Симуляции",
    };

    const frontier: Data = {
      type: "scatter",
      mode: "lines",
      x: result.frontier.map((p) => p.volatility),
      y: result.frontier.map((p) => p.return),
      line: { color: "#4ade80", width: 2.5 },
      name: "Efficient Frontier",
      hovertemplate: "Vol: %{x:.3f}<br>Return: %{y:.3f}<extra>Frontier</extra>",
    };

    const keyTraces: Data[] = [
      markerTrace([result.minVol], "Min Volatility", "#38bdf8"),
      markerTrace([result.maxSharpe], "Max Sharpe", "#4ade80"),
      markerTrace([result.maxSortino], "Max Sortino", "#a78bfa"),
    ];

    const pinTraces: Data[] = pinned.length
      ? [
          {
            type: "scatter",
            mode: "text+markers",
            x: pinned.map((p) => p.metrics.volatility),
            y: pinned.map((p) => p.metrics.return),
            text: pinned.map((p) => p.name),
            textposition: "top center",
            textfont: { color: "#fafafa", size: 10 },
            marker: {
              size: 11,
              color: pinned.map((p) => p.color),
              symbol: "diamond",
              line: { color: "#0a0a0a", width: 1.5 },
            },
            name: "Закреплённые",
            hovertemplate:
              "%{text}<br>Vol: %{x:.3f}<br>Return: %{y:.3f}<extra></extra>",
          },
        ]
      : [];

    return [cloud, frontier, ...keyTraces, ...pinTraces];
  }, [result, pinned, maxDisplayPoints]);

  const layout = useMemo<Partial<Layout>>(
    () => ({
      autosize: true,
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { color: "#d4d4d8", family: "ui-sans-serif, system-ui" },
      margin: { l: 60, r: 20, t: 40, b: 50 },
      title: {
        text: `${result.symbols.map(prettySymbol).join(" · ")} — ${result.portfolios.length.toLocaleString("ru")} симуляций`,
        font: { size: 14, color: "#e4e4e7" },
      },
      xaxis: {
        title: { text: "Волатильность (годовая)", font: { size: 11 } },
        gridcolor: "rgba(255,255,255,0.06)",
        zerolinecolor: "rgba(255,255,255,0.1)",
        tickfont: { color: "#a1a1aa", size: 10 },
      },
      yaxis: {
        title: { text: "Ожидаемая доходность (годовая)", font: { size: 11 } },
        gridcolor: "rgba(255,255,255,0.06)",
        zerolinecolor: "rgba(255,255,255,0.1)",
        tickfont: { color: "#a1a1aa", size: 10 },
      },
      legend: {
        orientation: "h",
        x: 0,
        y: -0.18,
        bgcolor: "rgba(0,0,0,0)",
        font: { size: 11, color: "#d4d4d8" },
      },
      hoverlabel: {
        bgcolor: "#0a1020",
        bordercolor: "#3f3f46",
        font: { color: "#fafafa", size: 11 },
      },
    }),
    [result]
  );

  return (
    <Plot
      data={traces}
      layout={layout}
      useResizeHandler
      style={{ width: "100%", height: "100%" }}
      config={{
        responsive: true,
        displaylogo: false,
        modeBarButtonsToRemove: ["lasso2d", "select2d"],
      }}
    />
  );
}

function markerTrace(portfolios: Portfolio[], name: string, color: string): Data {
  return {
    type: "scatter",
    mode: "markers",
    x: portfolios.map((p) => p.volatility),
    y: portfolios.map((p) => p.return),
    marker: {
      size: 13,
      color,
      line: { color: "#0a0a0a", width: 1.5 },
      symbol: "circle",
    },
    name,
    hovertemplate: `${name}<br>Vol: %{x:.3f}<br>Return: %{y:.3f}<extra></extra>`,
  };
}

function sample<T>(arr: T[], k: number, seed: number): T[] {
  if (arr.length <= k) return arr;
  const rng = mulberry32(seed);
  const indices = new Array<number>(arr.length);
  for (let i = 0; i < arr.length; i++) indices[i] = i;
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (arr.length - i));
    const tmp = indices[i];
    indices[i] = indices[j];
    indices[j] = tmp;
  }
  const out = new Array<T>(k);
  for (let i = 0; i < k; i++) out[i] = arr[indices[i]];
  return out;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
