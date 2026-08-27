import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Compass } from 'lucide-react';
import { useStore, STORIES } from '../store/useStore';
import { useI18n } from '../i18n';

export function StoryDock() {
  const { t, L } = useI18n();
  const storyIndex = useStore((s) => s.storyIndex);
  const setStory = useStore((s) => s.setStory);
  const active = storyIndex != null;

  return (
    <div
      className={`pointer-events-auto absolute inset-x-0 bottom-0 z-20 transition-transform duration-500 ${
        active ? 'translate-y-full' : 'translate-y-0'
      }`}
    >
      <div className="mx-auto mb-3 max-w-[min(96vw,980px)] px-2">
        <div className="mb-1.5 flex items-center gap-2 px-1">
          <Compass size={11} className="text-amber-400" />
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
            {t.stories}
          </span>
          <span className="hidden text-[10.5px] text-slate-600 sm:inline">· {t.storiesDesc}</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 polaris-scroll" style={{ scrollbarWidth: 'thin' }}>
          {STORIES.map((story, i) => (
            <motion.button
              key={story.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.06 }}
              onClick={() => setStory(i)}
              className="group flex w-52 shrink-0 items-start gap-2.5 rounded-xl border border-slate-400/15 bg-ink-900/85 p-3 text-left backdrop-blur-xl transition-all hover:border-amber-400/40 hover:bg-ink-850/90"
            >
              <span className="text-[19.5px] leading-none" aria-hidden>
                {story.emoji}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-slate-200 group-hover:text-white">
                  {L(story.title)}
                </span>
                <span className="mt-0.5 block line-clamp-2 text-[11px] leading-snug text-slate-500">
                  {L(story.subtitle)}
                </span>
              </span>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function StoryOverlay() {
  const { t, L } = useI18n();
  const storyIndex = useStore((s) => s.storyIndex);
  const setStory = useStore((s) => s.setStory);
  const sidebarOpen = useStore((s) => s.sidebarOpen);

  const story = storyIndex != null ? STORIES[storyIndex] : null;

  return (
    <AnimatePresence>
      {/* 사이드바와 같은 left-3 에 두면 왼쪽 패널을 그대로 덮는다.
          패널이 열려 있으면 그래프 영역 좌상단으로 비켜 앉힌다. */}
      {story && (
        <motion.aside
          key={story.id}
          initial={{ x: -420, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -420, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className={`pointer-events-auto absolute top-[72px] z-20 flex max-h-[calc(100vh-84px)] w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl border border-slate-400/15 bg-ink-900/92 shadow-2xl shadow-black/60 backdrop-blur-2xl transition-[left] duration-300 ${
            sidebarOpen ? 'left-[349px]' : 'left-3'
          }`}
        >
          <div className="flex items-start gap-3 p-5 pb-3">
            <span className="text-3xl leading-none" aria-hidden>
              {story.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[16.5px] font-bold leading-snug text-white">{L(story.title)}</h2>
              <p className="mt-1 text-[12px] leading-snug text-slate-400">
                {L(story.subtitle)}
              </p>
            </div>
            <button
              onClick={() => setStory(null)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/10 hover:text-white"
              aria-label={t.close}
            >
              <X size={15} />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-4 polaris-scroll">
            {story.paragraphs.map((para, i) => (
              <p key={i} className="text-[13.5px] leading-relaxed text-slate-300">
                {L(para)}
              </p>
            ))}

            <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.07] p-3">
              <div className="mb-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-amber-300">
                ✦ {t.insightLabel}
              </div>
              <p className="text-[13px] font-medium leading-relaxed text-amber-100/90">
                {L(story.insight)}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-400/10 px-5 py-3">
            <button
              onClick={() => setStory(Math.max(0, (storyIndex ?? 0) - 1))}
              disabled={(storyIndex ?? 0) === 0}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-slate-400 transition-colors enabled:hover:bg-white/10 enabled:hover:text-white disabled:opacity-30"
            >
              <ChevronLeft size={13} /> {t.storyPrev}
            </button>
            <span className="font-mono text-[11.5px] text-slate-500">
              {(storyIndex ?? 0) + 1} {t.storyOf} {STORIES.length}
            </span>
            <button
              onClick={() =>
                setStory(
                  (storyIndex ?? 0) >= STORIES.length - 1 ? null : (storyIndex ?? 0) + 1
                )
              }
              className="flex items-center gap-1 rounded-lg bg-blue-500/20 px-2.5 py-1 text-[12px] font-medium text-blue-200 transition-colors hover:bg-blue-500/35"
            >
              {(storyIndex ?? 0) >= STORIES.length - 1 ? t.storyExit : t.storyNext}
              <ChevronRight size={13} />
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
