import type { ClusterId, GalaxyData, GalaxyLink, GalaxyNode, NodeKind, ViewMode } from './types';
import { nodeId } from './types';

export interface ClusterDefinition {
  id: ClusterId;
  name: string;
  color: string;
  position: [number, number, number];
  count: number;
  description: string;
  category: NodeKind;
}
export const CLUSTERS: ClusterDefinition[] = [
  { id: 'hermes', name: 'HERMES / AGENTS', color: '#b386ff', position: [-225, 104, -85], count: 43, description: 'Orchestracja i wyspecjalizowane zespoły agentów', category: 'agent' },
  { id: 'jev', name: 'JEV / DECISIONS', color: '#ff6cb8', position: [215, 125, -75], count: 36, description: 'Decyzje, klasyfikacja i weryfikacja', category: 'decision' },
  { id: 'projects', name: 'PROJECTS / TASKS', color: '#628bff', position: [-225, -130, 85], count: 54, description: 'Projekty, zadania i repozytoria', category: 'project' },
  { id: 'memory', name: 'MEMORY / KNOWLEDGE', color: '#55ebbb', position: [220, -138, 80], count: 74, description: 'Pamięć, fakty, umiejętności i powiązania', category: 'memory' },
  { id: 'tools', name: 'TOOLS / SKILLS', color: '#ffd075', position: [-12, 228, 80], count: 36, description: 'Narzędzia, pliki i umiejętności', category: 'tool' },
  { id: 'events', name: 'EVENT BUS / LIVE', color: '#61e7ff', position: [16, -235, -70], count: 39, description: 'Zdarzenia, przepływy pracy i ślady wykonania', category: 'event' },
];

const makeRandom = (initial: number) => {
  let value = initial >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const SUB_LABELS: Record<ClusterId, string[]> = {
  hermes: ['Architect', 'Researcher', 'Builder', 'Critic', 'Planner', 'Designer', 'Reviewer', 'Security', 'Analyst', 'DevOps'],
  jev: ['Confidence', 'Routing', 'Guardrail', 'Classifier', 'Action rank', 'Evidence', 'Policy', 'Verifier'],
  projects: ['Jarvis OS', 'Orb Lab', 'Graph 3D', 'Trading Lab', 'Frontend', 'Memory Engine', 'Autonomy', 'Tasks'],
  memory: ['Experience', 'Fact', 'Skill', 'Decision', 'Person', 'Source', 'History', 'Obsidian', 'Context'],
  tools: ['Shell', 'Browser', 'GitHub', 'Vercel', 'MCP', 'Plugins', 'Terminal', 'Code', 'Files'],
  events: ['Agent.started', 'Tool.called', 'Step.done', 'Task.failed', 'Memory.saved', 'Link.created', 'Event.received'],
};

export function buildGalaxy(seed = 42, density = 1): GalaxyData {
  const rnd = makeRandom(seed);
  const nodes: GalaxyNode[] = [{
    id: 'jarvis', name: 'JARVIS', kind: 'core', cluster: 'core',
    color: '#a3f5ff', importance: 10, status: 'orchestrating',
    detail: 'Centralny rdzeń Jarvis OS — wiedza, agenci, projekty i zdarzenia.',
    fx: 0, fy: 0, fz: 0,
  }];
  const links: GalaxyLink[] = [];

  for (const cluster of CLUSTERS) {
    const hubId = 'hub:' + cluster.id;
    nodes.push({
      id: hubId,
      name: cluster.name,
      kind: 'hub',
      cluster: cluster.id,
      color: cluster.color,
      importance: 8,
      status: 'online',
      detail: cluster.description,
      fx: cluster.position[0], fy: cluster.position[1], fz: cluster.position[2],
    });
    links.push({ id: 'core:' + cluster.id, source: 'jarvis', target: hubId, kind: 'core' });

    const count = Math.max(6, Math.round(cluster.count * density));
    const satellites: GalaxyNode[] = [];
    for (let i = 0; i < count; i++) {
      const theta = rnd() * 2 * Math.PI;
      const phi = Math.acos(2 * rnd() - 1);
      const radius = 43 + Math.pow(rnd(), 0.72) * 128;
      const x = cluster.position[0] + radius * Math.sin(phi) * Math.cos(theta);
      const y = cluster.position[1] + radius * Math.sin(phi) * Math.sin(theta);
      const z = cluster.position[2] + radius * Math.cos(phi);
      const kind: NodeKind = cluster.id === 'projects' ? (i % 4 === 0 ? 'project' : i % 3 === 0 ? 'file' : 'task')
        : cluster.id === 'tools' ? (i % 3 === 0 ? 'file' : 'tool')
        : cluster.id === 'hermes' ? 'agent'
        : cluster.id === 'jev' ? 'decision'
        : cluster.id === 'memory' ? 'memory' : 'event';
      const name = SUB_LABELS[cluster.id][i % SUB_LABELS[cluster.id].length];
      const node: GalaxyNode = {
        id: cluster.id + ':' + i,
        name: name + ' ' + String(i + 1).padStart(2, '0'),
        kind, cluster: cluster.id,
        color: cluster.color,
        importance: 0.35 + rnd() * 2.0,
        status: i % 9 === 0 ? 'active' : 'synced',
        detail: 'DEMO · ' + cluster.description + ' · element ' + (i + 1),
        parent: hubId, x, y, z,
      };
      nodes.push(node);
      satellites.push(node);
      links.push({ id: 'contains:' + node.id, source: hubId, target: node.id, kind: 'contains' });
      if (i > 1 && rnd() > 0.57) {
        const other = satellites[Math.floor(rnd() * i)];
        if (other) links.push({
          id: 'relates:' + node.id, source: other.id, target: node.id, kind: 'relates',
        });
      }
    }
  }

  // A handful of explicit inter-system paths visible as data flows.
  const traffic: [string, string][] = [
    ['hub:hermes', 'hub:tools'], ['hub:hermes', 'hub:projects'],
    ['hub:jev', 'hub:hermes'], ['hub:jev', 'hub:memory'],
    ['hub:projects', 'hub:memory'], ['hub:events', 'hub:memory'],
    ['hub:events', 'hub:hermes'], ['hub:tools', 'hub:projects'],
  ];
  for (const [source, target] of traffic) {
    links.push({ id: 'traffic:' + source + ':' + target, source, target, kind: 'traffic' });
  }
  return { nodes, links };
}

const VISIBLE_CLUSTER: Record<Exclude<ViewMode, 'SYSTEM'>, ClusterId[]> = {
  AGENTS: ['hermes', 'jev', 'tools'],
  PROJECTS: ['projects', 'hermes', 'tools'],
  MEMORY: ['memory', 'jev', 'events'],
  LIVE: ['events', 'hermes', 'jev', 'projects'],
};

export function selectGalaxyView(data: GalaxyData, mode: ViewMode, search = ''): GalaxyData {
  const query = search.trim().toLowerCase();
  if (mode === 'SYSTEM' && !query) return data;
  const clusters = mode === 'SYSTEM' ? null : new Set<ClusterId>(VISIBLE_CLUSTER[mode]);
  const searchMatches = new Set<string>(
    data.nodes
      .filter((node) => node.name.toLowerCase().includes(query) || node.id.toLowerCase().includes(query))
      .map((node) => node.id),
  );
  const keep = new Set<string>();
  for (const node of data.nodes) {
    if (node.id === 'jarvis') { keep.add(node.id); continue; }
    if (clusters && node.cluster !== 'core' && !clusters.has(node.cluster)) continue;
    if (!query || searchMatches.has(node.id) || (node.parent && searchMatches.has(node.parent))) {
      keep.add(node.id);
      if (node.parent) keep.add(node.parent);
    }
  }
  return {
    nodes: data.nodes.filter((node) => keep.has(node.id)),
    links: data.links.filter((link) => keep.has(nodeId(link.source)) && keep.has(nodeId(link.target))),
  };
}

export function connectedIds(data: GalaxyData, selectedId: string | null): Set<string> {
  if (!selectedId) return new Set();
  const result = new Set([selectedId]);
  for (const link of data.links) {
    const source = nodeId(link.source);
    const target = nodeId(link.target);
    if (source === selectedId) result.add(target);
    if (target === selectedId) result.add(source);
  }
  return result;
}

export function graphCounts(data: GalaxyData) {
  return { nodes: data.nodes.length, links: data.links.length, clusters: CLUSTERS.length };
}
