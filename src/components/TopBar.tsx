import { useMemo, useState } from 'react';
import {
  Search,
  Box,
  Layers,
  Menu,
  X,
  Network,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { useUIStore } from '../store/uiStore';
import { useI18n, lt } from '../i18n';
import type { Politician } from '../types';

export default function TopBar() {
  const { t, locale } = useI18n();
  const setLocale = useUIStore((s) => s.setLocale);
  const langMode = useUIStore((s) => s.langMode);
  const setLangMode = useUIStore((s) => s.setLangMode);

  const graph = useStore((s) => s.graph);
  const focusPersonById = useStore((s) => s.select);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return graph
      .filter(
        (p) =>
          p.name.en.toLowerCase().includes(q) ||
          p.name.ko.includes(query.trim()) ||
          p.enName.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [query, graph]);

  const pick = (p: Politician) => {
    focusPersonById(p.id);
    setOpen(false);
    setQuery('');
  };

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-3 sm:p-4">
      <div className="pointer-events-auto flex items-center gap-2">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-400/15 bg-ink-900/80 text-slate-300 backdrop-blur-xl transition-colors hover:text-white"
          aria-label="Toggle sidebar"
        >
          <Menu size={17} />
        </button>

        <div className="flex items-center gap-3 rounded-xl border border-slate-400/15 bg-ink-900/80 px-4 py-2 backdrop-blur-xl">
          <Network size={18} className="text-amber-400" />
          <div className="leading-tight">
            <div className="font-mono text-[14.5px] font-bold tracking-[0.22em] text-white">
              POLARIS
            </div>
            <div className="text-[11.5px] text-slate-400">{t.tagline}</div>
          </div>
        </div>
      </div>

      <div className="pointer-events-auto flex items-center gap-2">
        <div className="relative">
          <div className="flex h-10 w-56 items-center gap-2 rounded-xl border border-slate-400/15 bg-ink-900/80 px-3 backdrop-blur-xl sm:w-72">
            <Search size={14} className="shrink-0 text-slate-500" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && results[0]) pick(results[0]);
                if (e.key === 'Escape') setOpen(false);
              }}
              placeholder={t.searchPlaceholder}
              className="w-full bg-transparent text-[13.5px] text-slate-100 placeholder:text-slate-600 focus:outline-none"
            />
          </div>
          {open && query && (
            <div className="absolute right-0 top-12 w-72 overflow-hidden rounded-xl border border-slate-400/15 bg-ink-900/95 shadow-2xl shadow-black/50 backdrop-blur-xl">
              {results.length === 0 && (
                <div className="px-4 py-3 text-[13.5px] text-slate-500">{t.searchNoResult}</div>
              )}
              {results.map((p) => (
                <button
                  key={p.id}
                  onMouseDown={() => pick(p)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/5"
                >
                  <Dot party={p.party} />
                  <span className="truncate text-[13.5px] text-slate-200">
                    {lt(p.name, locale)}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[10.5px] uppercase text-slate-500">
                    {p.branch}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          data-testid="mode-toggle"
          onClick={() => setLangMode(langMode === '2d' ? '3d' : '2d')}
          title={t.dim3d}
          className={`flex h-10 items-center gap-2 rounded-xl border px-3 text-[12.5px] font-medium backdrop-blur-xl transition-all ${
            langMode === '3d'
              ? 'border-amber-400/40 bg-amber-400/15 text-amber-300'
              : 'border-slate-400/15 bg-ink-900/80 text-slate-300 hover:text-white'
          }`}
        >
          {langMode === '3d' ? <Box size={15} /> : <Layers size={15} />}
          {langMode === '3d' ? '3D' : '2D'}
        </button>

        <div className="flex h-10 overflow-hidden rounded-xl border border-slate-400/15 bg-ink-900/80 font-mono text-[12.5px] backdrop-blur-xl">
          {(['en', 'ko'] as const).map((loc) => (
            <button
              key={loc}
              data-testid={`lang-${loc}`}
              onClick={() => setLocale(loc)}
              className={`px-3 transition-all ${
                locale === loc
                  ? 'bg-blue-500/25 font-bold text-blue-200'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {loc.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

function Dot({ party }: { party: string }) {
  const color =
    party === 'R'
      ? 'bg-red-500'
      : party === 'D'
        ? 'bg-blue-500'
        : party === 'I'
          ? 'bg-violet-400'
          : 'bg-slate-400';
  return <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} />;
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
      aria-label="Close"
    >
      <X size={15} />
    </button>
  );
}
