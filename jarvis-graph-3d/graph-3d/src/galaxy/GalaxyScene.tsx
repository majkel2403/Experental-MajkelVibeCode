import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Vector2 } from 'three';
import { makeNodeObject, makeStarfield } from './objects';
import { nodeId, type GalaxyData, type GalaxyLink, type GalaxyNode } from './types';

export interface GalaxySceneProps {
  data: GalaxyData;
  selectedId: string | null;
  focusId: string | null;
  focusRevision: number;
  activeTraffic: string | null;
  labels: boolean;
  glow: boolean;
  orbit: boolean;
  onNodeClick: (node: GalaxyNode) => void;
}

export function GalaxyScene({
  data, selectedId, focusId, focusRevision, activeTraffic, labels, glow, orbit, onNodeClick,
}: GalaxySceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);
  const addedStars = useRef(false);
  const bloomPass = useRef<any>(null);
  const [size, setSize] = useState({ width: 1180, height: 760 });
  const [webGLReady] = useState(() => {
    try {
      const canvas = document.createElement('canvas');
      return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch {
      return false;
    }
  });
  const sceneData = useMemo(() => ({
    nodes: data.nodes.map(node => ({ ...node })),
    links: data.links.map(link => ({ ...link })),
  }), [data]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      const rect = host.getBoundingClientRect();
      setSize(prev => {
        const next = { width: Math.max(300, Math.round(rect.width)), height: Math.max(360, Math.round(rect.height)) };
        return next.width === prev.width && next.height === prev.height ? prev : next;
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    measure();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const api = graphRef.current;
    if (!api || addedStars.current) return;
    const stars = makeStarfield(size.width < 700 ? 900 : 2200);
    api.scene().add(stars);
    addedStars.current = true;
    api.cameraPosition({ x: 0, y: 40, z: 920 }, { x: 0, y: 0, z: 0 }, 0);
    return () => {
      api.scene()?.remove(stars);
      stars.geometry.dispose();
      (stars.material as { dispose: () => void }).dispose();
      addedStars.current = false;
    };
    // The starfield belongs to this WebGL scene, not to graph data updates.
  }, []);

  useEffect(() => {
    const api = graphRef.current;
    const controls = api?.controls?.();
    if (controls) {
      controls.autoRotate = orbit;
      controls.autoRotateSpeed = 0.35;
      controls.enableDamping = true;
      controls.dampingFactor = 0.07;
    }
  }, [orbit, sceneData]);

  useEffect(() => {
    const api = graphRef.current;
    if (!api) return;
    const charge = api.d3Force?.('charge');
    charge?.strength?.((node: GalaxyNode) => node.kind === 'core' ? -230 : node.kind === 'hub' ? -170 : -14);
    const link = api.d3Force?.('link');
    link?.distance?.((edge: GalaxyLink) =>
      edge.kind === 'contains' ? 47 : edge.kind === 'relates' ? 22 : 160,
    );
    link?.strength?.((edge: GalaxyLink) =>
      edge.kind === 'contains' ? 0.75 : edge.kind === 'relates' ? 0.25 : 0.07,
    );
  }, [sceneData]);

  useEffect(() => {
    const api = graphRef.current;
    if (!api) return;
    if (glow && size.width >= 700 && !bloomPass.current) {
      const composer = api.postProcessingComposer?.();
      if (composer) {
        const bloom = new UnrealBloomPass(new Vector2(size.width, size.height), 0.58, 0.6, 0.26);
        composer.addPass(bloom);
        bloomPass.current = bloom;
      }
    }
    if (bloomPass.current) bloomPass.current.enabled = glow && size.width >= 700;
  }, [glow, size]);

  useEffect(() => {
    const api = graphRef.current;
    if (!api || focusRevision === 0) return;
    if (!focusId) {
      api.cameraPosition({ x: 0, y: 35, z: 930 }, { x: 0, y: 0, z: 0 }, 1300);
      return;
    }
    const node = api.graphData()?.nodes?.find((n: GalaxyNode) => n.id === focusId) as GalaxyNode | undefined;
    if (!node) return;
    const x = node.x ?? node.fx ?? 0;
    const y = node.y ?? node.fy ?? 0;
    const z = node.z ?? node.fz ?? 0;
    const camera = api.camera()?.position;
    const ux = (camera?.x ?? 0) - x;
    const uy = (camera?.y ?? 0) - y;
    const uz = (camera?.z ?? 930) - z;
    const len = Math.hypot(ux, uy, uz) || 1;
    const distance = focusId === 'jarvis' ? 210 : node.kind === 'hub' ? 235 : 92;
    api.cameraPosition(
      { x: x + ux / len * distance, y: y + uy / len * distance, z: z + uz / len * distance },
      { x, y, z }, 1200,
    );
  }, [focusId, focusRevision]);

  const renderNode = useCallback((node: GalaxyNode) =>
    makeNodeObject(node, labels, selectedId === node.id),
  [labels, selectedId]);

  return (
    <div className="galaxy-scene" ref={hostRef} aria-label="Interaktywny graf 3D pamięci i agentów Jarvisa">
      {webGLReady ? (<ForceGraph3D<GalaxyNode, GalaxyLink>
        ref={graphRef}
        graphData={sceneData}
        width={size.width}
        height={size.height}
        backgroundColor="#030712"
        showNavInfo={false}
        controlType="orbit"
        nodeId="id"
        nodeLabel={node => `<div style="font-weight:700;color:#fff">${node.name.replace(/[<>&"]/g, '')}</div><div style="font-size:11px;color:#9ceaff">${node.cluster.toUpperCase()} · ${node.status}</div>`}
        nodeThreeObject={renderNode}
        nodeThreeObjectExtend={false}
        nodeVisibility={() => true}
        linkColor={link => {
          if (selectedId && (nodeId(link.source) === selectedId || nodeId(link.target) === selectedId)) return '#b6f4ff';
          if (link.id === activeTraffic) return '#7ffaff';
          if (link.kind === 'core') return '#2d9bbe';
          if (link.kind === 'traffic') return '#5e81ae';
          if (link.kind === 'relates') return '#1b2c4c';
          return '#254064';
        }}
        linkOpacity={0.42}
        linkWidth={link => link.id === activeTraffic ? 2 : link.kind === 'core' ? 0.8 : link.kind === 'traffic' ? 0.55 : 0.14}
        linkCurvature={link => link.kind === 'traffic' ? 0.14 : 0}
        linkDirectionalParticles={link => link.id === activeTraffic ? 5 : (link.kind === 'traffic' && orbit ? 1 : 0)}
        linkDirectionalParticleSpeed={link => link.id === activeTraffic ? .008 : .0025}
        linkDirectionalParticleWidth={link => link.id === activeTraffic ? 2.5 : 1.2}
        linkDirectionalParticleColor={link => link.id === activeTraffic ? '#c6ffff' : '#6ac8ff'}
        d3AlphaDecay={0.033}
        d3VelocityDecay={0.48}
        warmupTicks={65}
        cooldownTicks={130}
        onNodeClick={node => onNodeClick(node)}
      />) : (
        <div className="scene-fallback" role="status">
          <span>WEBGL UNAVAILABLE · NETWORK TOPOLOGY STILL ACCESSIBLE</span>
          <h2>Jarvis Galaxy</h2>
          <p>Przeglądarka nie uruchomiła WebGL. Możesz wybrać klaster i odczytać jego relacje w Inspectorze.</p>
          <div className="scene-fallback__clusters">
            {data.nodes.filter(node => node.kind === 'hub').map(node => (
              <button type="button" key={node.id} onClick={() => onNodeClick(node)}
                style={{ borderColor: node.color }}>
                <i style={{ background: node.color }} />{node.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
