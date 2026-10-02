/**
 * Ambient type declaration for citeproc-ts.
 *
 * Keeps the untyped CSL export behind an explicit internal engine interface.
 */
declare module "citeproc-ts" {
  export const CSL: unknown;
}
