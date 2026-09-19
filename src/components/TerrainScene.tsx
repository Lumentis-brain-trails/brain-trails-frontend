"use client";

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Line, OrbitControls, Sphere } from "@react-three/drei";
import * as THREE from "three";
import type { Field } from "@/lib/landscape";
import { terrainGeometry, trailOnTerrain } from "@/lib/terrainMesh";
import type { ChartTheme } from "@/lib/theme";

/**
 * The trail's terrain, in 3D: a mesh raised by the session's own energy field and
 * the trail walked across it.
 *
 * Adapted from a collaborator's `TopographySystem` prototype (same shader-ramp
 * look and contour lines), but the height comes from the real energy field built
 * in `src/lib/landscape.ts` — the same Gaussians NeuroMetrics draws in 2D — rather
 * than a band-power noise octave over a simulated session. A basin is a state the
 * session settled into; a ridge is a crossing between two.
 *
 * Exploratory, not diagnostic: height is `-log` of a relative density, in
 * arbitrary units.
 */
export function TerrainScene({
  field,
  trail,
  theme,
  heightScale = 6,
  height = 460,
}: {
  field: Field;
  trail: { x: number; y: number; t: number }[];
  theme: ChartTheme;
  /** World units per unit of energy. */
  heightScale?: number;
  height?: number;
}) {
  const geometry = useMemo(
    () => terrainGeometry(field, heightScale),
    [field, heightScale]
  );
  const trailVertices = useMemo(
    () => trailOnTerrain(trail, field, heightScale),
    [trail, field, heightScale]
  );

  if (geometry.vertices.length === 0 || trailVertices.length < 2) return null;

  const extent = Math.max(
    1,
    ...field.xs.map(Math.abs),
    ...field.ys.map(Math.abs)
  );

  return (
    <div style={{ height, width: "100%" }}>
      <Canvas
        shadows
        camera={{ position: [0, extent * 1.4, extent * 1.8], fov: 45 }}
        gl={{ antialias: true }}
      >
        <color
          attach="background"
          args={[theme.ink === "#1d1d1f" ? "#f5f5f7" : "#0d1117"]}
        />
        <fog
          attach="fog"
          args={[
            theme.ink === "#1d1d1f" ? "#f5f5f7" : "#0d1117",
            extent * 2,
            extent * 5,
          ]}
        />
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[extent, extent * 2, extent]}
          intensity={1.2}
          castShadow
        />

        <Terrain geometry={geometry} />
        <Trail
          vertices={trailVertices}
          trail0={theme.trail0}
          trail1={theme.trail1}
        />
        <Sphere
          args={[extent * 0.012, 16, 16]}
          position={[
            trailVertices[0].x,
            trailVertices[0].y,
            trailVertices[0].z,
          ]}
        >
          <meshStandardMaterial color={theme.trailStart} />
        </Sphere>
        <Sphere
          args={[extent * 0.014, 16, 16]}
          position={[
            trailVertices[trailVertices.length - 1].x,
            trailVertices[trailVertices.length - 1].y,
            trailVertices[trailVertices.length - 1].z,
          ]}
        >
          <meshStandardMaterial
            color={theme.trailEnd}
            emissive={theme.trailEnd}
            emissiveIntensity={0.8}
          />
        </Sphere>

        <OrbitControls
          maxPolarAngle={Math.PI * 0.48}
          minDistance={extent * 0.4}
          maxDistance={extent * 4}
        />
      </Canvas>
    </div>
  );
}

const vertexShader = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  uniform float uMin;
  uniform float uMax;
  uniform vec3 uLightDir;

  vec3 ramp(float h) {
    // Topo-map style: basin (heavily visited, low energy) to ridge (barrier).
    vec3 c0 = vec3(0.10, 0.24, 0.20);
    vec3 c1 = vec3(0.20, 0.42, 0.24);
    vec3 c2 = vec3(0.55, 0.52, 0.30);
    vec3 c3 = vec3(0.48, 0.38, 0.28);
    vec3 c4 = vec3(0.92, 0.93, 0.95);
    if (h < 0.25) return mix(c0, c1, h / 0.25);
    if (h < 0.55) return mix(c1, c2, (h - 0.25) / 0.30);
    if (h < 0.8) return mix(c2, c3, (h - 0.55) / 0.25);
    return mix(c3, c4, (h - 0.8) / 0.20);
  }

  void main() {
    float h = clamp((vWorldPos.y - uMin) / max(0.0001, (uMax - uMin)), 0.0, 1.0);
    vec3 base = ramp(h);
    float diffuse = max(dot(normalize(vNormal), normalize(uLightDir)), 0.0);
    vec3 lit = base * (0.45 + 0.65 * diffuse);

    float bands = 14.0;
    float hs = h * bands;
    float distToLine = abs(fract(hs) - 0.5) * -1.0 + 0.5;
    float aa = max(fwidth(hs), 0.0001) * 1.2;
    float line = smoothstep(0.0, aa, distToLine);
    vec3 withContour = mix(vec3(0.15, 0.12, 0.08), lit, line);
    gl_FragColor = vec4(withContour, 1.0);
  }
`;

function Terrain({
  geometry,
}: {
  geometry: ReturnType<typeof terrainGeometry>;
}) {
  const geo = useMemo(() => {
    const { resolution, vertices } = geometry;
    const plane = new THREE.PlaneGeometry(
      1,
      1,
      resolution.x - 1,
      resolution.y - 1
    );
    plane.rotateX(-Math.PI / 2);
    const pos = plane.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < vertices.length; i += 1) {
      pos.setXYZ(i, vertices[i].x, vertices[i].y, vertices[i].z);
    }
    pos.needsUpdate = true;
    plane.computeVertexNormals();
    return plane;
  }, [geometry]);

  const uniforms = useMemo(
    () => ({
      uMin: { value: geometry.minHeight },
      uMax: { value: geometry.maxHeight },
      uLightDir: { value: new THREE.Vector3(0.5, 1, 0.3) },
    }),
    [geometry]
  );

  return (
    <mesh geometry={geo} receiveShadow>
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
}

function Trail({
  vertices,
  trail0,
  trail1,
}: {
  vertices: ReturnType<typeof trailOnTerrain>;
  trail0: string;
  trail1: string;
}) {
  const points = useMemo(
    () => vertices.map((v) => new THREE.Vector3(v.x, v.y, v.z)),
    [vertices]
  );
  const colors = useMemo(() => {
    const from = new THREE.Color(trail0);
    const to = new THREE.Color(trail1);
    const first = vertices[0]?.t ?? 0;
    const last = vertices[vertices.length - 1]?.t ?? 1;
    const span = Math.max(last - first, 1e-9);
    return vertices.map((v) => from.clone().lerp(to, (v.t - first) / span));
  }, [vertices, trail0, trail1]);

  return <Line points={points} vertexColors={colors} lineWidth={2.5} />;
}
