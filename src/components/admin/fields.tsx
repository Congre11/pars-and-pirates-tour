'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Inputs that save as you type.
 *
 * Admin screens have no Save button anywhere: each field debounces and writes
 * itself, showing a brief tick. That suits the actual usage — a captain
 * fixing one handicap on a phone between holes — far better than a form.
 */

function useDebouncedSave<T>(value: T, save: (value: T) => Promise<void> | void, delay = 600) {
  const [local, setLocal] = useState<T>(value);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [dirty, setDirty] = useState(false);
  const [lastSeen, setLastSeen] = useState<T>(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adopt changes that arrive from elsewhere (realtime, another captain), but
  // never stomp on what is being typed right now. Adjusting state during
  // render is React's documented way to react to a changed prop.
  if (lastSeen !== value) {
    setLastSeen(value);
    if (!dirty) setLocal(value);
  }

  const onChange = (next: T) => {
    setDirty(true);
    setLocal(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setState('saving');
      try {
        await save(next);
        setState('saved');
        setDirty(false);
        setTimeout(() => setState('idle'), 1200);
      } catch {
        setState('error');
      }
    }, delay);
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { local, onChange, state };
}

function StateDot({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (state === 'idle') return null;
  return (
    <span
      className={`text-xs font-bold ${
        state === 'error' ? 'text-pirate-300' : state === 'saved' ? 'text-fairway-300' : 'text-chalk-500'
      }`}
    >
      {state === 'saving' ? '…' : state === 'saved' ? '✓' : '!'}
    </span>
  );
}

export function TextField({
  label,
  value,
  onSave,
  placeholder,
  hint,
  type = 'text',
  inputMode,
}: {
  label: string;
  value: string;
  onSave: (value: string) => Promise<void> | void;
  placeholder?: string;
  hint?: string;
  type?: string;
  inputMode?: 'text' | 'numeric' | 'decimal' | 'url';
}) {
  const { local, onChange, state } = useDebouncedSave(value, onSave);
  return (
    <label className="block">
      <span className="label mb-1 flex items-center justify-between">
        {label}
        <StateDot state={state} />
      </span>
      <input
        className="field"
        value={local}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <span className="mt-1 block text-xs text-chalk-500">{hint}</span>}
    </label>
  );
}

export function NumberField({
  label,
  value,
  onSave,
  step = 1,
  min,
  max,
  hint,
  allowEmpty = false,
}: {
  label: string;
  value: number | null;
  onSave: (value: number | null) => Promise<void> | void;
  step?: number;
  min?: number;
  max?: number;
  hint?: string;
  allowEmpty?: boolean;
}) {
  const { local, onChange, state } = useDebouncedSave(value === null ? '' : String(value), (next) => {
    if (next.trim() === '') return onSave(allowEmpty ? null : 0);
    const parsed = Number(next);
    if (!Number.isFinite(parsed)) return;
    return onSave(parsed);
  });

  return (
    <label className="block">
      <span className="label mb-1 flex items-center justify-between">
        {label}
        <StateDot state={state} />
      </span>
      <input
        className="field tabular"
        value={local}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <span className="mt-1 block text-xs text-chalk-500">{hint}</span>}
    </label>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onSave,
  hint,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onSave: (value: T) => Promise<void> | void;
  hint?: string;
}) {
  const { local, onChange, state } = useDebouncedSave(value, onSave, 0);
  return (
    <label className="block">
      <span className="label mb-1 flex items-center justify-between">
        {label}
        <StateDot state={state} />
      </span>
      <select className="field" value={local} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && <span className="mt-1 block text-xs text-chalk-500">{hint}</span>}
    </label>
  );
}

export function ToggleField({
  label,
  value,
  onSave,
  hint,
}: {
  label: string;
  value: boolean;
  onSave: (value: boolean) => Promise<void> | void;
  hint?: string;
}) {
  const [local, setLocal] = useState(value);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSeen, setLastSeen] = useState(value);

  // Pick up a change made elsewhere without an effect round trip.
  if (lastSeen !== value) {
    setLastSeen(value);
    setLocal(value);
  }

  const toggle = async () => {
    const next = !local;
    setLocal(next);
    setState('saving');
    try {
      await onSave(next);
      setState('saved');
      setTimeout(() => setState('idle'), 1200);
    } catch {
      setLocal(!next);
      setState('error');
    }
  };

  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-chalk-500">{hint}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <StateDot state={state} />
        <button
          type="button"
          role="switch"
          aria-checked={local}
          aria-label={label}
          onClick={toggle}
          className={`tap relative h-7 w-12 rounded-full transition-colors ${
            local ? 'bg-fairway-500' : 'bg-white/15'
          }`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${
              local ? 'left-6' : 'left-1'
            }`}
          />
        </button>
      </span>
    </div>
  );
}

/** Collapsible card, used to keep long admin lists navigable on a phone. */
export function Accordion({
  title,
  subtitle,
  badge,
  children,
  defaultOpen = false,
}: {
  title: string;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="tap flex w-full items-center gap-3 px-3.5 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{title}</span>
          {subtitle && <span className="block truncate text-xs text-chalk-500">{subtitle}</span>}
        </span>
        {badge}
        <span className={`text-chalk-500 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden>
          ›
        </span>
      </button>
      {open && <div className="space-y-3 border-t border-white/6 px-3.5 py-3.5">{children}</div>}
    </div>
  );
}
