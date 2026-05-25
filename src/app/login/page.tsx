"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Lock, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Кастомная страница ввода пароля. Single-field (только пароль),
 * brand-стиль gold/ink. После успешного логина — redirect на ?next=<path>
 * или на /portfolio по default.
 *
 * useSearchParams() требует Suspense boundary — поэтому форма вынесена
 * в отдельный компонент, обёрнутый в Suspense.
 */
export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-deep)] text-ink flex items-center justify-center px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none fixed -right-32 -top-32 h-72 w-72 rounded-full bg-brand-glow opacity-50 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed -bottom-24 left-1/4 h-56 w-56 rounded-full bg-[rgba(201,169,98,0.10)] blur-3xl"
      />

      <main className="relative w-full max-w-md">
        {/* π монограмма */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-brand/30 bg-surface backdrop-blur-xl shadow-card">
            <span className="font-display text-2xl font-semibold text-brand-light">
              π
            </span>
          </div>
          <p className="eyebrow flex items-center gap-2">
            <Lock size={11} className="text-brand-light/70" />
            Pifagor Fund · Portfolio Research
          </p>
        </div>

        <Suspense fallback={<LoginFormFallback />}>
          <LoginForm />
        </Suspense>

        <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-ink-faint">
          Внутренний инструмент · не публичная финансовая рекомендация
        </p>
      </main>
    </div>
  );
}

function LoginFormFallback() {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface p-8 backdrop-blur-xl shadow-card">
      <div className="h-24 animate-pulse rounded-md bg-white/[0.04]" />
    </div>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/portfolio";

  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inIframe, setInIframe] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Детект iframe-embed. Если платформа загружена внутри другого сайта
    // (admin-hub фонда через iframe), браузер блокирует third-party cookies
    // — auth не сработает. Делаем breakout: пытаемся переписать window.top,
    // если cross-origin запрещает — показываем кнопку «Открыть в новой
    // вкладке».
    if (typeof window !== "undefined" && window.self !== window.top) {
      setInIframe(true);
      try {
        // Same-origin iframe — можем выйти автоматически
        if (window.top) {
          window.top.location.href = window.location.href;
          return;
        }
      } catch {
        // Cross-origin — top.location недоступен. Покажем UI с кнопкой.
      }
    }
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        // Гарантируем, что Set-Cookie из ответа применяется к текущему origin.
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error || "Неверный пароль");
        setSubmitting(false);
        return;
      }
      // Полный page reload — гарантирует что cookie применилась и
      // middleware на следующем запросе её увидит. router.push давал
      // race condition (cookie set, но Next.js RSC fetch уходил параллельно
      // и иногда успевал ДО применения cookie → редирект обратно на /login,
      // кнопка зависала на «Проверка…»).
      const safe = nextPath.startsWith("/") ? nextPath : "/portfolio";
      window.location.assign(safe);

      // Фоллбек: если через 3 сек страница не сменилась — значит
      // browser отверг cookie (private mode, content blocker, и т.д.).
      // Сбрасываем кнопку и показываем ошибку.
      setTimeout(() => {
        setSubmitting(false);
        setError(
          "Браузер не принял cookie. Проверь настройки приватности или попробуй другой браузер.",
        );
      }, 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Сетевая ошибка");
      setSubmitting(false);
    }
  };

  // Платформа открыта в cross-origin iframe (admin-hub) — auth не сработает
  // из-за блокировки third-party cookies. Показываем кнопку «Открыть в
  // новой вкладке» вместо формы.
  if (inIframe) {
    return (
      <div className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.04] p-8 backdrop-blur-xl shadow-card">
        <h1 className="font-display text-2xl font-semibold tracking-display-tight text-ink">
          Открой в{" "}
          <span className="accent-serif text-brand-light">новой вкладке</span>
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Платформа загружена внутри другого сайта (iframe). Браузер блокирует
          вход из-за политики безопасности (third-party cookies).
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          Нажми кнопку — откроется в отдельной вкладке, где вход работает.
        </p>
        <a
          href={typeof window !== "undefined" ? window.location.href : "/login"}
          target="_top"
          rel="noopener"
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-md border border-amber-400/50 bg-amber-400/10 px-4 py-2.5 font-mono text-xs uppercase tracking-[0.22em] text-amber-200 transition hover:border-amber-400/70 hover:bg-amber-400/20"
        >
          Открыть в новой вкладке
          <ArrowRight size={12} />
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-surface-border bg-surface p-8 backdrop-blur-xl shadow-card">
      <h1 className="font-display text-2xl font-semibold tracking-display-tight text-ink">
        Введите{" "}
        <span className="accent-serif text-brand-light">пароль</span>
      </h1>
      <p className="mt-2 text-sm text-ink-muted">
        Это закрытая research-площадка фонда. Доступ — только для админов.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <div>
          <label
            htmlFor="password"
            className="block font-mono text-[10px] uppercase tracking-[0.22em] text-ink-faint"
          >
            Пароль
          </label>
          <input
            ref={inputRef}
            id="password"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError(null);
            }}
            autoComplete="current-password"
            disabled={submitting}
            className="mt-2 w-full rounded-md border border-surface-border bg-white/[0.04] px-3 py-2.5 font-mono text-sm text-ink placeholder-ink-faint/60 focus:border-brand/60 focus:outline-none focus:ring-1 focus:ring-brand/40 disabled:opacity-50"
            placeholder="••••••••••••"
          />
        </div>

        {error && (
          <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !password}
          className="mt-2 inline-flex items-center justify-center gap-2 rounded-md border border-brand/40 bg-brand/10 px-4 py-2.5 font-mono text-xs uppercase tracking-[0.22em] text-brand-light transition hover:border-brand/60 hover:bg-brand/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Проверка…" : "Войти"}
          {!submitting && <ArrowRight size={12} />}
        </button>
      </form>
    </div>
  );
}
