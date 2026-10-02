/**
 * Feuillets CSL — Citation Document Engine Contract
 *
 * Defines types, AST nodes, and invariants for the CSL citation engine.
 * This contract is completely pure:
 * - No Obsidian dependencies
 * - No Vault access or file paths
 * - No raw HTML strings in rendered output
 * - Fully isolated document citation contexts
 */

// Bibliography & Style Sources

/**
 * Raw bibliography source provided to the citation engine.
 *
 * `id` is an opaque identifier for the engine (e.g., resource key in Feuillets).
 * The engine must never interpret or manipulate `id` as a filesystem path.
 * `version` is an opaque token used for cache invalidation when the resource changes.
 */
export interface CitationBibliographySource {
  id: string;
  version: string;
  format: "bibtex";
  content: string;
}

/**
 * Raw CSL style source provided to the citation engine.
 *
 * The engine never discovers or retrieves CSL files on its own.
 * `version` is an opaque token used for cache invalidation.
 */
export interface CitationStyleSource {
  id: string;
  version: string;
  xml: string;
}

// Citation Item Input

/**
 * Citation item rendering modes supported by CSL and Pandoc syntax.
 */
export type CitationItemMode =
  | "normal"
  | "suppress-author"
  | "author-only"
  | "composite";

/**
 * A single citation item reference inside a citation cluster.
 *
 * `id` is the exact citekey (e.g., "smith2024").
 * `label` is open-ended (not restricted to a closed enum) to allow
 * arbitrary locator terms supported by CSL styles and Pandoc (e.g., "page", "section").
 */
export interface CitationItemInput {
  id: string;
  prefix?: string;
  suffix?: string;
  locator?: string;
  label?: string;
  mode?: CitationItemMode;
}

// Citation Cluster Input

/**
 * A citation cluster (group of citation items appearing at a single location).
 *
 * Invariants:
 * - `id` is unique within the document request.
 * - `items` is non-empty and order-sensitive.
 * - `noteIndex`, if provided, must be a non-negative integer (>= 0).
 * - Feuillets manages document positions; no Markdown source offsets are included.
 */
export interface CitationClusterInput {
  id: string;
  items: CitationItemInput[];
  noteIndex?: number;
}

// Document Request

/**
 * Complete document citation request sent to the engine.
 *
 * Represents a single, coherent CSL session.
 * Invariants:
 * - `documentId` is non-empty and isolates document states.
 * - `revision` is a non-negative integer guarding against stale asynchronous results.
 * - `style.xml` is non-empty.
 * - `bibliographies` contains at least one source with unique ids.
 * - `clusters` strictly preserves the document citation order.
 */
export interface CitationDocumentRequest {
  documentId: string;
  revision: number;

  style: CitationStyleSource;
  bibliographies: CitationBibliographySource[];

  locale?: string;

  clusters: CitationClusterInput[];

  includeBibliography: boolean;
}

// Safe Output AST (HTML-Free)

/**
 * Explicit font styles supported by CSL typography rules.
 */
export type CitationFontStyle =
  | "normal"
  | "italic"
  | "oblique";

/**
 * Explicit font weights supported by CSL typography rules.
 */
export type CitationFontWeight =
  | "normal"
  | "bold"
  | "light";

/**
 * Explicit font variants supported by CSL typography rules.
 */
export type CitationFontVariant =
  | "normal"
  | "small-caps";

/**
 * Explicit text decorations supported by CSL typography rules.
 */
export type CitationTextDecoration =
  | "none"
  | "underline";

/**
 * Explicit vertical alignments supported by CSL typography rules.
 */
export type CitationVerticalAlign =
  | "baseline"
  | "superscript"
  | "subscript";

/**
 * Granular typography style object for inline text spans.
 *
 * Allows applying styling as well as explicitly resetting styles
 * (e.g. reverting to normal/baseline within an italic/superscript context).
 */
export interface CitationTextStyle {
  fontStyle?: CitationFontStyle;
  fontWeight?: CitationFontWeight;
  fontVariant?: CitationFontVariant;
  textDecoration?: CitationTextDecoration;
  verticalAlign?: CitationVerticalAlign;
}

/**
 * Plain text leaf node within a rendered citation or bibliography entry.
 */
export interface CitationRenderText {
  type: "text";
  text: string;
}

/**
 * Styled inline span node containing typography style attributes and children.
 */
export interface CitationRenderSpan {
  type: "span";
  style: CitationTextStyle;
  children: CitationRenderNode[];
}

/**
 * Display modes for CSL bibliography block layout structures.
 */
export type CitationRenderDisplay =
  | "block"
  | "left-margin"
  | "right-inline"
  | "indent";

/**
 * Structural block node representing CSL bibliography layouts
 * (e.g., numeric callouts in left-margin, indented blocks).
 */
export interface CitationRenderBlock {
  type: "block";
  display: CitationRenderDisplay;
  children: CitationRenderNode[];
}

/**
 * Hyperlink node representing a structured link intention (e.g., DOI, URL).
 *
 * Contains no HTML. The host adapter is responsible for protocol sanitization
 * before DOM rendering.
 */
export interface CitationRenderLink {
  type: "link";
  href: string;
  children: CitationRenderNode[];
}

/**
 * Safe AST node for rendered output.
 *
 * Guarantees zero raw HTML fields (no html, innerHTML, outerHTML, rawHtml, or unsafeHtml).
 */
export type CitationRenderNode =
  | CitationRenderText
  | CitationRenderSpan
  | CitationRenderBlock
  | CitationRenderLink;

// Rendered Citations

/**
 * Rendered representation of a single citation cluster.
 */
export interface RenderedCitation {
  clusterId: string;
  plainText: string;
  content: CitationRenderNode[];
}

// Rendered Bibliography

/**
 * A single rendered bibliography entry.
 */
export interface RenderedBibliographyEntry {
  itemIds: string[];
  plainText: string;
  content: CitationRenderNode[];
}

/**
 * Alignment option for second-field layouts in bibliographies.
 */
export type BibliographySecondFieldAlign =
  | "flush"
  | "margin";

/**
 * Layout configuration for rendered bibliographies.
 */
export interface BibliographyLayout {
  hangingIndent: boolean;
  entrySpacing: number;
  lineSpacing: number;
  secondFieldAlign?: BibliographySecondFieldAlign;
  maxOffset?: number;
}

/**
 * Complete rendered bibliography structure.
 */
export interface RenderedBibliography {
  entries: RenderedBibliographyEntry[];
  layout: BibliographyLayout;
}

// Diagnostics

/**
 * Severity level for engine diagnostics.
 */
export type CitationDiagnosticSeverity =
  | "warning"
  | "error";

/**
 * Diagnostic produced by the citation engine during processing.
 *
 * Technical diagnostics intended for development, debugging, and logging.
 */
export interface CitationEngineDiagnostic {
  code: string;
  severity: CitationDiagnosticSeverity;
  message: string;
  clusterId?: string;
  citekey?: string;
}

// Document Result

/**
 * Complete result returned after rendering a document citation request.
 */
export interface CitationDocumentResult {
  documentId: string;
  revision: number;
  citations: RenderedCitation[];
  bibliography: RenderedBibliography | null;
  diagnostics: CitationEngineDiagnostic[];
}

// Internal document engine interface

/**
 * Internal document engine interface delegated to by the public API v2 provider.
 */
export interface CitationDocumentEngine {
  renderDocument(
    request: CitationDocumentRequest
  ): Promise<CitationDocumentResult>;

  disposeDocument(documentId: string): void;

  dispose(): void;
}
