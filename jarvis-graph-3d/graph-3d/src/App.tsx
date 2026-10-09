import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { buildGalaxy, CLUSTERS, connectedIds, graphCounts, selectGalaxyView } from './galaxy/data';
import { nodeId, type GalaxyNode, type ViewMode } from './galaxy/types';
import { GalaxyScene } from './galaxy/GalaxyScene';

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: 'SYSTEM', label: 'Universe' },
  { id: 'AGENTS', label: 'Agents' },
  { id: 'PROJECTS', label: 'Projects' },
  { id: 'MEMORY', label: 'Memory' },
  { id: 'LIVE', label: 'Live flow' },
];

const ROUTES = [
  { id: 'traffic:hub:hermes:hub:tools', from: 'Hermes', to: 'Tools', action: 'tool.execute' },
  { id: 'traffic:hub:jev:hub:hermes', from: 'Jev', to: 'Hermes', action: 'decision.routed' },
  { id: 'traffic:hub:projects:hub:memory', from: 'Projects', to: 'Memory', action: 'memory.written' },
  { id: 'traffic:hub:events:hub:hermes', from: 'Event Bus', to: 'Hermes', action: 'event.dispatched' },
  { id: 'traffic:hub:hermes:hub:projects', from: 'Hermes', to: 'Projects', action: 'task.created' },
  { id: 'traffic:hub:jev:hub:memory', from: 'Jev', to: 'Memory', action: 'decision.saved' },
  { id: 'traffic:hub:tools:hub:projects', from: 'Tools', to: 'Projects', action: 'tool.completed' },
  { id: 'traffic:hub:events:hub:memory', from: 'Event Bus', to: 'Memory', action: 'snapshot.updated' },
];

interface DemoLog {
  sequence: number;
  action: string;
  route: string;
  timestamp: string;
}

const glyph: Record<string, string> = {
  core: '◉', hub: '⬡', agent: '◈', project: '▣', task: '◆',
  memory: '✦', file: '▤', tool: '⌘', decision: '◇', event: '⟡',
};

function clock(date: Date): string {
  return date.toLocaleTimeString('pl-PL', { hour12: false });
}

export default function App() {
  const [mode, setMode] = useState<ViewMode>('SYSTEM');
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [density, setDensity] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>('jarvis');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [focusRevision, setFocusRevision] = useState(0);
  const [labels, setLabels] = useState(true);
  const [glow, setGlow] = useState(true);
  const [orbit, setOrbit] = useState(() => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const [playing, setPlaying] = useState(() => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const [log, setLog] = useState<DemoLog[]>([]);
  const [activeTraffic, setActiveTraffic] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === 'Escape') {
        setQuery('');
        setInspectorOpen(false);
        searchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const allData = useMemo(() => buildGalaxy(42, density), [density]);
  const graph = useMemo(() => selectGalaxyView(allData, mode, query), [allData, mode, query]);
  const counts = useMemo(() => graphCounts(graph), [graph]);
  const selected = useMemo(() => allData.nodes.find(node => node.id === selectedId) ?? null, [allData, selectedId]);
  const neighbors = useMemo(() => connectedIds(allData, selectedId), [allData, selectedId]);
  const cluster = selected ? CLUSTERS.find(c => c.id === selected.cluster) : undefined;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setTick(prev => prev + 1), 2500);
    return () => window.clearInterval(timer);
  }, [playing]);

  useEffect(() => {
    if (!tick || !playing) return;
    const event = ROUTES[(tick - 1) % ROUTES.length];
    setActiveTraffic(event.id);
    setLog(previous => [{
      sequence: tick, action: event.action, route: event.from + ' → ' + event.to,
      timestamp: clock(new Date()),
    }, ...previous].slice(0, 7));
  }, [tick, playing]);

  const focus = (id: string | null) => {
    setSelectedId(id);
    setFocusId(id);
    setFocusRevision(previous => previous + 1);
    setInspectorOpen(true);
  };

  const resetCamera = () => {
    setFocusId(null);
    setSelectedId('jarvis');
    setFocusRevision(previous => previous + 1);
  };

  const selectNode = (node: GalaxyNode) => focus(node.id);
  const linkCount = selected
    ? allData.links.filter(link => nodeId(link.source) === selected.id || nodeId(link.target) === selected.id).length
    : 0;

  return (
    <div className="universe-app">
      <header className="masthead">
        <div className="brand">
          <div className="brand-mark"><span /></div>
          <div><strong>JARVIS <em>GRAPH</em></strong><small>INTELLIGENCE UNIVERSE</small></div>
        </div>

        <nav className="view-tabs" aria-label="Widoki galaktyki">
          {VIEWS.map(view => (
            <button type="button" key={view.id}
              className={mode === view.id ? 'view-tab active' : 'view-tab'}
              onClick={() => { setMode(view.id); resetCamera(); }}>
              {view.label}
            </button>
          ))}
        </nav>

        <div className="masthead-right">
          <div className="connection"><span />SIMULATION ONLINE</div>
          <span className="demo-indicator">DEMO MODE</span>
        </div>
      </header>

      <div className="universe-body">
        <aside className="cluster-rail">
          <div className="rail-heading">EXPLORE</div>
          <button type="button" className={selectedId === 'jarvis' ? 'rail-home selected' : 'rail-home'} onClick={() => focus('jarvis')}>
            <span className="rail-home-symbol">✺</span><span>JARVIS CORE</span>
          </button>
          <div className="rail-heading rail-heading--second">GALAXY CLUSTERS <span>06</span></div>
          {CLUSTERS.map(item => (
            <button type="button" key={item.id}
              className={selectedId === 'hub:' + item.id ? 'cluster-button chosen' : 'cluster-button'}
              onClick={() => focus('hub:' + item.id)}>
              <i style={{ '--cluster-color': item.color } as CSSProperties} />
              <span className="cluster-button__text"><strong>{item.name.split(' / ')[0]}</strong><small>{item.description.split(' ').slice(0, 3).join(' ')}</small></span>
              <b>{Math.round(item.count * density)}</b>
            </button>
          ))}
          <div className="rail-bottom">
            <div className="rail-bottom__title">DENSITY CONTROL</div>
            <div className="density-group" role="group" aria-label="Gęstość grafu">
              {[0.55, 1, 1.55].map((amount, index) => (
                <button type="button" key={amount} className={density === amount ? 'chosen' : ''}
                  onClick={() => { setDensity(amount); resetCamera(); }}>
                  {['LOW', 'MED', 'HIGH'][index]}
                </button>
              ))}
            </div>
            <div className="rail-bottom__caption">Graph topology · seeded demo</div>
          </div>
        </aside>

        <main className="canvas-shell">
          <div className="ambient-shimmer" aria-hidden="true" />
          <GalaxyScene
            data={graph}
            selectedId={selectedId}
            focusId={focusId}
            focusRevision={focusRevision}
            activeTraffic={playing ? activeTraffic : null}
            labels={labels}
            glow={glow}
            orbit={orbit}
            onNodeClick={selectNode}
          />

          <div className="canvas-top-left">
            <div className="eyebrow"><span className="eyebrow-line" /> SYSTEM TOPOLOGY / {mode}</div>
            <h1>Explore your <span>AI universe.</span></h1>
            <p>Agenci. Projekty. Pamięć. Jedna żywa sieć połączeń.</p>
          </div>

          <div className="canvas-search">
            <span aria-hidden="true">⌕</span>
            <input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)}
              placeholder="Find agents, memories, projects..."
              aria-label="Szukaj elementów grafu" />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Wyczyść wyszukiwanie">×</button>}
            <kbd>⌘ K</kbd>
          </div>

          <div className="canvas-top-right">
            <div className="scene-stat"><span className="scene-stat__value">{counts.nodes}</span><span>NODES</span></div>
            <div className="scene-stat"><span className="scene-stat__value">{counts.links}</span><span>EDGES</span></div>
            <div className="scene-stat"><span className="scene-stat__value">06</span><span>CLUSTERS</span></div>
          </div>

          <div className="canvas-bottom-left">
            <div className="live-led"><span className={playing ? 'led-pulse' : ''} /> {playing ? 'SIGNALS ACTIVE' : 'SIGNALS PAUSED'}</div>
            <span>DRAG TO ORBIT · SCROLL TO ZOOM · CLICK TO EXPLORE</span>
          </div>

          <div className="canvas-bottom-center">
            <button type="button" onClick={() => setOrbit(prev => !prev)} className={orbit ? 'scene-control active' : 'scene-control'} title="Automatyczny obrót">
              ◌ <span>ORBIT</span>
            </button>
            <button type="button" onClick={resetCamera} className="scene-control" title="Reset kamery">⊙ <span>RESET</span></button>
            <button type="button" onClick={() => setGlow(prev => !prev)} className={glow ? 'scene-control active' : 'scene-control'} title="Glow bloom">✧ <span>GLOW</span></button>
            <button type="button" onClick={() => setLabels(prev => !prev)} className={labels ? 'scene-control active' : 'scene-control'} title="Etykiety">☷ <span>LABELS</span></button>
            <button type="button" onClick={() => setPlaying(prev => !prev)} className={playing ? 'scene-control active' : 'scene-control'} title="Symulacja live">{playing ? 'Ⅱ' : '▷'} <span>{playing ? 'PAUSE' : 'PLAY'}</span></button>
          </div>
        </main>

        <aside className={inspectorOpen ? 'inspector inspector--open' : 'inspector'}>
          <div className="inspector-header"><span>NODE INSPECTOR</span><button type="button" className="inspector-close" onClick={() => setInspectorOpen(false)} aria-label="Zamknij inspector">×</button><span className="inspector-status">● CONNECTED</span></div>
          {selected ? (
            <>
              <div className="selection-panel">
                <div className="selection-emblem" style={{ '--node-color': selected.color } as CSSProperties}>
                  <span>{glyph[selected.kind]}</span>
                </div>
                <div className="selection-type" style={{ color: selected.color }}>{selected.kind.toUpperCase()} / {selected.status.toUpperCase()}</div>
                <h2>{selected.name}</h2>
                <p>{selected.detail}</p>
                <div className="selection-grid">
                  <div><strong>{linkCount}</strong><span>CONNECTIONS</span></div>
                  <div><strong>{neighbors.size}</strong><span>NEARBY NODES</span></div>
                </div>
                <button type="button" className="focus-button" onClick={() => focus(selected.id)}>⊙ &nbsp; FOCUS CAMERA <span>↗</span></button>
                <div className="related-heading">CONNECTED NODES <span>{Math.max(0, neighbors.size - 1)}</span></div>
                <div className="related-list">
                  {Array.from(neighbors).filter(id => id !== selected.id).slice(0, 5).map(id => {
                    const node = allData.nodes.find(n => n.id === id);
                    if (!node) return null;
                    return (
                      <button type="button" key={id} onClick={() => focus(id)}>
                        <i style={{ background: node.color }} />
                        <span>{node.name}</span>
                        <b>↗</b>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="selection-panel"><h2>Explore the graph</h2><p>Wybierz punkt w galaktyce, by zobaczyć powiązania i szczegóły.</p></div>
          )}

          <div className="inspector-log">
            <div className="log-title"><span>LIVE PROCESS STREAM</span><span className="demo-small">SIMULATED</span></div>
            <div className="stream-track">
              {log.length ? log.slice(0, 4).map(item => (
                <div className="stream-event" key={item.sequence}>
                  <span className="event-time">{item.timestamp}</span>
                  <strong>{item.action}</strong>
                  <small>{item.route}</small>
                </div>
              )) : (
                <div className="stream-event"><span className="event-time">DEMO MODE</span><strong>Graph initialized</strong><small>Awaiting first simulated signal</small></div>
              )}
            </div>
          </div>

          <div className="inspector-footer">
            <span>ENGINE <b>react-force-graph-3d</b></span>
            <span>RENDER <b>WebGL / Three.js</b></span>
          </div>
        </aside>
      </div>
    </div>
  );
}
