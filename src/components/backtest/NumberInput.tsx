"use client";

/**
 * Number input с возможностью полностью очистить поле без сваливания в 0.
 *
 * Зачем: нативный `<input type="number" value={n} onChange={Number(...)}>` при
 * backspace последней цифры превращает `""` → `Number("")` → `0`, и пользователь
 * видит «0», который не стирается. Чтобы сменить 0 на 250, приходится писать
 * «0250» и потом удалять «0» спереди — очень раздражает.
 *
 * Этот компонент держит локальный `draft` (строка). Пока пользователь набирает,
 * наружу пробрасываются только корректные конечные числа. Очистка поля просто
 * оставляет `draft = ""` и подсвечивает поле красным — родителю ничего не
 * приходит (его значение остаётся последним валидным).
 *
 * Внешняя смена value (например, переключение пресета) синхронизирует draft —
 * кроме случая, когда draft пустой (пользователь явно очистил → не затираем).
 */

import { useEffect, useRef, useState } from "react";

type NumberInputProps = {
  value: number;
  onValueChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number | string;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  /** ARIA / autosave-name. */
  name?: string;
  /** title / tooltip пробрасывается на нативный input (для дизейбла объяснения). */
  title?: string;
  /** Inputmode для мобилок (по умолчанию decimal). */
  inputMode?: "numeric" | "decimal";
};

function format(n: number): string {
  if (!Number.isFinite(n)) return "";
  return String(n);
}

export function NumberInput({
  value,
  onValueChange,
  min,
  max,
  step,
  className,
  disabled,
  placeholder,
  id,
  name,
  title,
  inputMode = "decimal",
}: NumberInputProps) {
  const [draft, setDraft] = useState<string>(() => format(value));
  /** Последний draft, который мы сами сгенерировали из onChange — чтобы внешний sync не дрался с локальным набором. */
  const lastEmitRef = useRef<number>(value);

  useEffect(() => {
    /**
     * Внешнее значение изменилось. Синхронизируем draft, но НЕ затираем
     * пользовательский пустой draft (он сам только что почистил поле).
     * Также игнорим случай, когда parent просто отзеркалил наш же emit.
     */
    if (draft === "") return;
    if (lastEmitRef.current === value) return;
    const parsed = Number(draft);
    if (Number.isFinite(parsed) && Math.abs(parsed - value) < 1e-9) return;
    setDraft(format(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const isEmpty = draft === "" || draft === "-" || draft === ".";
  const invalidCls = isEmpty
    ? " !border-rose-500 !ring-1 !ring-rose-500/40 !bg-rose-500/[0.06]"
    : "";

  return (
    <input
      type="number"
      inputMode={inputMode}
      id={id}
      name={name}
      disabled={disabled}
      placeholder={placeholder}
      title={
        title ??
        (isEmpty ? "Введи число — без значения бэктест не запустится." : undefined)
      }
      min={min}
      max={max}
      step={step}
      value={draft}
      aria-invalid={isEmpty || undefined}
      className={(className ?? "") + invalidCls}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        if (raw === "" || raw === "-" || raw === ".") return;
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        lastEmitRef.current = n;
        onValueChange(n);
      }}
    />
  );
}
