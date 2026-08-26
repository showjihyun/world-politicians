import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useI18n } from '../i18n';
import { SIGNAL_BY_PAIR } from '../data/signals';
import { REL_META } from '../types';

export default function LinkPopover() {
  const { t, L } = useI18n();
  const links = useStore((s) => s.links);
  const graph = useStore((s) => s.graph);
  const selectedLinkId = useStore((s) => s.selectedLinkId);
  const selectLink = useStore((s) => s.selectLink);

  const link = selectedLinkId ? links.find((l) => l.id === selectedLinkId) : null;
  const a = link ? graph.find((g) => g.id === link.rel.a) : null;
  const b = link ? graph.find((g) => g.id === link.rel.b) : null;

  return (
    <AnimatePresence>
      {link && a && b && (
        <motion.div
          key={link.id}
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="pointer-events-auto absolute bottom-36 left-1/2 z-30 w-[min(92vw,460px)] -translate-x-1/2 rounded-xl border border-slate-400/20 bg-ink-900/95 p-4 shadow-2xl shadow-black/60 backdrop-blur-xl"
        >
          <button
            onClick={() => selectLink(null)}
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-white/10 hover:text-white"
            aria-label={t.close}
          >
            <X size={13} />
          </button>

          <div className="mb-2 flex items-center gap-2">
            <span
              className="rounded-full px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-wider"
              style={{
                color: REL_META[link.rel.type].color,
                backgroundColor: REL_META[link.rel.type].color + '1a',
                border: `1px solid ${REL_META[link.rel.type].color}44`,
              }}
            >
              {L(REL_META[link.rel.type].label)}
            </span>
            <span className="flex items-center gap-0.5">
              {[1, 2, 3].map((s) => (
                <span
                  key={s}
                  className="h-1 rounded-full"
                  style={{
                    width: s === 1 ? 5 : s === 2 ? 7 : 9,
                    backgroundColor:
                      s <= link.rel.strength
                        ? REL_META[link.rel.type].color
                        : 'rgba(148,163,184,0.25)',
                  }}
                />
              ))}
            </span>
          </div>

          <div className="text-[14px] font-semibold text-white">
            <span>{L(a.name)}</span>
            <span className="mx-1.5 text-slate-500">
              {link.rel.type === 'feud' ? '⇄' : '↔'}
            </span>
            <span>{L(b.name)}</span>
          </div>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-300">
            {L(link.rel.note)}
          </p>

          {(() => {
            const sig = SIGNAL_BY_PAIR.get(link.id);
            if (!sig) return null;
            return (
              <a
                href={sig.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2.5 flex items-center gap-1.5 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.06] px-2 py-1.5 text-[11px] text-cyan-200 transition-colors hover:bg-cyan-400/[0.12]"
              >
                <ExternalLink size={10} className="shrink-0" />
                <span className="truncate">{sig.title}</span>
                <span className="ml-auto shrink-0 font-mono text-[9.5px] uppercase tracking-wider opacity-70">
                  {sig.date} · {sig.source}
                </span>
              </a>
            );
          })()}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
