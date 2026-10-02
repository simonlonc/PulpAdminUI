/**
 * Pins fast-check's seed when FUZZ_SEED is set, and leaves its default random seeding alone
 * otherwise. fast-check does not read a seed from the environment by itself, but CI's fuzz
 * gate job (see .github/workflows/ci.yml) needs one so a failure is reproducible and the job
 * is deterministic; the scheduled unseeded job must keep discovering new inputs, so it leaves
 * FUZZ_SEED unset. Wired in as a setupFile (see vitest.fuzz.config.ts) so every property in
 * the tier picks it up without each `*.fuzz.test.ts` having to pass `{ seed }` itself.
 */

import fc from "fast-check";

const rawSeed = process.env.FUZZ_SEED?.trim();
const seed = Number(rawSeed);
// An unset, blank or non-numeric FUZZ_SEED falls through to fast-check's random seeding
// rather than pinning the seed to NaN or to 0 -- `Number("")` is 0, which would silently
// gate CI on one seed nobody chose. Matches getPulpBaseUrl's `?.trim()` idiom in lib/pulp.ts.
if (rawSeed && Number.isFinite(seed)) {
  fc.configureGlobal({ seed });
}
