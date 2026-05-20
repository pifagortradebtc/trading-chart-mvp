import { MPTSimulator } from "@/components/portfolio/MPTSimulator";

export const metadata = {
  title: "Portfolio Research · Markowitz",
  description:
    "Симулятор Modern Portfolio Theory: efficient frontier, Max Sharpe / Max Sortino / Min Volatility, ограничения долей, до 100 000 симуляций. Данные — Binance Spot.",
};

// Force dynamic rendering. Иначе Next.js prerender'ит страницу и
// раздаёт через CDN с x-nextjs-cache: HIT — middleware (Basic Auth)
// в этом случае пропускается.
export const dynamic = "force-dynamic";

export default function Page() {
  return <MPTSimulator />;
}
