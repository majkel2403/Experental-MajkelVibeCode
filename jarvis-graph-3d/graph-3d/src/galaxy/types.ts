export type ClusterId = 'hermes' | 'jev' | 'projects' | 'memory' | 'tools' | 'events';
export type NodeKind = 'core' | 'hub' | 'agent' | 'project' | 'task' | 'memory' | 'file' | 'tool' | 'decision' | 'event';

export interface GalaxyNode {
  id: string;
  name: string;
  kind: NodeKind;
  cluster: ClusterId | 'core';
  color: string;
  importance: number;
  status: string;
  detail: string;
  parent?: string;
  fx?: number;
  fy?: number;
  fz?: number;
  x?: number;
  y?: number;
  z?: number;
}

export interface GalaxyLink {
  id: string;
  source: string | GalaxyNode;
  target: string | GalaxyNode;
  kind: 'core' | 'contains' | 'relates' | 'traffic';
  active?: boolean;
}

export interface GalaxyData {
  nodes: GalaxyNode[];
  links: GalaxyLink[];
}

export type ViewMode = 'SYSTEM' | 'AGENTS' | 'PROJECTS' | 'MEMORY' | 'LIVE';

export const nodeId = (endpoint: string | GalaxyNode): string =>
  typeof endpoint === 'string' ? endpoint : endpoint.id;
