import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Terrain } from "./Terrain";
import { Trail } from "./Trail";
import type { Terrain as TerrainData } from "../lib/terrain";
import type { TrailPoint } from "../lib/trail";

interface SceneProps {
  terrain: TerrainData;
  trailPoints: TrailPoint[];
  currentIndex: number;
}

export function Scene({ terrain, trailPoints, currentIndex }: SceneProps) {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 26, 32], fov: 45 }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={["#0d1117"]} />
      <fog attach="fog" args={["#0d1117", 30, 70]} />
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[15, 25, 10]}
        intensity={1.2}
        castShadow
      />

      <Terrain terrain={terrain} />
      <Trail points={trailPoints} upToIndex={currentIndex} />

      <OrbitControls
        maxPolarAngle={Math.PI * 0.48}
        minDistance={8}
        maxDistance={60}
        target={[0, 0, 0]}
      />
    </Canvas>
  );
}
