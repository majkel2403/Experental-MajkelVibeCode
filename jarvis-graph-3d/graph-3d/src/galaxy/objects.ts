import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color,
  DoubleSide, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, OctahedronGeometry, Points, PointsMaterial,
  RingGeometry, SphereGeometry, Sprite, SpriteMaterial, type Object3D,
} from 'three';
import type { GalaxyNode } from './types';

const labelCache = new Map<string, CanvasTexture>();
let glowTexture: CanvasTexture | undefined;

function glowMap(): CanvasTexture {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(64, 64, 1, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.08, 'rgba(255,255,255,.98)');
    gradient.addColorStop(0.26, 'rgba(255,255,255,.42)');
    gradient.addColorStop(0.55, 'rgba(255,255,255,.12)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  }
  glowTexture = new CanvasTexture(canvas);
  return glowTexture;
}

function labelTexture(value: string): CanvasTexture {
  const cached = labelCache.get(value);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = '700 35px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#eefcff';
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#77c9ef';
    ctx.fillText(value, 256, 46, 480);
  }
  const tex = new CanvasTexture(canvas);
  labelCache.set(value, tex);
  return tex;
}

export function makeNodeObject(node: GalaxyNode, labels: boolean, selected: boolean): Object3D {
  const group = new Group();
  const main = node.kind === 'core';
  const hub = node.kind === 'hub';
  const strong = main || hub;
  const radius = main ? 17 : hub ? 11 : node.importance > 1.9 ? 3.9 : node.kind === 'memory' ? 1.65 : 2.4;
  const color = new Color(node.color);

  const geometry = node.kind === 'decision'
    ? new OctahedronGeometry(radius, 0)
    : node.kind === 'project'
      ? new IcosahedronGeometry(radius, 1)
      : new SphereGeometry(radius, strong ? 26 : 9, strong ? 20 : 7);
  const material = new MeshStandardMaterial({
    color, emissive: color,
    emissiveIntensity: selected ? 2.3 : strong ? 1.15 : 0.65,
    metalness: strong ? 0.26 : 0.05,
    roughness: main ? 0.12 : 0.3,
  });
  const sphere = new Mesh(geometry, material);
  group.add(sphere);

  if (strong || selected || node.importance > 1.9) {
    const halo = new Sprite(new SpriteMaterial({
      map: glowMap(), color, transparent: true, blending: AdditiveBlending,
      depthWrite: false, opacity: strong ? 0.74 : 0.38,
    }));
    halo.scale.set(radius * (main ? 11 : hub ? 9 : 7), radius * (main ? 11 : hub ? 9 : 7), 1);
    group.add(halo);
  }

  if (strong) {
    const ringMat = new MeshBasicMaterial({
      color, transparent: true, opacity: main ? 0.43 : 0.24,
      side: DoubleSide, depthWrite: false, blending: AdditiveBlending,
    });
    const ring = new Mesh(new RingGeometry(radius * 1.45, radius * 1.54, 64), ringMat);
    ring.rotation.x = 0.47;
    ring.rotation.y = -0.32;
    group.add(ring);
    if (main) {
      const second = new Mesh(new RingGeometry(radius * 2.15, radius * 2.20, 96),
        new MeshBasicMaterial({ color: '#35c7ff', transparent: true, opacity: 0.22, side: DoubleSide, depthWrite: false, blending: AdditiveBlending }));
      second.rotation.y = 1.2;
      second.rotation.z = 0.3;
      group.add(second);
    }
  }
  if (labels && (strong || selected || (node.importance > 2.05 && node.kind !== 'memory'))) {
    const sprite = new Sprite(new SpriteMaterial({
      map: labelTexture(node.name), transparent: true, depthWrite: false,
    }));
    sprite.scale.set(main ? 73 : hub ? 93 : 57, main ? 14 : hub ? 14 : 11, 1);
    sprite.position.set(0, -radius - (main ? 28 : hub ? 22 : 13), 0);
    group.add(sprite);
  }

  return group;
}

export function makeStarfield(count = 2200): Points {
  let seed = 7735;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const phi = rand() * Math.PI * 2;
    const cosTheta = rand() * 2 - 1;
    const theta = Math.acos(cosTheta);
    const r = 800 + rand() * 1700;
    positions[i * 3] = Math.sin(theta) * Math.cos(phi) * r;
    positions[i * 3 + 1] = Math.sin(theta) * Math.sin(phi) * r;
    positions[i * 3 + 2] = Math.cos(theta) * r;
    const intensity = 0.35 + rand() * 0.65;
    colors[i * 3] = intensity * (rand() > .87 ? .74 : 1);
    colors[i * 3 + 1] = intensity * (rand() > .8 ? .76 : 1);
    colors[i * 3 + 2] = intensity;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  const material = new PointsMaterial({
    vertexColors: true, size: 2.1, transparent: true, opacity: 0.95,
    sizeAttenuation: false, depthWrite: false,
  });
  return new Points(geometry, material);
}
