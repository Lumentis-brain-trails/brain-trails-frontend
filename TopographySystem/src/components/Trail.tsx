import { useMemo } from "react";
import { Line, Sphere } from "@react-three/drei";
import * as THREE from "three";
import type { TrailPoint } from "../lib/trail";
import { BANDS } from "../lib/bands";

interface TrailProps {
  points: TrailPoint[];
  upToIndex: number;
}

export function Trail({ points, upToIndex }: TrailProps) {
  const visible = points.slice(0, Math.max(2, upToIndex + 1));

  const vectors = useMemo(
    () => visible.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
    [visible]
  );

  const colors = useMemo(
    () =>
      visible.map((p) => {
        const info = BANDS.find((b) => b.name === p.dominant)!;
        return new THREE.Color(info.color);
      }),
    [visible]
  );

  const current = visible[visible.length - 1];
  const currentColor = current
    ? BANDS.find((b) => b.name === current.dominant)!.color
    : "#ffffff";

  if (vectors.length < 2) return null;

  return (
    <group>
      <Line
        points={vectors}
        vertexColors={colors}
        lineWidth={3}
        dashed={false}
      />
      {current && (
        <Sphere args={[0.22, 16, 16]} position={[current.x, current.y + 0.05, current.z]}>
          <meshStandardMaterial
            color={currentColor}
            emissive={currentColor}
            emissiveIntensity={1.4}
          />
        </Sphere>
      )}
    </group>
  );
}
