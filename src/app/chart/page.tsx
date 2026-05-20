import { TradingShell } from "@/components/layout/TradingShell";

// Force dynamic — иначе middleware (Basic Auth) пропускается на cached prerender.
export const dynamic = "force-dynamic";

/** Полноэкранный график: OHLCV и разметка сделок подставляются из бэктеста («График со сделками»). */
export default function ChartPage() {
  return <TradingShell />;
}
