/**
 * The ground every experiment runs on: black, flat and still.
 *
 * Alessio, 2026-09-20: "lo sfondo del test deve essere nero". The app's entry screens
 * carry moving colour ribbons; none of that may ever sit behind a task. Anything in the
 * participant's field of view that moves or glows is a stimulus nobody designed: it
 * pulls the eyes (artefacts on the frontal channels), competes with the target for
 * attention, and differs from screen to screen. Black also keeps luminance, and so the
 * pupil and the visual evoked response, the same from one block to the next.
 *
 * One constant, used by the runner, the kinds that paint their own ground and the
 * builder's previews of them, so the preview cannot promise a look the run does not have.
 */
export const STAGE_GROUND = "#000000";
