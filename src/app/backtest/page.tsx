import { BacktestPage } from "@/components/backtest/BacktestPage";

export const metadata = {
  title: "DCA Backtest · ЧайкКельт",
  description:
    "Бэктест DCA-бота с первым входом по индикатору V2_ЧайкКельт на исторических OHLCV.",
};

export default function Page() {
  return <BacktestPage />;
}
