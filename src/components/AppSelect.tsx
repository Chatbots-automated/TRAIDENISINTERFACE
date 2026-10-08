import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

// The app's one dropdown. It is written to stand in for a native <select>: it takes the same <option> children and
// calls onChange with an object that has target.value, so existing handlers work unchanged. The list itself is
// drawn by the app (white rounded panel, soft shadow) instead of by the operating system.

const SEARCH_THRESHOLD = 9;

interface Option { value: string; label: string; disabled: boolean }

type ChangeLike = { target: { value: string }; currentTarget: { value: string } };

type AppSelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> & {
  value?: string | number | null;
  onChange?: (event: ChangeLike) => void;
  children?: React.ReactNode;
};

function textOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement(node)) return textOf((node.props as { children?: React.ReactNode }).children);
  return '';
}

function optionsFrom(children: React.ReactNode): Option[] {
  const options: Option[] = [];
  const walk = (nodes: React.ReactNode) => {
    React.Children.forEach(nodes, child => {
      if (!React.isValidElement(child)) return;
      const props = child.props as { value?: unknown; disabled?: boolean; children?: React.ReactNode };
      if (child.type === 'option') {
        const label = textOf(props.children);
        options.push({ value: String(props.value ?? label), label, disabled: Boolean(props.disabled) });
      } else {
        walk(props.children); // fragments and <optgroup>
      }
    });
  };
  walk(children);
  return options;
}

export function AppSelect({ value, onChange, children, className = '', style, disabled, title, ...rest }: AppSelectProps) {
  const options = useMemo(() => optionsFrom(children), [children]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number; width: number; maxHeight: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const current = String(value ?? '');
  const selected = options.find(option => option.value === current);
  const isPlaceholder = !selected || selected.value === '';

  const place = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const openUp = below < 180 && above > below;
    const width = Math.max(rect.width, 180);
    setPosition({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      width,
      maxHeight: Math.max(140, Math.min(320, openUp ? above : below)),
      ...(openUp ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
    });
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) { setQuery(''); return; }
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const onScroll = (event: Event) => { if (!panelRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    if (options.length >= SEARCH_THRESHOLD) setTimeout(() => searchRef.current?.focus(), 40);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
  }, [open, options.length]);

  const visible = query.trim()
    ? options.filter(option => option.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  const choose = (option: Option) => {
    if (option.disabled) return;
    setOpen(false);
    if (option.value !== current) onChange?.({ target: { value: option.value }, currentTarget: { value: option.value } });
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={rest['aria-label']}
        onClick={() => setOpen(value => !value)}
        className={`inline-flex items-center justify-between gap-1.5 text-left cursor-pointer disabled:cursor-not-allowed ${className}`}
        style={style}
      >
        <span className="min-w-0 truncate" style={isPlaceholder ? { opacity: 0.6 } : undefined}>{selected?.label ?? ''}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && position && createPortal(
        <div
          ref={panelRef}
          role="listbox"
          className="fixed z-[10060] overflow-auto bg-white rounded-macos-lg py-1"
          style={{
            left: position.left, top: position.top, bottom: position.bottom, minWidth: position.width, maxWidth: 420,
            maxHeight: position.maxHeight, border: '0.5px solid rgba(0, 0, 0, 0.1)', boxShadow: 'rgba(0, 0, 0, 0.1) 0px 8px 24px',
          }}
        >
          {options.length >= SEARCH_THRESHOLD && (
            <div className="px-2 pb-1 pt-1">
              <input
                ref={searchRef}
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Ieškoti..."
                className="h-7 w-full rounded-md px-2 text-xs outline-none"
                style={{ background: 'rgba(0,0,0,0.04)', border: '0.5px solid rgba(0,0,0,0.08)', color: '#3d3935' }}
              />
            </div>
          )}
          {visible.map(option => {
            const active = option.value === current;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                disabled={option.disabled}
                onClick={() => choose(option)}
                className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs transition-colors hover:bg-macos-gray-50 disabled:opacity-40"
                style={{ color: active ? '#007AFF' : option.value === '' ? '#8a857f' : '#3d3935', fontWeight: active ? 600 : 400 }}
              >
                <span className="min-w-0 whitespace-normal break-words">{option.label}</span>
                {active && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            );
          })}
          {visible.length === 0 && <p className="px-3 py-2 text-xs" style={{ color: '#8a857f' }}>Nieko nerasta</p>}
        </div>,
        document.body,
      )}
    </>
  );
}
