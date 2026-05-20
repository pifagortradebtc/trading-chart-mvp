import Link from "next/link";
import { ArrowRight, Layers, Sparkles } from "lucide-react";
import { PifagorFundHeader } from "@/components/PifagorFundHeader";

export const metadata = {
  title: "Pifagor Fund · Кабинет аналитики",
  description:
    "Кабинет аналитики Pifagor Fund — портфельные модели Markowitz / Black-Litterman + DCA-бэктест стратегий фонда.",
};

// Force dynamic rendering — иначе Next.js prerender'ит страницу, и CDN
// раздаёт её с `x-nextjs-cache: HIT` БЕЗ запуска middleware (Basic Auth).
export const dynamic = "force-dynamic";

/**
 * Landing-страница кабинета аналитики. Видна по адресу `/` — первое, что
 * получает инвестор. Минималистичная: шапка фонда, hero с фразой про
 * количественный подход, две карточки-входа (Бэктест и Портфель), мелкий
 * дисклеймер. Никакого редиректа — инвестор сам выбирает раздел.
 */
export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--bg-deep)] text-ink">
      <PifagorFundHeader />

      <main className="mx-auto max-w-[1100px] px-4 py-12 sm:px-8 sm:py-16">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-32 -top-32 h-72 w-72 rounded-full bg-brand-glow opacity-60 blur-3xl animate-aurora-drift"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-24 left-1/4 h-56 w-56 rounded-full bg-[rgba(201,169,98,0.10)] blur-3xl"
          />

          <div className="relative">
            <p className="eyebrow flex items-center gap-3">
              <span className="pulse-dot" aria-hidden />
              Pifagor Fund · Кабинет аналитики
            </p>
            <h1 className="mt-5 font-display font-semibold leading-[1.02] tracking-display-tighter text-ink"
                style={{ fontSize: "clamp(2.2rem, 6.4vw, 4.4rem)" }}>
              <span className="block">Криптофонд для тех,</span>
              <span className="block">
                кто <span className="accent-serif text-brand-light">считает</span>,
              </span>
              <span className="block">а не угадывает.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-ink-muted sm:text-lg">
              Два внутренних research-инструмента фонда: симулятор аллокации
              капитала (Black-Litterman + risk caps + CVaR-защита) и
              исторический бэктест DCA-стратегий. Не публичный продукт.
            </p>
          </div>
        </section>

        {/* CTA cards */}
        <section className="relative mt-12 grid grid-cols-1 gap-5 sm:mt-16 md:grid-cols-2">
          <EntryCard
            href="/portfolio"
            icon={<Sparkles size={18} className="text-brand" />}
            eyebrow="Markowitz · Black-Litterman"
            title="Кабинет аналитики"
            body="14 моделей построения портфеля, ограничения долей фонда, CVaR-стресс-тест и итоговая рекомендованная аллокация. Экспорт JSON и PDF."
            primary
          />
          <EntryCard
            href="/backtest"
            icon={<Layers size={18} className="text-brand-light" />}
            eyebrow="V2 ЧайкКельт · Pifagor ALTS"
            title="Бэктест стратегий"
            body="Исследовательский терминал для DCA и Pifagor ALTS на исторических OHLCV. Метрики качества, Monte-Carlo, walk-forward, портфельный режим."
          />
        </section>

        {/* Hairline */}
        <div className="mt-16 hairline" aria-hidden />

        {/* Footer */}
        <footer className="mt-8 text-xs text-ink-faint">
          <p className="font-mono uppercase tracking-[0.18em]">
            Внутренний инструмент · не публичная финансовая рекомендация
          </p>
        </footer>
      </main>
    </div>
  );
}

function EntryCard({
  href,
  icon,
  eyebrow,
  title,
  body,
  primary,
}: {
  href: string;
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  body: string;
  primary?: boolean;
}) {
  const ring = primary
    ? "border-brand/40 shadow-glow"
    : "border-surface-border";
  return (
    <Link
      href={href}
      className={`group relative flex flex-col gap-3 rounded-2xl border bg-surface p-6 backdrop-blur-xl shadow-card transition hover:border-brand/40 hover:shadow-card-hover ${ring}`}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-faint">
          {eyebrow}
        </span>
      </div>
      <h2 className="font-display text-2xl font-semibold tracking-display-tight text-ink">
        {title}
      </h2>
      <p className="text-sm leading-relaxed text-ink-muted">{body}</p>
      <span className="mt-2 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-brand-light transition-transform group-hover:translate-x-0.5">
        Открыть
        <ArrowRight size={12} />
      </span>
    </Link>
  );
}
