# Design system

Brain Trails follows Apple's interface principles translated to the web: the
interface disappears, the trail is the only thing that carries colour, and every
motion starts from the current on-screen value and respects reduced motion.

## Tokens (`src/app/globals.css`)

| Group    | Tokens                                                         | Rule                                                                                   |
| -------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Surfaces | `canvas`, `surface`, `surface-2`, `surface-3`                  | Off-white / near-black. No gradients on chrome.                                        |
| Text     | `ink`, `ink-2`, `ink-3`                                        | Three greys. Body is `ink`, secondary `ink-2`, captions `ink-3`.                       |
| Lines    | `hairline`, `hairline-strong`                                  | Separators are hairlines, never heavy borders.                                         |
| Accent   | `accent`, `accent-hover`, `accent-soft`                        | One blue, only for interaction (links, primary buttons, focus, "now" in the trail).    |
| Status   | `ok`, `warn`, `danger` (+ `-soft`)                             | Status only: badges, banners, destructive actions.                                     |
| Trail    | `--trail-0` -> `--trail-1`, `--trail-start`, `--trail-end`     | Time runs grey -> accent; start is green, end is red. Same values in `lib/theme.ts`.   |
| Motion   | `assets/motion/motion.css` (`--m-*`)                           | Only `transform` and `opacity`; every duration is a token; reduced motion centralised. |
| Radii    | `--radius-control` 12, `--radius-card` 18, `--radius-sheet` 22 | Buttons and segmented controls are pills.                                              |

Both colour schemes are defined on `:root`; dark follows `prefers-color-scheme`.
Charts (Plotly, uPlot) cannot read CSS variables, so `useChartTheme()` mirrors the
palette for them.

## Type ramp

Classes `type-display`, `type-title`, `type-heading`, `type-subhead`,
`type-body-lg`, `type-caption`, `type-eyebrow`. Tracking is size-specific
(negative for display, zero for body, slightly positive for eyebrows); leading is
tight on titles and loose on body. System font stack, no webfont download.

## Primitives (`src/components/ui.tsx`)

`Button` (primary / secondary / ghost / danger, sm / md / lg), `Input`, `Select`,
`Textarea`, `Field`, `Card` (`inset` for lists), `SectionTitle`, `ListRow`,
`KeyValue`, `Stat`, `Segmented`, `ErrorBanner`, `Skeleton`, `Spinner`,
`EmptyState`, `Icon`. Modal work goes through `Sheet` (scrim + materialising
panel, Escape/scrim to dismiss, non-dismissible while a mutation runs).

## Rules of thumb

- Feedback on pointer-down (`.pressable`), never only on release.
- Enter and exit along the same path; sheets scale from centre, toasts drop from
  the top and leave the same way.
- Skeletons shimmer, they do not blink. Progress bars only when the percentage is
  real (uploads); otherwise a spinner and honest copy.
- Confirmation dialogs only for destructive, irreversible actions (delete
  recording, delete account).
- Copy is short and specific: "Recordings", "New recording", "Delete everything".
- No mascots, no decorative illustration beyond the trail itself.
