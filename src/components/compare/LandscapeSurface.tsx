"use client";

/**
 * A person's brain landscape in 3D, with trails resting on it (backend V3-0013).
 *
 * Height is where the person's windows landed, blurred at the map's own fixed scale:
 * peaks are where they spent the most time, shaded from one side so the relief reads. Hovering the ground says what was happening
 * there, from every recording that went there. A trail is drawn **on** the surface - each
 * window lifted to the ground's height at its place - so it rides over the peaks it
 * visited instead of floating above a flat drawing.
 *
 * The vertical axis is kept low (`ASPECT`) so ridges hide as little of a trail as
 * possible, and the camera can be shared: the comparison view hands both columns one
 * camera, so turning one landscape turns the other and the two blocks stay comparable.
 *
 * `relief` turns the hills into wells (`groundOf`): the same map as a potential, the
 * time spent a basin, the ground never reached a flat plateau faded into the page. The
 * heights are replaced before anything is lifted onto them, so trails, the cursor and
 * neurofeedback targets sit on whichever surface is drawn.
 */
import dynamic from "next/dynamic";
import { useMemo, useSyncExternalStore } from "react";
import type { Data, Layout } from "plotly.js";
import { useLabelNamer } from "@/components/compare/useLabelNamer";
import {
  type BrainLandscape,
  type Ground,
  type Relief,
  axes,
  framedTrail,
  groundOf,
  heightAt,
  hoverMatrix,
  onMap,
  wellsColorscale,
} from "@/lib/brainLandscape";
import {
  CHART_THEMES,
  type ChartTheme,
  type ThemeName,
  useChartTheme,
} from "@/lib/theme";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

/**
 * The scene box: low (height two fifths of the width) so ridges hide little, and as large as
 * the plot can hold - which on a phone, where a comparison column is a few hundred pixels
 * wide, is much less.
 */
const ASPECT = { x: 1.9, y: 1.9, z: 0.75 };
const ASPECT_NARROW = { x: 0.85, y: 0.85, z: 0.34 };
const NARROW = "(max-width: 640px)";
/** A narrow scene is small; a tall plot around it would only add empty space. */
const NARROW_MAX_HEIGHT = 220;

function subscribeNarrow(onChange: () => void): () => void {
  const query = window.matchMedia?.(NARROW);
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

function useNarrow(): boolean {
  return useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia?.(NARROW).matches ?? false,
    () => false
  );
}
/**
 * Low ambient light and a strong light from one side, low over the ground, so every slope
 * facing away falls into shade and the relief reads at a glance; a little gloss on the
 * slopes facing it. The surface is opaque: a translucent one washes the shading out.
 */
const LIGHTING = {
  ambient: 0.3,
  diffuse: 1,
  specular: 0.15,
  roughness: 0.55,
  fresnel: 0.1,
};
const LIGHT = { x: -1e4, y: 1e4, z: 2.5e3 };
const CONTOUR_STEP = 0.05;
/** How far above the ground a trail rides, in landscape heights. */
const LIFT = 0.025;
/** How high the live position's stem rises above the ground, so no ridge hides it. */
const STEM = 0.35;
/**
 * In the wells the dot sits in a basin and the plateau around it is the highest ground:
 * the stem's top clears the plateau (height 1) by half a stem, wherever the dot is.
 */
const WELLS_STEM_TOP = 1 + STEM / 2;
/** Points around a target's radius, draped on the ground. */
const RING_POINTS = 48;

export type Camera = NonNullable<NonNullable<Layout["scene"]>["camera"]>;

export const DEFAULT_CAMERA: Camera = {
  eye: { x: 1.05, y: -1.25, z: 1.0 },
  up: { x: 0, y: 0, z: 1 },
  center: { x: 0, y: 0, z: -0.2 },
};

export interface SurfaceTrail {
  x: readonly number[];
  y: readonly number[];
  /** One colour per window. */
  colors: readonly string[];
  /** Plotly marker symbols, one per window: what the person did. */
  symbols?: readonly string[];
  /** One hover line per window. */
  text?: readonly string[];
  /** Draw the line only, no markers: a recording's context, not the lit block. */
  faint?: boolean;
}

/** Where a neurofeedback block leads (V4-0010): points of the map, and their radius. */
export interface SurfaceTargets {
  points: readonly (readonly number[])[];
  radius: number;
  /** The drawing of the map the points belong to; on another one they are not drawn. */
  epoch: number;
}

export function LandscapeSurface({
  landscape,
  trails = [],
  cursor = null,
  height = 420,
  camera = DEFAULT_CAMERA,
  onCamera,
  hover = true,
  live = false,
  scheme,
  relief = "hills",
  targets = null,
  title,
}: {
  landscape: BrainLandscape;
  trails?: readonly SurfaceTrail[];
  /** The window under a column's slider. */
  cursor?: { x: number; y: number } | null;
  height?: number;
  camera?: Camera;
  onCamera?: (camera: Camera) => void;
  /** Hover the ground; off where a page has its own way to read it. */
  hover?: boolean;
  /**
   * The cursor is where a live session is now: a bright dot with a halo, on a stem
   * that rises above the hills, so it stays in sight as it moves and the map turns.
   */
  live?: boolean;
  /** A fixed scheme, for a view over the black stage whatever the page's theme. */
  scheme?: ThemeName;
  /** Hills (the default) or wells (`groundOf`). */
  relief?: Relief;
  /** A neurofeedback block's targets, each a dot and its radius on the ground. */
  targets?: SurfaceTargets | null;
  title: string;
}) {
  const pageTheme = useChartTheme();
  const theme = scheme ? CHART_THEMES[scheme] : pageTheme;
  const namer = useLabelNamer();
  const narrow = useNarrow();
  const plotHeight = narrow ? Math.min(height, NARROW_MAX_HEIGHT) : height;
  // the drawn ground: every height below is read from it, never from `landscape`
  const shaped = useMemo(
    () => groundOf(landscape, relief),
    [landscape, relief]
  );
  const ground = useMemo(() => {
    const { xs, ys } = axes(landscape);
    return {
      xs,
      ys,
      text: hover ? hoverMatrix(landscape, namer.category) : undefined,
    };
  }, [hover, landscape, namer.category]);

  // Plotly redraws the whole 3D scene, contours included, whenever it is handed a new
  // figure: a live room re-renders this several times a second (signal, quality,
  // windows), so the figure is rebuilt only when what it shows changes, and the
  // cursor is read by value, not by the object a caller makes on every render.
  const cx = cursor?.x ?? null;
  const cy = cursor?.y ?? null;
  const hasCursor = cursor !== null;
  const data = useMemo((): Data[] => {
    const map = shaped.landscape;
    const lift = (x: number, y: number) => heightAt(map, x, y) + LIFT;
    const at =
      cx !== null && cy !== null && onMap(map, cx, cy)
        ? { x: cx, y: cy }
        : null;
    const stemTop =
      relief === "wells" ? () => WELLS_STEM_TOP : (g: number) => g + STEM;
    const shownTargets =
      targets && targets.epoch === map.epoch ? targets : null;
    return [
      surfaceTrace(shaped, ground, hover, theme),
      ...trails.map((trail) => trailTrace(map, trail, lift, theme)),
      ...(shownTargets ? targetTraces(map, shownTargets, lift, theme) : []),
      // The cursor's traces are always there, hidden when it is off the map: a figure
      // whose number of traces changes is torn down and rebuilt, which shows as a
      // flash each time a live position crosses the map's edge.
      ...(live
        ? liveCursor(at, at ? lift(at.x, at.y) : 0, theme.trailEnd, stemTop)
        : hasCursor
          ? [sliderCursor(at, at ? lift(at.x, at.y) : 0, theme)]
          : []),
    ];
  }, [
    shaped,
    ground,
    hover,
    theme,
    trails,
    targets,
    relief,
    live,
    cx,
    cy,
    hasCursor,
  ]);

  // the scene is the map's frame, not every point's: the backend frames 90% of the
  // windows, and a trail's outliers fall outside it rather than zooming the map out
  const layout = useMemo((): Partial<Layout> => {
    const hidden = { visible: false, showspikes: false } as const;
    const [x0, x1, y0, y1] = landscape.bounds;
    return {
      height: plotHeight,
      margin: { l: 0, r: 0, t: 0, b: 0 },
      paper_bgcolor: "rgba(0,0,0,0)",
      showlegend: false,
      hoverlabel: {
        bgcolor: theme.ink,
        bordercolor: theme.ink,
        font: { color: theme.canvas, size: 12 },
      },
      // a new camera from the other column replaces this one; the reader's own turning
      // is kept between renders otherwise
      uirevision: JSON.stringify(camera),
      scene: {
        xaxis: { ...hidden, range: [x0, x1], autorange: false },
        yaxis: { ...hidden, range: [y0, y1], autorange: false },
        zaxis: hidden,
        aspectmode: "manual",
        aspectratio: narrow ? ASPECT_NARROW : ASPECT,
        camera,
        bgcolor: "rgba(0,0,0,0)",
      },
    };
  }, [camera, landscape.bounds, narrow, plotHeight, theme]);

  return (
    <div role="img" aria-label={title} className="w-full">
      <Plot
        data={data}
        layout={layout}
        config={PLOT_CONFIG}
        useResizeHandler
        style={{ width: "100%", height: plotHeight }}
        onRelayout={(event) => {
          const next = (event as Record<string, unknown>)["scene.camera"];
          if (next && onCamera) onCamera(next as Camera);
        }}
      />
    </div>
  );
}

/** One object for every render: Plotly compares a new config and may start again. */
const PLOT_CONFIG = { displayModeBar: false, responsive: true };

function surfaceTrace(
  shaped: Ground,
  ground: { xs: number[]; ys: number[]; text: unknown },
  hover: boolean,
  theme: ChartTheme
): Data {
  const wells = shaped.colour !== null;
  return {
    type: "surface",
    x: ground.xs,
    y: ground.ys,
    z: shaped.landscape.grid.z,
    ...(hover && ground.text
      ? {
          text: ground.text as unknown as string[],
          hovertemplate: "%{text}<extra></extra>",
        }
      : { hoverinfo: "skip" as const }),
    showscale: false,
    // the wells are coloured by depth, the plateau faded into the page: the most time
    // is the most saturated colour in both reliefs
    ...(shaped.colour !== null
      ? {
          surfacecolor: shaped.colour,
          cmin: 0,
          cmax: 1,
          colorscale: wellsColorscale(theme.landscape, theme.canvas),
        }
      : {
          colorscale: theme.landscape.map(([at, colour]) => [at, colour]) as [
            number,
            string,
          ][],
        }),
    // contour lines every twentieth of the peak: the landscape read as a topographic
    // map, fine enough that two close hills keep their own rings; none on the plateau
    contours: {
      z: {
        show: true,
        start: CONTOUR_STEP,
        end: wells ? 1 - CONTOUR_STEP / 2 : 1,
        size: CONTOUR_STEP,
        color: theme.contour,
        width: 1,
        highlight: false,
      },
      x: { highlight: false },
      y: { highlight: false },
    } as never,
    lighting: LIGHTING,
    lightposition: LIGHT,
  } as Data;
}

// Optional keys are left out, never set to undefined: Plotly's data cleaning reads
// `"line" in trace.marker` and throws on a marker that is present but undefined.
function trailTrace(
  landscape: BrainLandscape,
  trail: SurfaceTrail,
  lift: (x: number, y: number) => number,
  theme: ChartTheme
): Data {
  const { x, y } = framedTrail(landscape, trail.x, trail.y);
  return {
    type: "scatter3d",
    mode: trail.faint ? "lines" : "lines+markers",
    x,
    y,
    z: x.map((xi, i) => {
      const yi = y[i];
      return xi === null || yi === null ? null : lift(xi, yi);
    }),
    connectgaps: false,
    line: {
      color: trail.faint ? theme.ink3 : theme.ink,
      width: trail.faint ? 2 : 3,
    },
    opacity: trail.faint ? 0.45 : 1,
    ...(trail.text
      ? { text: [...trail.text], hovertemplate: "%{text}<extra></extra>" }
      : { hoverinfo: "skip" as const }),
    ...(trail.faint
      ? {}
      : {
          marker: {
            size: 4,
            color: [...trail.colors],
            symbol: trail.symbols ? ([...trail.symbols] as never) : "circle",
            line: { color: theme.canvas, width: 0.5 },
          },
        }),
  } as Data;
}

/** The window under a comparison's slider: an open ring just over the trail. */
function sliderCursor(
  at: { x: number; y: number } | null,
  ground: number,
  theme: ChartTheme
): Data {
  return {
    type: "scatter3d",
    mode: "markers",
    visible: at !== null,
    x: [at?.x ?? 0],
    y: [at?.y ?? 0],
    z: [ground + LIFT],
    hoverinfo: "skip",
    marker: {
      size: 9,
      color: theme.canvas,
      symbol: "circle-open",
      line: { color: theme.ink, width: 3 },
    },
  } as Data;
}

/**
 * A neurofeedback block's targets: each radius (where the reward is a half) draped on
 * the ground as a dotted ring, and a ring marker on each point. One trace per ring and
 * one for the points, so the figure keeps its traces while the targets do not change.
 */
function targetTraces(
  landscape: BrainLandscape,
  targets: SurfaceTargets,
  lift: (x: number, y: number) => number,
  theme: ChartTheme
): Data[] {
  const points = targets.points.filter(
    (p) => p.length === 2 && onMap(landscape, p[0], p[1])
  );
  const rings = points.map((p): Data => {
    const xs: (number | null)[] = [];
    const ys: (number | null)[] = [];
    const zs: (number | null)[] = [];
    for (let k = 0; k <= RING_POINTS; k += 1) {
      const angle = (2 * Math.PI * k) / RING_POINTS;
      const x = p[0] + targets.radius * Math.cos(angle);
      const y = p[1] + targets.radius * Math.sin(angle);
      const inside = onMap(landscape, x, y);
      xs.push(inside ? x : null);
      ys.push(inside ? y : null);
      zs.push(inside ? lift(x, y) : null);
    }
    return {
      type: "scatter3d",
      mode: "lines",
      x: xs,
      y: ys,
      z: zs,
      connectgaps: false,
      hoverinfo: "skip",
      line: { color: theme.ink, width: 3, dash: "dot" },
    } as Data;
  });
  return [
    ...rings,
    {
      type: "scatter3d",
      mode: "markers",
      x: points.map((p) => p[0]),
      y: points.map((p) => p[1]),
      z: points.map((p) => lift(p[0], p[1]) + LIFT),
      hoverinfo: "skip",
      marker: {
        size: 8,
        color: theme.canvas,
        symbol: "circle-open",
        line: { color: theme.ink, width: 3 },
      },
    } as Data,
  ];
}

/** The live position: a stem from the ground, a halo and a bright dot at its top. */
function liveCursor(
  at: { x: number; y: number } | null,
  ground: number,
  accent: string,
  stemTop: (ground: number) => number
): Data[] {
  const top = stemTop(ground);
  // off the map (or none yet): the same three traces, hidden
  const visible = at !== null;
  const cursor = at ?? { x: 0, y: 0 };
  return [
    {
      type: "scatter3d",
      visible,
      mode: "lines",
      x: [cursor.x, cursor.x],
      y: [cursor.y, cursor.y],
      z: [ground, top],
      hoverinfo: "skip",
      line: { color: accent, width: 4 },
    } as Data,
    {
      type: "scatter3d",
      visible,
      mode: "markers",
      x: [cursor.x, cursor.x],
      y: [cursor.y, cursor.y],
      z: [ground, top],
      hoverinfo: "skip",
      marker: { size: [6, 22], color: accent, opacity: 0.35 },
    } as Data,
    {
      type: "scatter3d",
      visible,
      mode: "markers",
      x: [cursor.x],
      y: [cursor.y],
      z: [top],
      hoverinfo: "skip",
      marker: {
        size: 9,
        color: "#ffffff",
        line: { color: accent, width: 2 },
      },
    } as Data,
  ];
}
