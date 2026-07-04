import { useEffect, useRef } from 'react';
import * as THREE from 'three';

import type { FerryVessel } from '../../rayfin/data/FerryVessel';
import type { TourismSite } from '../../rayfin/data/TourismSite';

interface HarbourSceneProps {
  sites: TourismSite[];
  /** Live ferry positions from Fabric. When present, drives the ferries. */
  ferries?: FerryVessel[];
  /** Fired with the site the lead ferry is currently closest to. */
  onArrive?: (site: TourismSite) => void;
}

/** World units per site-grid unit. Spreads the voxel harbour out a little. */
const SCALE = 1.35;
const WATER_LEVEL = 0;
const FERRY_SPEED = 7; // world units per second (fallback route loop)
const DWELL_SECONDS = 1.4; // pause time at each stop (fallback route loop)
// How quickly a live ferry eases toward its latest reported position. Higher =
// snappier; lower = smoother. Scaled by frame delta so it is frame-rate stable.
const FERRY_LERP_SPEED = 1.6;

/** Build a simple voxel box mesh. */
function box(
  w: number,
  h: number,
  d: number,
  color: THREE.ColorRepresentation,
  opts: { flat?: boolean; opacity?: number } = {}
): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(w, h, d);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.flat ? 1 : 0.75,
    metalness: 0,
    flatShading: true,
    transparent: opts.opacity !== undefined,
    opacity: opts.opacity ?? 1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

/** A little voxel tree for parks/gardens. */
function tree(): THREE.Group {
  const group = new THREE.Group();
  const trunk = box(0.4, 1, 0.4, '#6b4a2b');
  trunk.position.y = 0.5;
  const canopy = box(1.4, 1.4, 1.4, '#3f7a3a');
  canopy.position.y = 1.6;
  group.add(trunk, canopy);
  return group;
}

/** A fluffy voxel cloud built from a cluster of white boxes. */
function createCloud(): THREE.Group {
  const group = new THREE.Group();
  const puffs: [number, number, number, number][] = [
    [0, 0, 0, 2.4],
    [1.6, -0.2, 0.3, 1.8],
    [-1.5, -0.1, -0.2, 1.6],
    [0.4, 0.6, -0.4, 1.5],
  ];
  puffs.forEach(([x, y, z, s]) => {
    const puff = box(s, s * 0.7, s, '#ffffff', { flat: true, opacity: 0.92 });
    puff.position.set(x, y, z);
    group.add(puff);
  });
  return group;
}

/** A small drifting sailboat to give the harbour some life. */
function createSailboat(): THREE.Group {
  const group = new THREE.Group();
  const hull = box(1.4, 0.4, 0.6, '#e8e2d5');
  hull.position.y = 0.2;
  const mast = box(0.12, 1.6, 0.12, '#8a6a3a');
  mast.position.y = 1;
  const sail = box(0.1, 1.1, 0.9, '#f4f1e8');
  sail.position.set(0.05, 1.05, 0.15);
  group.add(hull, mast, sail);
  return group;
}

/** A tiny seagull: two angled white wing boxes. */
function createSeagull(): THREE.Group {
  const group = new THREE.Group();
  const left = box(0.7, 0.08, 0.22, '#f7f7f7', { flat: true });
  left.position.x = -0.35;
  left.rotation.z = 0.4;
  const right = box(0.7, 0.08, 0.22, '#f7f7f7', { flat: true });
  right.position.x = 0.35;
  right.rotation.z = -0.4;
  group.add(left, right);
  return group;
}

/**
 * Build a voxel landmark for a site. A few well-known sites get bespoke
 * silhouettes; everything else gets a tidy stacked-box building.
 */
function createLandmark(site: TourismSite): THREE.Group {
  const group = new THREE.Group();
  const name = site.name.toLowerCase();
  const color = site.color;

  // Base pad so every landmark reads as sitting on a patch of land.
  const padColor =
    site.category === 'beach'
      ? '#e6d3a3'
      : site.category === 'park'
        ? '#4f8f4a'
        : site.category === 'island'
          ? '#8a7f6b'
          : '#9a9186';
  const pad = box(4.4, 0.6, 4.4, padColor, { flat: true });
  pad.position.y = 0.3;
  group.add(pad);

  if (name.includes('opera')) {
    // Sydney Opera House: three pairs of nested, tilted white sail shells
    // stepping down the point, on a low podium.
    const podium = box(4, 0.5, 2.2, '#d9d2c4', { flat: true });
    podium.position.set(0, 0.75, 0);
    group.add(podium);
    const shellSets: [number, number][] = [
      [-1.2, 1],
      [0.1, 1.2],
      [1.3, 0.85],
    ];
    shellSets.forEach(([x, scale]) => {
      for (let s = 0; s < 3; s++) {
        const h = (2.6 - s * 0.6) * scale;
        const shell = box(1.1 - s * 0.15, h, 1 - s * 0.12, color);
        shell.position.set(x + s * 0.18, 1 + h / 2, -s * 0.22);
        shell.rotation.x = -0.5 + s * 0.12;
        group.add(shell);
      }
    });
  } else if (name.includes('bridge')) {
    // Sydney Harbour Bridge: two stone pylon pairs, a smooth stepped steel
    // arch, hangers, and a road deck spanning the water.
    const pylons: [number, number][] = [
      [-3, -0.7],
      [-3, 0.7],
      [3, -0.7],
      [3, 0.7],
    ];
    pylons.forEach(([x, z]) => {
      const pylon = box(0.7, 3.6, 0.7, '#cfc8bb');
      pylon.position.set(x, 2, z);
      group.add(pylon);
    });
    const steps = 13;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const x = (t - 0.5) * 6;
      const y = 2.4 + Math.sin(t * Math.PI) * 2.4;
      const seg = box(0.6, 0.4, 0.5, color);
      seg.position.set(x, y, 0);
      group.add(seg);
      // Vertical hangers from arch down to the deck.
      if (i % 2 === 0) {
        const drop = y - 2.3;
        const hanger = box(0.08, drop, 0.08, '#8f8a80');
        hanger.position.set(x, 2.3 + drop / 2, 0);
        group.add(hanger);
      }
    }
    const deck = box(6.4, 0.3, 1, '#5c5c5c');
    deck.position.set(0, 2.3, 0);
    group.add(deck);
  } else if (name.includes('luna')) {
    // Amusement-park face arch + a little tower.
    const arch = box(3, 0.6, 0.6, color);
    arch.position.set(0, 3, 1.4);
    const legL = box(0.6, 3, 0.6, color);
    legL.position.set(-1.4, 1.5, 1.4);
    const legR = box(0.6, 3, 0.6, color);
    legR.position.set(1.4, 1.5, 1.4);
    const tower = box(1, 3.4, 1, '#d94f4f');
    tower.position.set(0, 1.7, -0.6);
    group.add(arch, legL, legR, tower);
  } else if (site.category === 'beach') {
    // Low sandy dunes with a beach umbrella.
    const dune = box(2.6, 0.8, 2.6, '#dcc487', { flat: true });
    dune.position.y = 0.9;
    const pole = box(0.2, 1.4, 0.2, '#8a6a3a');
    pole.position.set(0.6, 1.6, 0.6);
    const shade = box(1.6, 0.3, 1.6, '#d14f4f');
    shade.position.set(0.6, 2.3, 0.6);
    group.add(dune, pole, shade);
  } else if (site.category === 'park') {
    const t1 = tree();
    t1.position.set(-1, 0.6, -0.6);
    const t2 = tree();
    t2.position.set(1, 0.6, 0.8);
    t2.scale.setScalar(0.8);
    group.add(t1, t2);
  } else if (site.category === 'island') {
    const mound = box(2.4, 1, 2.4, '#8f8674', { flat: true });
    mound.position.y = 1;
    const towerBase = box(1, 2, 1, color);
    towerBase.position.y = 2.2;
    group.add(mound, towerBase);
  } else {
    // Generic little precinct: a cluster of stacked-box buildings.
    const heights = [3, 2.2, 2.6];
    const offsets: [number, number][] = [
      [-1.1, -0.6],
      [0.9, 0.4],
      [0, 1.2],
    ];
    heights.forEach((h, i) => {
      const [x, z] = offsets[i];
      const b = box(1.4, h, 1.4, color);
      b.position.set(x, 0.6 + h / 2, z);
      group.add(b);
      const roof = box(1.5, 0.3, 1.5, '#3d3d3d');
      roof.position.set(x, 0.6 + h + 0.15, z);
      group.add(roof);
    });
  }

  // A small marker post so each stop is easy to spot from above.
  const post = box(0.25, 2, 0.25, '#2f3b45');
  post.position.set(1.7, 1.6, 1.7);
  const flag = box(0.9, 0.5, 0.08, color);
  flag.position.set(2.1, 2.4, 1.7);
  group.add(post, flag);

  return group;
}

/** A chunky voxel ferry with a tunable hull colour. */
function createFerry(hullColor: THREE.ColorRepresentation): THREE.Group {
  const group = new THREE.Group();
  const hull = box(3.4, 0.9, 1.6, hullColor);
  hull.position.y = 0.45;
  const hullTop = box(3.4, 0.5, 1.6, '#f2f0e6');
  hullTop.position.y = 1.1;
  const cabin = box(2, 0.9, 1.2, '#ffffff');
  cabin.position.set(-0.2, 1.75, 0);
  const roof = box(2.1, 0.2, 1.3, hullColor);
  roof.position.set(-0.2, 2.3, 0);
  const funnel = box(0.5, 0.9, 0.5, '#d9b641');
  funnel.position.set(-1, 2.6, 0);
  const bow = box(0.8, 0.9, 1.2, hullColor);
  bow.position.set(1.9, 0.5, 0);
  group.add(hull, hullTop, cabin, roof, funnel, bow);
  return group;
}

/** A short trailing wake of fading foam boxes behind a ferry. */
function createWake(): THREE.Group {
  const group = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const scale = 1 - i * 0.15;
    const puff = box(0.8 * scale, 0.12, 0.7 * scale, '#eaf4f7', {
      flat: true,
      opacity: 0.5 - i * 0.08,
    });
    // Trail out behind the stern (ferry forward is +x, so stern is -x).
    puff.position.set(-2 - i * 0.7, -0.35, 0);
    group.add(puff);
  }
  return group;
}

/** Managed state for a single live ferry mesh. */
interface FerryEntry {
  group: THREE.Group;
  current: THREE.Vector3;
  target: THREE.Vector3;
  heading: number;
}

/** Dispose every geometry and material under a scene object. */
function disposeObject(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else if (mat) mat.dispose();
  });
}

export function HarbourScene({ sites, ferries, onArrive }: HarbourSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onArriveRef = useRef(onArrive);
  onArriveRef.current = onArrive;
  // Latest live vessels, read by the animation loop without rebuilding the scene.
  const ferriesRef = useRef<FerryVessel[] | undefined>(ferries);
  ferriesRef.current = ferries;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || sites.length === 0) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#8ec5e6');
    scene.fog = new THREE.Fog('#a9d3ea', 120, 320);

    // Route points in world space, ordered by routeOrder.
    const route = [...sites]
      .sort((a, b) => a.routeOrder - b.routeOrder)
      .map((site) => ({
        site,
        pos: new THREE.Vector3(site.posX * SCALE, WATER_LEVEL, site.posZ * SCALE),
      }));

    // Compute bounds to frame the whole harbour.
    const boundsBox = new THREE.Box3();
    route.forEach((r) => boundsBox.expandByPoint(r.pos));
    const center = boundsBox.getCenter(new THREE.Vector3());
    const size = boundsBox.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z) + 16;

    // Animated low-poly water surface.
    const waterSize = span * 1.8;
    const waterGeo = new THREE.PlaneGeometry(waterSize, waterSize, 32, 32);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshStandardMaterial({
      color: '#2f7cad',
      roughness: 0.85,
      metalness: 0.1,
      flatShading: true,
      transparent: true,
      opacity: 0.96,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.set(center.x, WATER_LEVEL - 0.15, center.z);
    scene.add(water);

    // Landmarks.
    route.forEach((r) => {
      const landmark = createLandmark(r.site);
      landmark.position.copy(r.pos);
      landmark.scale.setScalar(1.5);
      scene.add(landmark);
    });

    // Ambient life: drifting sailboats and circling seagulls.
    const sailboats = [0, 1, 2].map((i) => {
      const boat = createSailboat();
      boat.scale.setScalar(1.3);
      boat.userData.phase = i * 2.1;
      boat.userData.radius = span * 0.28 + i * 3;
      scene.add(boat);
      return boat;
    });
    const seagulls = [0, 1, 2, 3].map((i) => {
      const gull = createSeagull();
      gull.userData.phase = i * 1.6;
      gull.userData.radius = span * 0.2 + i * 2.5;
      gull.userData.height = 20 + i * 2;
      scene.add(gull);
      return gull;
    });

    // Drifting voxel clouds and a warm sun.
    const clouds = [0, 1, 2, 3].map((i) => {
      const cloud = createCloud();
      cloud.scale.setScalar(2 + (i % 2));
      cloud.position.set(
        center.x - span + i * span * 0.6,
        34 + (i % 2) * 4,
        center.z - span * 0.4 + i * 6
      );
      cloud.userData.speed = 1.2 + i * 0.3;
      scene.add(cloud);
      return cloud;
    });
    const sun = box(6, 6, 6, '#ffe38a', { flat: true, opacity: 0.95 });
    sun.position.set(center.x - span, 46, center.z - span);
    scene.add(sun);

    // Fallback ferry (used when there is no live vessel feed).
    const fallbackFerry = createFerry('#1f6f4a');
    fallbackFerry.scale.setScalar(1.4);
    fallbackFerry.position.copy(route[0].pos);
    fallbackFerry.position.y = WATER_LEVEL + 0.1;
    fallbackFerry.add(createWake());
    scene.add(fallbackFerry);

    // Live ferry meshes, keyed by vessel id.
    const liveFerries = new Map<string, FerryEntry>();
    const liveGroup = new THREE.Group();
    scene.add(liveGroup);

    // Lighting.
    const hemi = new THREE.HemisphereLight('#ffffff', '#4a6a80', 1.05);
    scene.add(hemi);
    const sunLight = new THREE.DirectionalLight('#fff4e0', 1.15);
    sunLight.position.set(-20, 44, -20);
    scene.add(sunLight);
    scene.add(new THREE.AmbientLight('#ffffff', 0.28));

    // Isometric orthographic camera.
    const frustum = span * 0.62;
    const camera = new THREE.OrthographicCamera(-frustum, frustum, frustum, -frustum, 0.1, 2000);
    const camOffset = new THREE.Vector3(60, 70, 60);
    camera.position.copy(center).add(camOffset);
    camera.lookAt(center);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight || 1;
      const aspect = w / h;
      camera.left = -frustum * aspect;
      camera.right = frustum * aspect;
      camera.top = frustum;
      camera.bottom = -frustum;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    // Fallback ferry travel state machine along the looping route.
    let segment = 0;
    let dwellTimer = 0;
    let arrived = true; // start docked at the first stop
    let reportedSiteId: string | null = null;
    if (route.length > 0) {
      onArriveRef.current?.(route[0].site);
      reportedSiteId = route[0].site.id;
    }

    /** Report the site nearest to a world position (used in live mode). */
    const reportNearest = (pos: THREE.Vector3) => {
      let nearest = route[0];
      let best = Infinity;
      for (const r of route) {
        const d = r.pos.distanceToSquared(pos);
        if (d < best) {
          best = d;
          nearest = r;
        }
      }
      if (nearest.site.id !== reportedSiteId) {
        reportedSiteId = nearest.site.id;
        onArriveRef.current?.(nearest.site);
      }
    };

    /** Sync the live ferry meshes with the latest vessel feed. */
    const syncLiveFerries = (vessels: FerryVessel[]) => {
      const seen = new Set<string>();
      for (const vessel of vessels) {
        seen.add(vessel.id);
        const target = new THREE.Vector3(
          vessel.posX * SCALE,
          WATER_LEVEL,
          vessel.posZ * SCALE
        );
        const headingRad = (vessel.heading * Math.PI) / 180;
        let entry = liveFerries.get(vessel.id);
        if (!entry) {
          const group = createFerry(vessel.color || '#1f6f4a');
          group.scale.setScalar(1.4);
          group.position.copy(target);
          group.add(createWake());
          liveGroup.add(group);
          entry = {
            group,
            current: target.clone(),
            target: target.clone(),
            heading: headingRad,
          };
          liveFerries.set(vessel.id, entry);
        }
        entry.target.copy(target);
        entry.heading = headingRad;
      }
      // Remove vessels no longer in the feed.
      for (const [id, entry] of liveFerries) {
        if (!seen.has(id)) {
          liveGroup.remove(entry.group);
          disposeObject(entry.group);
          liveFerries.delete(id);
        }
      }
    };

    /** Remove and dispose every live ferry mesh (leaving fallback mode). */
    const clearLiveFerries = () => {
      for (const [id, entry] of liveFerries) {
        liveGroup.remove(entry.group);
        disposeObject(entry.group);
        liveFerries.delete(id);
      }
    };

    const clock = new THREE.Clock();
    let frameId = 0;
    const waterPos = waterGeo.attributes.position;

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.elapsedTime;

      // Ripple the water surface.
      for (let i = 0; i < waterPos.count; i++) {
        const x = waterPos.getX(i);
        const z = waterPos.getZ(i);
        const y =
          Math.sin(x * 0.15 + elapsed * 1.1) * 0.28 +
          Math.cos(z * 0.19 + elapsed * 0.9) * 0.22;
        waterPos.setY(i, y);
      }
      waterPos.needsUpdate = true;
      waterGeo.computeVertexNormals();

      // Drift clouds across the sky, wrapping around.
      for (const cloud of clouds) {
        cloud.position.x += cloud.userData.speed * delta;
        if (cloud.position.x > center.x + span * 1.4) {
          cloud.position.x = center.x - span * 1.4;
        }
      }

      // Bob sailboats along gentle circles.
      for (const boat of sailboats) {
        const a = elapsed * 0.15 + boat.userData.phase;
        const radius = boat.userData.radius;
        boat.position.set(
          center.x + Math.cos(a) * radius,
          WATER_LEVEL + 0.1 + Math.sin(elapsed * 1.5 + boat.userData.phase) * 0.08,
          center.z + Math.sin(a) * radius
        );
        boat.rotation.y = -a + Math.PI / 2;
      }

      // Circle seagulls overhead with a flapping tilt.
      for (const gull of seagulls) {
        const a = elapsed * 0.5 + gull.userData.phase;
        const radius = gull.userData.radius;
        gull.position.set(
          center.x + Math.cos(a) * radius,
          gull.userData.height + Math.sin(elapsed + gull.userData.phase),
          center.z + Math.sin(a) * radius
        );
        gull.rotation.y = -a;
        gull.rotation.z = Math.sin(elapsed * 6 + gull.userData.phase) * 0.3;
      }

      const vessels = ferriesRef.current;
      const hasLive = !!vessels && vessels.length > 0;

      if (hasLive) {
        // Live mode: drive each ferry toward its reported position.
        fallbackFerry.visible = false;
        syncLiveFerries(vessels!);
        let lead: THREE.Vector3 | null = null;
        for (const entry of liveFerries.values()) {
          entry.current.lerp(entry.target, Math.min(1, delta * FERRY_LERP_SPEED));
          entry.group.position.set(
            entry.current.x,
            WATER_LEVEL + 0.1 + Math.sin(elapsed * 2.2) * 0.08,
            entry.current.z
          );
          entry.group.rotation.y = entry.heading - Math.PI / 2;
          if (!lead) lead = entry.current;
        }
        if (lead) reportNearest(lead);
      } else {
        // Fallback mode: loop the static route.
        fallbackFerry.visible = true;
        if (liveFerries.size > 0) clearLiveFerries();
        const from = route[segment].pos;
        const to = route[(segment + 1) % route.length].pos;

        if (arrived) {
          dwellTimer -= delta;
          if (dwellTimer <= 0) arrived = false;
        } else {
          const dir = new THREE.Vector3().subVectors(to, from);
          const dist = dir.length();
          const current = fallbackFerry.position.clone();
          current.y = WATER_LEVEL;
          const travelled = new THREE.Vector3().subVectors(current, from).length();
          const nextT = Math.min(1, (travelled + FERRY_SPEED * delta) / (dist || 1));

          fallbackFerry.position.lerpVectors(from, to, nextT);
          if (dist > 0.001) {
            fallbackFerry.rotation.y = Math.atan2(dir.x, dir.z) - Math.PI / 2;
          }

          if (nextT >= 1) {
            segment = (segment + 1) % route.length;
            arrived = true;
            dwellTimer = DWELL_SECONDS;
            reportedSiteId = route[segment].site.id;
            onArriveRef.current?.(route[segment].site);
          }
        }

        fallbackFerry.position.y =
          WATER_LEVEL + 0.1 + Math.sin(elapsed * 2.2) * 0.08;
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.dispose();
      disposeObject(scene);
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [sites]);

  return <div ref={containerRef} className="h-full w-full" />;
}
