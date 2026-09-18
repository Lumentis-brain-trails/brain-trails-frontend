import { useMemo } from "react";
import * as THREE from "three";
import type { Terrain as TerrainData } from "../lib/terrain";

interface TerrainProps {
  terrain: TerrainData;
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
    // topo-map style elevation ramp: water/lowland green -> tan -> rock -> snow
    vec3 c0 = vec3(0.10, 0.24, 0.20); // low valleys
    vec3 c1 = vec3(0.20, 0.42, 0.24); // lowland green
    vec3 c2 = vec3(0.55, 0.52, 0.30); // hillside tan
    vec3 c3 = vec3(0.48, 0.38, 0.28); // rock brown
    vec3 c4 = vec3(0.92, 0.93, 0.95); // peaks
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

    // contour lines at regular elevation intervals, topo-map style.
    // Line width is derived from screen-space derivatives so lines stay a
    // consistent thin width instead of aliasing into speckles on steep slopes.
    float bands = 18.0;
    float hs = h * bands;
    float distToLine = abs(fract(hs) - 0.5) * -1.0 + 0.5; // 0 at line, 0.5 mid-band
    float aa = max(fwidth(hs), 0.0001) * 1.2;
    float line = smoothstep(0.0, aa, distToLine);
    vec3 withContour = mix(vec3(0.15, 0.12, 0.08), lit, line);

    gl_FragColor = vec4(withContour, 1.0);
  }
`;

export function Terrain({ terrain }: TerrainProps) {
  const geometry = useMemo(() => {
    const { size, resolution } = terrain;
    const geo = new THREE.PlaneGeometry(size, size, resolution, resolution);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, terrain.heightAt(x, z));
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }, [terrain]);

  const uniforms = useMemo(
    () => ({
      uMin: { value: terrain.minHeight },
      uMax: { value: terrain.maxHeight },
      uLightDir: { value: new THREE.Vector3(0.5, 1, 0.3) },
    }),
    [terrain]
  );

  return (
    <mesh geometry={geometry} receiveShadow>
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
}
