/**
 * The braided path: the Brain Plasticity module's opening game, played by a whole class
 * (or one person) as a single neuron's signal looking for its way.
 *
 * A pointer walks a braided network from the start to the end; at every node the class
 * votes which edge to take next. Edges are synapses: every vote on an edge counts with
 * its thickness, and every time the pointer crosses an edge it gets thicker (up to
 * `CAP`), while edges left unused thin a little after each round. Round after round the
 * class finds itself on the same route, faster and with fewer votes needed: "neurons that
 * fire together wire together", felt rather than told.
 *
 * Rules (Andrea, 2026-11-25): the pointer moves as soon as one edge's weighted votes
 * reach two thirds of the class; after `VOTE_SECONDS` it goes where the votes are; a tie
 * (no votes is a tie too) is broken at random in proportion to thickness. Dead ends send
 * the pointer back, but the edge into them still thickens a little. A fog hides what is
 * more than `FOG` hops away, so the route is never obvious.
 *
 * Pure and seeded: the same seed draws the same network for the teacher and every
 * phone, and the live room can replay the state from the moves alone.
 */
import { seeded } from "@/lib/learning/signals";

export const CAP = 4;
export const START_WEIGHT = 1;
export const MIN_WEIGHT = 0.5;
/** Thickening per crossing, and the smaller one into a dead end. */
export const GROW = 0.75;
export const GROW_DEAD_END = 0.25;
/** Unused edges keep this share of their extra thickness after a round. */
export const DECAY = 0.85;
export const VOTE_SECONDS = 10;
export const FOG = 2;
/** Share of the class an edge's weighted votes must reach to move at once. */
export const QUORUM = 2 / 3;

export type NodeKind = "start" | "end" | "mid" | "dead";

export interface BraidNode {
  id: number;
  x: number;
  y: number;
  kind: NodeKind;
}

/** An edge, drawn as a curve from `from` to `to` through two control points. */
export interface BraidEdge {
  id: string;
  from: number;
  to: number;
  /** Bezier control points, in the same units as the nodes. */
  c1: [number, number];
  c2: [number, number];
}

export interface Braid {
  nodes: BraidNode[];
  edges: BraidEdge[];
  start: number;
  end: number;
  width: number;
  height: number;
}

export interface BraidState {
  at: number;
  weights: Record<string, number>;
  /** Edges crossed this round. */
  used: string[];
  round: number;
  /** Choices made this round (a dead end and its bounce count as one). */
  steps: number;
  /** Steps of every finished round, to show the class getting faster. */
  finished: number[];
}

/**
 * A network of `columns` columns of `rows` nodes between a start and an end. Each node
 * links to two nodes of the next column, picked at random, so the curves cross and
 * braid; a third of the nodes also have an edge to a dead end beside them. Every route
 * takes `columns + 1` choices without dead ends: about ten with the default sizes.
 */
export function makeBraid(seed = 1, columns = 8, rows = 4): Braid {
  const rand = seeded(seed);
  const width = 100;
  const height = 60;
  const nodes: BraidNode[] = [];
  const edges: BraidEdge[] = [];
  const colX = (c: number) => 6 + ((c + 1) * (width - 12)) / (columns + 1);
  const rowY = (r: number) => 8 + (r * (height - 16)) / (rows - 1);
  const start: BraidNode = { id: 0, x: 3, y: height / 2, kind: "start" };
  nodes.push(start);
  const grid: number[][] = [];
  for (let c = 0; c < columns; c++) {
    grid.push([]);
    for (let r = 0; r < rows; r++) {
      const node: BraidNode = {
        id: nodes.length,
        x: colX(c) + (rand() - 0.5) * 3,
        y: rowY(r) + (rand() - 0.5) * 5,
        kind: "mid",
      };
      nodes.push(node);
      grid[c].push(node.id);
    }
  }
  const end: BraidNode = {
    id: nodes.length,
    x: width - 3,
    y: height / 2,
    kind: "end",
  };
  nodes.push(end);

  const link = (from: number, to: number) => {
    const a = nodes[from];
    const b = nodes[to];
    // control points pulled up or down at random: the strands cross and tangle
    const pull = (y: number) =>
      Math.min(height - 3, Math.max(3, y + (rand() - 0.5) * height * 0.6));
    edges.push({
      id: `${from}-${to}`,
      from,
      to,
      c1: [a.x + (b.x - a.x) * 0.35, pull(a.y)],
      c2: [a.x + (b.x - a.x) * 0.65, pull(b.y)],
    });
  };

  // start -> three of the first column
  const firstPick = shuffle(grid[0], rand).slice(0, 3);
  for (const id of firstPick) link(start.id, id);
  for (let c = 0; c < columns - 1; c++)
    for (const id of grid[c]) {
      for (const to of shuffle(grid[c + 1], rand).slice(0, 2)) link(id, to);
    }
  for (const id of grid[columns - 1]) link(id, end.id);
  // nodes nobody reaches still need a way in: link them from a random previous node
  for (let c = 0; c < columns; c++)
    for (const id of grid[c])
      if (!edges.some((e) => e.to === id))
        link(c ? grid[c - 1][Math.floor(rand() * rows)] : start.id, id);
  // dead ends, a little off the node, for a third of the middle nodes
  for (let c = 0; c < columns - 1; c++)
    for (const id of grid[c]) {
      if (rand() > 0.33) continue;
      const n = nodes[id];
      const dead: BraidNode = {
        id: nodes.length,
        x: n.x + 4 + rand() * 3,
        y: Math.min(height - 2, Math.max(2, n.y + (rand() < 0.5 ? -7 : 7))),
        kind: "dead",
      };
      nodes.push(dead);
      link(id, dead.id);
    }
  return { nodes, edges, start: start.id, end: end.id, width, height };
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A fresh game: the pointer on the start, every edge at its first thickness. */
export function startState(braid: Braid): BraidState {
  return {
    at: braid.start,
    weights: Object.fromEntries(braid.edges.map((e) => [e.id, START_WEIGHT])),
    used: [],
    round: 1,
    steps: 0,
    finished: [],
  };
}

/** The edges the class can vote for from where the pointer is. */
export function choicesAt(braid: Braid, state: BraidState): BraidEdge[] {
  return braid.edges.filter((e) => e.from === state.at);
}

/**
 * Every edge's weighted votes: its number of votes times its thickness. Takes counts,
 * not ballots: the live room shows the teacher how many voted for what, never who.
 */
export function tally(
  braid: Braid,
  state: BraidState,
  counts: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of choicesAt(braid, state))
    out[e.id] = (counts[e.id] ?? 0) * (state.weights[e.id] ?? START_WEIGHT);
  return out;
}

/**
 * Where the pointer goes now, or null while the class is still voting: the leading edge
 * once its weighted votes reach `QUORUM` of `classSize`; once `timedOut`, the leading
 * edge whatever its votes, a tie drawn with probability proportional to thickness.
 */
export function decide(
  braid: Braid,
  state: BraidState,
  counts: Record<string, number>,
  classSize: number,
  {
    timedOut = false,
    rand = Math.random,
  }: { timedOut?: boolean; rand?: () => number } = {}
): string | null {
  const t = tally(braid, state, counts);
  const ids = Object.keys(t);
  if (!ids.length) return null;
  const top = Math.max(...ids.map((id) => t[id]));
  const leaders = ids.filter((id) => t[id] === top);
  if (!timedOut) {
    if (leaders.length === 1 && top >= QUORUM * Math.max(1, classSize))
      return leaders[0];
    return null;
  }
  if (leaders.length === 1) return leaders[0];
  return byThickness(leaders, state.weights, rand);
}

/** One of `ids` at random, each as likely as its thickness. */
export function byThickness(
  ids: string[],
  weights: Record<string, number>,
  rand: () => number = Math.random
): string {
  const total = ids.reduce((s, id) => s + (weights[id] ?? START_WEIGHT), 0);
  let r = rand() * total;
  for (const id of ids) {
    r -= weights[id] ?? START_WEIGHT;
    if (r <= 0) return id;
  }
  return ids[ids.length - 1];
}

/**
 * The pointer crosses `edgeId`: the edge thickens (less into a dead end, which sends the
 * pointer straight back), and the step is counted.
 */
export function move(
  braid: Braid,
  state: BraidState,
  edgeId: string
): BraidState {
  const edge = braid.edges.find((e) => e.id === edgeId && e.from === state.at);
  if (!edge) return state;
  const dead = braid.nodes[edge.to].kind === "dead";
  const w = state.weights[edgeId] ?? START_WEIGHT;
  return {
    ...state,
    at: dead ? state.at : edge.to,
    weights: {
      ...state.weights,
      [edgeId]: Math.min(CAP, w + (dead ? GROW_DEAD_END : GROW)),
    },
    used: state.used.includes(edgeId) ? state.used : [...state.used, edgeId],
    steps: state.steps + 1,
  };
}

/** Whether the pointer has reached the end. */
export function arrived(braid: Braid, state: BraidState): boolean {
  return state.at === braid.end;
}

/**
 * A new round from the start: unused edges lose part of their extra thickness (a synapse
 * nobody uses weakens), used ones keep theirs.
 */
export function endRound(state: BraidState): BraidState {
  const weights: Record<string, number> = {};
  for (const [id, w] of Object.entries(state.weights))
    weights[id] = state.used.includes(id)
      ? w
      : w > START_WEIGHT
        ? START_WEIGHT + (w - START_WEIGHT) * DECAY
        : Math.max(MIN_WEIGHT, w - 0.05);
  return {
    // `makeBraid` always numbers the start 0
    at: 0,
    weights,
    used: [],
    round: state.round + 1,
    steps: 0,
    finished: [...state.finished, state.steps],
  };
}

/** The nodes within `radius` hops of the pointer (either direction): the rest is fog. */
export function visibleNodes(
  braid: Braid,
  state: BraidState,
  radius = FOG
): Set<number> {
  const seen = new Set([state.at]);
  let frontier = [state.at];
  for (let d = 0; d < radius; d++) {
    const next: number[] = [];
    for (const n of frontier)
      for (const e of braid.edges) {
        const other = e.from === n ? e.to : e.to === n ? e.from : null;
        if (other !== null && !seen.has(other)) {
          seen.add(other);
          next.push(other);
        }
      }
    frontier = next;
  }
  seen.add(braid.end);
  return seen;
}
