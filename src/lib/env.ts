/**
 * Which deployments may show tooling meant for us, not for testers.
 *
 * The simulated headband and the timing overlay exist to develop and to run the
 * end-to-end tests. A beta tester who records against a simulated band produces a
 * session that looks real and is not, so the rule is an allow-list: a deployment gets
 * the tooling only when it says it is one of ours. Beta, production and anything
 * unnamed or misspelt do not - a missing variable on a public deployment must fail
 * closed. `undefined` is `npm run dev` on a laptop, where no variable is set.
 */
const INTERNAL_ENVS = new Set(["local", "dev", "e2e"]);

/** True on a developer's machine, the dev deployment and the e2e run; false elsewhere. */
export function devToolsAllowed(appEnv: string | undefined): boolean {
  if (appEnv === undefined) return process.env.NODE_ENV !== "production";
  return INTERNAL_ENVS.has(appEnv);
}
