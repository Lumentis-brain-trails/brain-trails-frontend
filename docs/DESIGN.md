# Design system

Brain Trails follows Apple's interface principles translated to the web: the
interface disappears, the trail is the only thing that carries colour, and every
motion starts from the current on-screen value and respects reduced motion.

## One room, from the door to the trail

The entry screen's two ribbons of light are trails: the warm one (amber -> cyan,
top left) is where a trail starts, the cool one (violet -> pink, bottom right) is
where it ends. That reading carries the whole product:

- `/` is the brand surface: a dark ground in both appearances, the ribbons
  (`CornerRibbons`, canvas), the name in **Manrope**, one viewport, no scroll.
- The auth flow (`(public)` layout: login, register, pending, verify, privacy) is
  the same room: same ground, the ribbons glide a little further into their
  corners (`retreat`) so the form has the middle, forms on a glass `AuthPanel`. The
  subtree pins `data-theme="dark"`.
- Inside the app the chrome is monochrome and **the trail is drawn in the ribbons'
  four stops** (`--trail-a` .. `--trail-d`, `CHART_THEMES` in `lib/theme.ts`):
  trail plots, trail thumbnails, the EEG channel colours.
  Energy surfaces and every other chart stay neutral.
- A ribbon appears inside the app in one place only: the corner of Home's "Start a
  new trail" card (`.ribbon-glow`), because a trail is about to start there.
- The mark (`Logo`) is the two ribbons folded into a circle: a disc of light, warm
  on one side and cool on the other, each half fading out at its rim, split by the
  one hard edge in the artwork - an S-shaped trail that runs off both ends. It is
  the only coloured object in the chrome.
- **The mark has no ground of its own.** Both halves fade to transparent and the
  trail is punched out of the same mask, so the trail is whatever is behind it: the
  white canvas in the light appearance, the dark one in the other, the entry
  screen's near-black on the brand surfaces. One artwork, nothing to keep in step
  with the theme. It takes no colour props for that reason.
- The tab and app icons cannot inherit a page, so they carry a tile: `app/icon.svg`
  switches it on `prefers-color-scheme`, which is the same behaviour by other means;
  `app/favicon.ico` and `app/apple-icon.png` are raster fallbacks and stay black.
- Titles (`type-display`, `type-title`, `type-heading`, `type-figure`) use Manrope;
  text you read at length stays on the system face.

## The trail

Wherever a trail is drawn - the recording's own picture, the review, the thumbnail
in a list - it is the same object, built from `lib/trailPath.ts`:

- **One curve, not a chain.** The windows are samples, not corners; the drawn path
  is a centripetal Catmull-Rom spline through them, so the trail reads as one
  movement instead of a broken line with a knot at every window.
- **The colour is in the stroke.** No renderer can run a gradient along a path, so
  the ramp is approximated by stroking short runs of the curve in flat colours
  (`TrailRibbon`), thick, with round caps.
- **The windows stay visible, and quiet.** Fine dots in the ground colour where the
  real windows fall, so what you can hover and click is still on screen without the
  path turning into beads. Thumbnails leave them off: at that size they are noise.
- **The ends are marked.** An open ring in `--trail-a` where it starts, a filled dot
  with a soft halo in `--trail-d` where it ends.
- **The picture is framed on the path**, never on the cover. A drawn position is a
  weighted mean of region centres, so a trail always sits well inside the layout it
  was drawn on; framing both together spent two thirds of the picture on landscape
  the session never reached and left the trail a knot in the middle. Regions that
  fall outside the frame are clipped, which is the right reading: you see the part
  of the landscape you were in.
- **A long session is summarised in time**, not sub-sampled (`lib/trailDraw.ts`,
  `trailSamples`). One window per second is thousands of ordered points crossing the
  same middle again and again - a ball of yarn at any zoom - so each drawn sample is
  the mean of the windows it stands for, about 70 samples in all. Every window still
  pulls on the sample that covers it, so an excursion bends the path instead of
  vanishing with the windows a decimation would have skipped. A recording short
  enough to draw whole is drawn whole, and keeps its per-window dots.
- **The ground is the session's own landscape**, and stays neutral: one soft blob per
  region of the Ball Mapper cover, as wide as the time spent there. Only the regions
  the path actually passed through are drawn (`visitedRegions`), and the whole ground
  carries a single opacity, so overlapping regions union into a basin instead of
  compounding. They used to stack with no ceiling, one blob per region of the entire
  cover, and a busy session turned into grey fog that said nothing. One flat picture,
  no camera: the 3D terrain that used to sit behind a toggle read as topography the
  arbitrary units do not support, and hid half the trail behind a ridge.

Smoothing is how the path is _drawn_, never what is measured: the windows are the
data and every renderer still hit-tests them.

## Appearance

Light and dark are both first-class. `data-theme` on `<html>` is the source of
truth: an inline script (`THEME_BOOT_SCRIPT`) sets it before first paint from the
stored choice (`localStorage["bt-theme"]`), else the system setting, which is then
followed live until the user picks one with the sidebar's appearance switch. Any
subtree can pin itself with its own `data-theme`. Tailwind's `dark:` variant reads
the same attribute, but prefer tokens: they already flip.

## App shell

`AppShell` (`(app)` and `(admin)` layouts) is a 64 px rail of icons on the left
that opens into a 240 px labelled panel on hover or keyboard focus, drawn **over**
the page so nothing underneath moves. The panel ground is a scaled pseudo-element
and the labels fade (transform and opacity only); opening waits 120 ms so a pointer
crossing the rail does not flash it. Below `md` the rail becomes a drawer behind a
slim top bar. The rail holds the sections, the account, the appearance switch and
sign out: pages carry no chrome of their own.

**Focus mode** (`useFocusMode`, `data-focus` on `<html>`): while a session is being
recorded or a protocol runs, the rail and the top bar slide away and the page gets
the whole screen.

## Tokens (`src/app/globals.css`)

| Group    | Tokens                                                              | Rule                                                                                             |
| -------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Surfaces | `canvas`, `surface`, `surface-2`, `surface-3`                       | Off-white / blue-black. No gradients on chrome.                                                  |
| Text     | `ink`, `ink-2`, `ink-3`                                             | Three greys. Body is `ink`, secondary `ink-2`, captions `ink-3`.                                 |
| Lines    | `hairline`, `hairline-strong`                                       | Separators are hairlines, never heavy borders.                                                   |
| Accent   | `accent`, `accent-hover`, `accent-soft`, `on-accent`                | Interaction is ink, not a hue: primary buttons are ink pills, focus rings are ink.               |
| Status   | `ok`, `warn`, `danger` (+ `-soft`)                                  | Status only: badges, banners, destructive actions.                                               |
| Trail    | `--trail-a` .. `--trail-d`, `--trail-start/end`, `--trail-gradient` | Time runs amber -> cyan -> violet -> pink. Deeper stops in light. Same values in `lib/theme.ts`. |
| Motion   | `assets/motion/motion.css` (`--m-*`)                                | Only `transform` and `opacity`; every duration is a token; reduced motion centralised.           |
| Radii    | `--radius-control` 12, `--radius-card` 18, `--radius-sheet` 22      | Buttons and segmented controls are pills.                                                        |

Charts (Plotly, uPlot, three.js) cannot read CSS variables, so `useChartTheme()`
mirrors the palette for them and re-renders when the appearance flips.

## Type ramp

Classes `type-display`, `type-title`, `type-heading`, `type-figure` (Manrope,
self-hosted by next/font, weights 300/600/700) and `type-subhead`, `type-body-lg`,
`type-caption`, `type-eyebrow` (system face). Tracking is size-specific (negative
for display, zero for body, slightly positive for eyebrows); leading is tight on
titles and loose on body.

## Primitives (`src/components/ui.tsx`)

`Button` (primary / secondary / ghost / danger, sm / md / lg; `buttonClass()` gives
a `Link` the same look without nesting a button in it), `Input`, `Select`,
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
- No mascots, no decorative illustration beyond the trail itself, the mark and
  the ribbons: full on the entry and auth screens, one still glow on Home's
  new-trail card, nowhere else.
- Thumbnails of a trail are drawn from its own analysis (`TrailThumb`); a recording
  without one says so instead of showing a stand-in shape.
