"use client";

/**
 * Undo/redo for the builder, as a list of whole drafts (sprint S19).
 *
 * A protocol draft is a small JSON tree, so keeping the last `LIMIT` versions costs
 * little and removes a whole class of bugs: there are no inverse operations to write and
 * no way for an edit to be undone only half way. `set` replaces the present and pushes
 * the previous one onto the past; `replace` edits the present without a history entry,
 * which is what a server round trip (a reload after a conflict) needs.
 */

import { useCallback, useMemo, useState } from "react";

const LIMIT = 50;

export interface History<T> {
  present: T;
  canUndo: boolean;
  canRedo: boolean;
  /** Record a new version; `undo` returns to the current one. */
  set: (next: T | ((current: T) => T)) => void;
  /** Replace the present without a history entry (a reload, a save round trip). */
  replace: (next: T) => void;
  undo: () => void;
  redo: () => void;
  /** Start again from `next`, forgetting the past (a different protocol). */
  reset: (next: T) => void;
}

export function useHistory<T>(initial: T): History<T> {
  // One state object rather than three: every transition is then a pure update, which
  // is what the React compiler asks for (no ref written during a render) and what makes
  // "undo" exactly the inverse of "set".
  const [state, setState] = useState<{ past: T[]; present: T; future: T[] }>({
    past: [],
    present: initial,
    future: [],
  });

  const set = useCallback((next: T | ((current: T) => T)) => {
    setState((current) => {
      const value =
        typeof next === "function"
          ? (next as (c: T) => T)(current.present)
          : next;
      if (value === current.present) return current;
      return {
        past: [...current.past, current.present].slice(-LIMIT),
        present: value,
        future: [],
      };
    });
  }, []);

  const replace = useCallback(
    (next: T) => setState((current) => ({ ...current, present: next })),
    []
  );

  const undo = useCallback(() => {
    setState((current) => {
      if (current.past.length === 0) return current;
      return {
        past: current.past.slice(0, -1),
        present: current.past[current.past.length - 1],
        future: [current.present, ...current.future].slice(0, LIMIT),
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((current) => {
      if (current.future.length === 0) return current;
      const [next, ...rest] = current.future;
      return {
        past: [...current.past, current.present].slice(-LIMIT),
        present: next,
        future: rest,
      };
    });
  }, []);

  const reset = useCallback(
    (next: T) => setState({ past: [], present: next, future: [] }),
    []
  );

  return useMemo(
    () => ({
      present: state.present,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      set,
      replace,
      undo,
      redo,
      reset,
    }),
    [redo, replace, reset, set, state, undo]
  );
}
