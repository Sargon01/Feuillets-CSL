/**
 * Ambient type declaration for citeproc-ts.
 *
 * Types CSL export as `unknown` to ensure strict isolation behind
 * an explicit interface without exposing `any`.
 */
declare module "citeproc-ts" {
  export const CSL: unknown;
}
