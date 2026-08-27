import { Sparkles, ChevronRight } from 'lucide-react';
import { useStore, STORIES } from '../store/useStore';
import { useI18n } from '../i18n';

/**
 * SOCIAL PHENOMENA — 큐레이션 가이드 투어.
 * FILTERS 패널 하단에 제목만 나열돼 있던 것을 전용 탭으로 옮기면서,
 * 좁은 자리 때문에 못 보여주던 부제와 다루는 인물 수를 함께 보여준다.
 */
export default function StoriesPanel() {
  const { t, L } = useI18n();
  const setStory = useStore((s) => s.setStory);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="mb-1.5 flex items-center gap-1.5 font-mono text-[11.5px] font-bold uppercase tracking-[0.18em] text-slate-500">
          <Sparkles size={12} /> {t.stories}
        </h3>
        <p className="text-[11.5px] leading-snug text-slate-500">{t.storiesDesc}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        {STORIES.map((story, i) => (
          <button
            key={story.id}
            data-testid="story-card"
            onClick={() => setStory(i)}
            className="group flex items-start gap-2.5 rounded-xl border border-slate-400/10 bg-white/[0.02] p-2.5 text-left transition-colors hover:border-amber-400/35 hover:bg-white/[0.05]"
          >
            <span className="mt-0.5 text-[19.5px] leading-none" aria-hidden>
              {story.emoji}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-semibold text-slate-200 group-hover:text-white">
                {L(story.title)}
              </span>
              <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-slate-500">
                {L(story.subtitle)}
              </span>
              <span className="mt-1 block font-mono text-[9.5px] uppercase tracking-wider text-slate-600">
                {story.focusIds.length} {t.storyFigures}
              </span>
            </span>
            <ChevronRight
              size={13}
              className="mt-1 shrink-0 text-slate-600 transition-colors group-hover:text-amber-300"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
