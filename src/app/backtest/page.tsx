import { BacktestPage } from "@/components/backtest/BacktestPage";

export const metadata = {
  title: "DCA Backtest · ЧайкКельт",
  description:
    "Бэктест DCA-бота с первым входом по индикатору V2_ЧайкКельт на исторических OHLCV.",
};

// Force dynamic — иначе middleware (Basic Auth) пропускается на cached prerender.
export const dynamic = "force-dynamic";

export default function Page() {
  return <BacktestPage />;
}
