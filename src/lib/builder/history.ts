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

import { useCallback, useMemo, useRef, useState } from "react";

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
  const [past, setPast] = useState<T[]>([]);
  const [present, setPresent] = useState<T>(initial);
  const [future, setFuture] = useState<T[]>([]);
  // The present is read inside callbacks that must not change identity on every edit.
  const presentRef = useRef(present);
  presentRef.current = present;

  const set = useCallback((next: T | ((current: T) => T)) => {
    const current = presentRef.current;
    const value =
      typeof next === "function" ? (next as (c: T) => T)(current) : next;
    if (value === current) return;
    setPast((p) => [...p, current].slice(-LIMIT));
    setFuture([]);
    setPresent(value);
  }, []);

  const replace = useCallback((next: T) => setPresent(next), []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const previous = p[p.length - 1];
      setFuture((f) => [presentRef.current, ...f].slice(0, LIMIT));
      setPresent(previous);
      return p.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const [next, ...rest] = f;
      setPast((p) => [...p, presentRef.current].slice(-LIMIT));
      setPresent(next);
      return rest;
    });
  }, []);

  const reset = useCallback((next: T) => {
    setPast([]);
    setFuture([]);
    setPresent(next);
  }, []);

  return useMemo(
    () => ({
      present,
      canUndo: past.length > 0,
      canRedo: future.length > 0,
      set,
      replace,
      undo,
      redo,
      reset,
    }),
    [future.length, past.length, present, redo, replace, reset, set, undo]
  );
}
