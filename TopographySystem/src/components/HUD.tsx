import { BANDS } from "../lib/bands";
import type { Sample } from "../lib/eegSimulator";

interface HUDProps {
  sample: Sample | undefined;
  isPlaying: boolean;
  onTogglePlay: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  progress: number; // 0..1
  onScrub: (progress: number) => void;
  duration: number;
}

export function HUD({
  sample,
  isPlaying,
  onTogglePlay,
  speed,
  onSpeedChange,
  progress,
  onScrub,
  duration,
}: HUDProps) {
  return (
    <div className="hud">
      <div className="hud-panel hud-top">
        <div className="brand">
          <span className="brand-dot" />
          Brainscape <span className="brand-sub">prototype</span>
        </div>
        <div className="phase">{sample?.phase ?? "—"}</div>
      </div>

      <div className="hud-panel hud-bands">
        {BANDS.map((band) => {
          const value = sample?.bands[band.name] ?? 0;
          const isDominant = sample?.dominant === band.name;
          return (
            <div className="band-row" key={band.name}>
              <div className="band-label">
                <span
                  className="band-swatch"
                  style={{ background: band.color }}
                />
                <span className={isDominant ? "band-name dominant" : "band-name"}>
                  {band.label}
                </span>
                <span className="band-hz">{band.hzRange}</span>
              </div>
              <div className="band-track">
                <div
                  className="band-fill"
                  style={{
                    width: `${value * 100}%`,
                    background: band.color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="hud-panel hud-transport">
        <button className="play-btn" onClick={onTogglePlay}>
          {isPlaying ? "Pause" : "Play"}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={progress}
          onChange={(e) => onScrub(Number(e.target.value))}
          className="scrub"
        />
        <span className="time">
          {formatTime(progress * duration)} / {formatTime(duration)}
        </span>
        <select
          value={speed}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
          className="speed"
        >
          <option value={0.5}>0.5x</option>
          <option value={1}>1x</option>
          <option value={2}>2x</option>
          <option value={4}>4x</option>
        </select>
      </div>
    </div>
  );
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
