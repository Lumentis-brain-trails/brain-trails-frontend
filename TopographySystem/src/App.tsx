import { useEffect, useMemo, useRef, useState } from "react";
import { Scene } from "./components/Scene";
import { HUD } from "./components/HUD";
import { generateSession } from "./lib/eegSimulator";
import { buildTerrain } from "./lib/terrain";
import { buildTrail } from "./lib/trail";
import "./App.css";

function App() {
  const samples = useMemo(() => generateSession(), []);
  const terrain = useMemo(
    () =>
      buildTerrain(samples, {
        size: 40,
        resolution: 140,
        heightScale: 6,
      }),
    [samples]
  );
  const trailPoints = useMemo(() => buildTrail(samples, terrain), [
    samples,
    terrain,
  ]);

  const duration = samples[samples.length - 1]?.t ?? 1;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);

  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      lastTimeRef.current = null;
      return;
    }

    const tick = (now: number) => {
      if (lastTimeRef.current == null) lastTimeRef.current = now;
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      setCurrentIndex((idx) => {
        const advance = dt * speed * 2; // samples are ~2Hz
        const next = idx + advance;
        if (next >= samples.length - 1) {
          setIsPlaying(false);
          return samples.length - 1;
        }
        return next;
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, speed, samples.length]);

  const flooredIndex = Math.floor(currentIndex);
  const sample = samples[flooredIndex];
  const progress = samples.length > 1 ? flooredIndex / (samples.length - 1) : 0;

  const handleScrub = (p: number) => {
    setIsPlaying(false);
    setCurrentIndex(p * (samples.length - 1));
  };

  return (
    <div className="app">
      <Scene
        terrain={terrain}
        trailPoints={trailPoints}
        currentIndex={flooredIndex}
      />
      <HUD
        sample={sample}
        isPlaying={isPlaying}
        onTogglePlay={() => {
          if (progress >= 1) setCurrentIndex(0);
          setIsPlaying((p) => !p);
        }}
        speed={speed}
        onSpeedChange={setSpeed}
        progress={progress}
        onScrub={handleScrub}
        duration={duration}
      />
    </div>
  );
}

export default App;
