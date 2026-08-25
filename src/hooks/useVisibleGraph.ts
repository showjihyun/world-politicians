import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { STORIES } from '../data/stories';
import { isLinkVisible, isNodeVisible, type GraphLink } from '../lib/graph';

export function useVisibleGraph() {
  const graph = useStore((s) => s.graph);
  const links = useStore((s) => s.links);
  const filters = useStore((s) => s.filters);
  const storyIndex = useStore((s) => s.storyIndex);

  return useMemo(() => {
    const story = storyIndex != null ? STORIES[storyIndex] : null;
    const storyFocus = story ? new Set(story.focusIds) : null;
    const effRelTypes = story?.relTypes ?? filters.relTypes;
    const f = { ...filters, relTypes: effRelTypes };

    const visibleNodes = new Set<string>();
    for (const n of graph) {
      if (isNodeVisible(n, f, storyFocus)) visibleNodes.add(n.id);
    }

    const visibleLinks: GraphLink[] = links.filter((l) =>
      isLinkVisible(l, f, visibleNodes)
    );

    const visibleLinkIds = new Set(visibleLinks.map((l) => l.id));
    return { visibleNodes, visibleLinks, visibleLinkIds, story };
  }, [graph, links, filters, storyIndex]);
}
