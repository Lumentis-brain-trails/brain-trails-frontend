// Mock model of the 5 EEG bands a Muse headband reports.
// Each band gets a spatial "personality" used to shape the terrain and trail:
// low frequency bands (delta) create broad rolling features, high frequency
// bands (gamma) create fine jittery detail. Angle is the compass direction
// the trail leans toward when that band dominates.

export type BandName = "delta" | "theta" | "alpha" | "beta" | "gamma";

export interface BandInfo {
  name: BandName;
  label: string;
  hzRange: string;
  meaning: string;
  color: string;
  noiseFrequency: number; // spatial frequency this band contributes to terrain
  noiseAmplitude: number; // relative height contribution
  angle: number; // radians, direction bias for trail movement
}

export const BANDS: BandInfo[] = [
  {
    name: "delta",
    label: "Delta",
    hzRange: "0.5-4 Hz",
    meaning: "deep rest",
    color: "#3b6fd6",
    noiseFrequency: 0.02,
    noiseAmplitude: 1.0,
    angle: 0,
  },
  {
    name: "theta",
    label: "Theta",
    hzRange: "4-8 Hz",
    meaning: "meditative",
    color: "#4fb0a5",
    noiseFrequency: 0.045,
    noiseAmplitude: 0.7,
    angle: (2 * Math.PI) / 5,
  },
  {
    name: "alpha",
    label: "Alpha",
    hzRange: "8-13 Hz",
    meaning: "relaxed focus",
    color: "#7cc26b",
    noiseFrequency: 0.09,
    noiseAmplitude: 0.5,
    angle: (4 * Math.PI) / 5,
  },
  {
    name: "beta",
    label: "Beta",
    hzRange: "13-30 Hz",
    meaning: "active thinking",
    color: "#e0a83e",
    noiseFrequency: 0.18,
    noiseAmplitude: 0.35,
    angle: (6 * Math.PI) / 5,
  },
  {
    name: "gamma",
    label: "Gamma",
    hzRange: "30-100 Hz",
    meaning: "high engagement",
    color: "#d65c5c",
    noiseFrequency: 0.35,
    noiseAmplitude: 0.2,
    angle: (8 * Math.PI) / 5,
  },
];

export const BAND_NAMES = BANDS.map((b) => b.name);
