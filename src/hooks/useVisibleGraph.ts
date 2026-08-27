import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { STORIES } from '../data/stories';
import { ALL_REL_TYPES } from '../types';
import { isLinkVisible, isNodeVisible, type GraphLink, type GraphNode } from '../lib/graph';

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

    // 범례에서 관계 유형을 끄면 그 선만 사라지고 노드는 그대로 남아
    // 무엇이 걸러졌는지 알기 어렵다. 남은 관계가 하나도 없는 노드를 표시해
    // 뷰에서 어둡게 처리한다. (전체 선택 상태에서는 아무도 어둡게 하지 않는다)
    const relFilterActive = effRelTypes.length !== ALL_REL_TYPES.length;
    const linkedNodes = new Set<string>();
    if (relFilterActive) {
      for (const l of visibleLinks) {
        linkedNodes.add(typeof l.source === 'string' ? l.source : (l.source as unknown as GraphNode).id);
        linkedNodes.add(typeof l.target === 'string' ? l.target : (l.target as unknown as GraphNode).id);
      }
    }

    return { visibleNodes, visibleLinks, visibleLinkIds, linkedNodes, relFilterActive, story };
  }, [graph, links, filters, storyIndex]);
}
