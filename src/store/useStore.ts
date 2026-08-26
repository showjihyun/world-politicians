import { create } from 'zustand';
import type { Branch, Party, Politician, RelType, Relationship } from '../types';
import { POLITICIANS } from '../data';
import { STORIES } from '../data/stories';
import { buildGraph, type Filters, type GraphLink, type GraphNode } from '../lib/graph';

const { nodes, links, adjacency } = buildGraph(POLITICIANS);

interface AppState {
  graph: GraphNode[];
  links: GraphLink[];
  adjacency: Map<string, Set<string>>;
  relsByPerson: Map<string, Relationship[]>;

  selectedId: string | null;
  selectedLinkId: string | null;
  hoveredId: string | null;
  watchIds: string[];

  filters: Filters;
  colorMode: 'party' | 'faction';
  showLabels: boolean;
  sidebarOpen: boolean;
  mobilePanel: 'filters' | 'insights' | null;

  storyIndex: number | null;

  select: (id: string | null) => void;
  selectLink: (id: string | null) => void;
  hover: (id: string | null) => void;
  toggleWatch: (id: string) => void;
  toggleFilterItem: (
    key: 'parties' | 'branches' | 'factions',
    value: Party | Branch | string
  ) => void;
  setColorMode: (m: 'party' | 'faction') => void;
  setShowLabels: (v: boolean) => void;
  setSidebarOpen: (v: boolean) => void;
  setMobilePanel: (p: 'filters' | 'insights' | null) => void;
  toggleRelType: (t: RelType) => void;
  setStrongOnly: (v: boolean) => void;
  resetFilters: () => void;
  setStory: (idx: number | null) => void;
}

const emptyFilters: Filters = {
  parties: [],
  branches: [],
  factions: [],
  relTypes: [],
  strongOnly: false,
};

const relsByPerson = new Map<string, Relationship[]>();
for (const l of links) {
  for (const pid of [l.rel.a, l.rel.b]) {
    if (!relsByPerson.has(pid)) relsByPerson.set(pid, []);
    relsByPerson.get(pid)!.push(l.rel);
  }
}

export const useStore = create<AppState>((set) => ({
  graph: nodes,
  links,
  adjacency,
  relsByPerson,

  selectedId: null,
  selectedLinkId: null,
  hoveredId: null,
  watchIds: [],

  filters: emptyFilters,
  colorMode: 'party',
  showLabels: true,
  sidebarOpen: true,
  mobilePanel: null,

  storyIndex: null,

  select: (id) => set({ selectedId: id, selectedLinkId: null }),
  selectLink: (id) => set({ selectedLinkId: id }),
  hover: (id) => set({ hoveredId: id }),
  toggleWatch: (id) =>
    set((s) => ({
      watchIds: s.watchIds.includes(id)
        ? s.watchIds.filter((x) => x !== id)
        : [...s.watchIds, id],
    })),
  toggleFilterItem: (key, value) =>
    set((s) => {
      const arr = s.filters[key] as string[];
      const next = arr.includes(value as string)
        ? arr.filter((v) => v !== value)
        : [...arr, value as string];
      return { filters: { ...s.filters, [key]: next } };
    }),
  setColorMode: (colorMode) => set({ colorMode }),
  setShowLabels: (showLabels) => set({ showLabels }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setMobilePanel: (mobilePanel) => set({ mobilePanel }),
  toggleRelType: (t) =>
    set((s) => {
      const arr = s.filters.relTypes;
      const next = arr.includes(t) ? arr.filter((x) => x !== t) : [...arr, t];
      return { filters: { ...s.filters, relTypes: next } };
    }),
  setStrongOnly: (strongOnly) => set((s) => ({ filters: { ...s.filters, strongOnly } })),
  resetFilters: () => set({ filters: emptyFilters }),
  setStory: (storyIndex) => set({ storyIndex, selectedId: null, selectedLinkId: null }),
}));

export { STORIES };
