/**
 * Brain Trails — motion tokens per JavaScript / Motion (ex framer-motion).
 *
 * Gli stessi valori di `motion.css`, per ciò che non si può fare in CSS:
 * uscite dal DOM (AnimatePresence), FLIP delle liste (layout), spring che
 * seguono il puntatore.
 *
 * Regola: se un'animazione si può fare in CSS, si fa in CSS. Questo file
 * serve solo dove serve JS davvero.
 */

/** Durate in millisecondi (identiche ai token CSS). */
export const duration = {
  instant: 0.1,
  fast: 0.16,
  base: 0.24,
  slow: 0.4,
  story: 0.9,
} as const;

/** Curve di Bézier, nel formato array che Motion si aspetta. */
export const ease = {
  out: [0.16, 1, 0.3, 1],
  in: [0.7, 0, 0.84, 0],
  inOut: [0.65, 0, 0.35, 1],
  /** Sale in fretta e non arriva mai: progressi senza percentuale reale. */
  asymptotic: [0, 0.7, 0.15, 1],
} as const;

/** Spostamenti in pixel. 1 micro · 2 card · 3 pagina. */
export const lift = { 1: 8, 2: 16, 3: 24 } as const;

/** Ritardo fra un elemento e il successivo in una lista. */
export const stagger = 0.04;

/** Spring per ciò che insegue un input (tooltip sul cursore, scrubber). */
export const spring = {
  /** Reattiva, senza rimbalzo percepibile. */
  snappy: { type: "spring", stiffness: 400, damping: 30 },
  /** Un filo di rimbalzo: atterraggi, successi. */
  bouncy: { type: "spring", stiffness: 500, damping: 22 },
} as const;

export const transition = {
  base: { duration: duration.base, ease: ease.out },
  slow: { duration: duration.slow, ease: ease.inOut },
} as const;

/* -------------------------------------------------------------------------
   Variants riusabili
   ---------------------------------------------------------------------- */

/** Entrata standard di una card / pannello. */
export const fadeUp = {
  hidden: { opacity: 0, y: lift[1] },
  visible: { opacity: 1, y: 0, transition: transition.base },
  exit: { opacity: 0, y: -lift[1], transition: { duration: duration.fast, ease: ease.in } },
};

/**
 * Lista con entrata sfalsata. Lo stagger è ciò che fa sembrare "curata" una
 * lista: tutte le righe insieme sembrano un lampo, sfalsate sembrano intenzione.
 * Applica `listStagger` al contenitore e `fadeUp` a ogni figlio.
 */
export const listStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: stagger, delayChildren: 0.02 } },
};

/**
 * Step di un form multi-step: la direzione racconta se stai andando avanti
 * o tornando indietro. Passa `custom={direction}` (1 = avanti, -1 = indietro).
 */
export const step = {
  enter: (direction: number) => ({ opacity: 0, x: direction * lift[3] }),
  center: { opacity: 1, x: 0, transition: { duration: duration.slow, ease: ease.out } },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction * -lift[3],
    transition: { duration: duration.base, ease: ease.in },
  }),
};

/**
 * Rispetta prefers-reduced-motion lato JS. In un componente client:
 *   const reduced = usePrefersReducedMotion()
 * Motion espone già `useReducedMotion()`: usa quello nei componenti e questa
 * funzione solo fuori da React (es. animazioni imperative su canvas/SVG).
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
