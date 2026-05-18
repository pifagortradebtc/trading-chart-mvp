import { MPTSimulator } from "@/components/portfolio/MPTSimulator";

export const metadata = {
  title: "Portfolio Research · Markowitz",
  description:
    "Симулятор Modern Portfolio Theory: efficient frontier, Max Sharpe / Max Sortino / Min Volatility, ограничения долей, до 100 000 симуляций. Данные — Binance Spot.",
};

export default function Page() {
  return <MPTSimulator />;
}
