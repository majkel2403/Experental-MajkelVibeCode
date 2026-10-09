import { describe, expect, it } from 'vitest';
import { buildGalaxy, connectedIds, graphCounts, selectGalaxyView, CLUSTERS } from './data';

describe('Jarvis galaxy semantic graph', () => {
  it('generates a deterministic network of hundreds of nodes', () => {
    const a = buildGalaxy(42);
    const b = buildGalaxy(42);
    expect(a).toEqual(b);
    expect(a.nodes.length).toBeGreaterThan(250);
    expect(a.links.length).toBeGreaterThan(300);
    expect(graphCounts(a).clusters).toBe(CLUSTERS.length);
  });
  it('does not leave dangling links in each view', () => {
    const full = buildGalaxy();
    for (const mode of ['SYSTEM','PROJECTS','AGENTS','MEMORY','LIVE'] as const) {
      const view = selectGalaxyView(full, mode);
      const ids = new Set(view.nodes.map(n => n.id));
      expect(view.nodes.some(n => n.id === 'jarvis')).toBe(true);
      for (const link of view.links) {
        expect(ids.has(typeof link.source === 'string' ? link.source : link.source.id)).toBe(true);
        expect(ids.has(typeof link.target === 'string' ? link.target : link.target.id)).toBe(true);
      }
    }
  });
  it('focuses search on matching node and its parent hub', () => {
    const graph = buildGalaxy();
    const view = selectGalaxyView(graph, 'SYSTEM', 'Builder');
    expect(view.nodes.some(n => n.name.includes('Builder'))).toBe(true);
    expect(view.nodes.some(n => n.id === 'hub:hermes')).toBe(true);
    expect(view.nodes.length).toBeLessThan(graph.nodes.length);
  });
  it('highlights only adjacent nodes', () => {
    const graph = buildGalaxy();
    const connected = connectedIds(graph, 'hub:memory');
    expect(connected.has('jarvis')).toBe(true);
    expect(connected.has('memory:0')).toBe(true);
    expect(connected.has('tools:0')).toBe(false);
  });
});
