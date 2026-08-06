/**
 * One-time pipeline smoke test.
 *
 * Fires once — and only once — the first time the watch cycle successfully
 * publishes anything, so you get a fast, unambiguous "yes, posting works"
 * signal without waiting for real desk content (consensus/saga/radar/etc.)
 * to accumulate enough data to trigger naturally. Once it posts
 * successfully, the state store marks it done forever; if it fails it
 * keeps quietly retrying every cycle until credentials/permissions are
 * fixed, same as any other desk post.
 *
 * Disable entirely with SMOKETEST_ENABLED=false in the environment.
 */

export const SMOKETEST_KEY = "smoketest:v1";

export function smokeTestEnabled() {
  return process.env.SMOKETEST_ENABLED !== "false";
}

export function buildSmokeTestPost() {
  return [
    "🟢 LIVE DESK — pipeline check.",
    "",
    "Posting is wired up correctly. This is a one-time check, not a transfer story — original desk content (consensus calls, sagas, rumour radar, contract watch, pulse) starts flowing from here.",
  ].join("\n");
}
