import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  CitationClusterInput,
  CitationDocumentEngine,
  CitationDocumentRequest,
  CitationDocumentResult,
  CitationFontStyle,
  CitationFontVariant,
  CitationFontWeight,
  CitationRenderBlock,
  CitationRenderDisplay,
  CitationRenderLink,
  CitationRenderNode,
  CitationRenderSpan,
  CitationRenderText,
  CitationTextDecoration,
  CitationTextStyle,
  CitationVerticalAlign,
  RenderedBibliography,
  RenderedBibliographyEntry,
  RenderedCitation,
} from "../src/engine-contract.ts";
import { validateCitationDocumentRequest } from "../src/engine-validation.ts";
import { FeuilletsCslProvider } from "../src/citation-provider.ts";
import { CITATION_API_VERSION, PROVIDER_ID, PROVIDER_NAME } from "../src/feuillets-api-types.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Engine Contract (Lot 3)", () => {
  it("enforces safe output with zero raw HTML fields in the AST contract", () => {
    const textNode: CitationRenderText = {
      type: "text",
      text: "Smith et al.",
    };

    const italicSpan: CitationRenderSpan = {
      type: "span",
      style: { fontStyle: "italic" },
      children: [
        {
          type: "text",
          text: "The Art of Computer Programming",
        },
      ],
    };

    const boldSpan: CitationRenderSpan = {
      type: "span",
      style: { fontWeight: "bold", fontVariant: "small-caps" },
      children: [
        {
          type: "text",
          text: "Volume 1",
        },
      ],
    };

    const linkNode: CitationRenderLink = {
      type: "link",
      href: "https://doi.org/10.1000/182",
      children: [
        {
          type: "text",
          text: "doi:10.1000/182",
        },
      ],
    };

    const citationNodes: CitationRenderNode[] = [textNode, italicSpan, boldSpan, linkNode];

    const renderedCitation: RenderedCitation = {
      clusterId: "c1",
      plainText: "Smith et al., The Art of Computer Programming, Volume 1",
      content: citationNodes,
    };

    const renderedBib: RenderedBibliography = {
      entries: [
        {
          itemIds: ["smith2024"],
          plainText: "Smith, J. (2024). The Art of Computer Programming. Volume 1.",
          content: citationNodes,
        },
      ],
      layout: {
        hangingIndent: true,
        entrySpacing: 1,
        lineSpacing: 1.5,
        secondFieldAlign: "flush",
        maxOffset: 4,
      },
    };

    const result: CitationDocumentResult = {
      documentId: "doc-1",
      revision: 0,
      citations: [renderedCitation],
      bibliography: renderedBib,
      diagnostics: [],
    };

    // Recursively assert that forbidden raw HTML keys do not exist in the rendered output
    const forbiddenKeys = new Set(["html", "innerHTML", "outerHTML", "rawHtml", "unsafeHtml"]);

    function verifyNoRawHtmlKeys(obj: unknown, currentPath: string): void {
      if (typeof obj !== "object" || obj === null) {
        return;
      }
      if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
          verifyNoRawHtmlKeys(obj[i], `${currentPath}[${i}]`);
        }
        return;
      }
      const record = obj as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        assert.equal(
          forbiddenKeys.has(key),
          false,
          `Key '${key}' at path '${currentPath}.${key}' is forbidden: no raw HTML fields allowed in contract.`
        );
        verifyNoRawHtmlKeys(record[key], `${currentPath}.${key}`);
      }
    }

    verifyNoRawHtmlKeys(result, "result");
  });

  it("supports granular typography styles: application and explicit resetting", () => {
    // 1. fontStyle: normal, italic, oblique
    const fontStyles: CitationFontStyle[] = ["normal", "italic", "oblique"];
    for (const fontStyle of fontStyles) {
      const span: CitationRenderSpan = {
        type: "span",
        style: { fontStyle },
        children: [{ type: "text", text: `style:${fontStyle}` }],
      };
      assert.equal(span.style.fontStyle, fontStyle);
    }

    // 2. fontWeight: normal, bold, light
    const fontWeights: CitationFontWeight[] = ["normal", "bold", "light"];
    for (const fontWeight of fontWeights) {
      const span: CitationRenderSpan = {
        type: "span",
        style: { fontWeight },
        children: [{ type: "text", text: `weight:${fontWeight}` }],
      };
      assert.equal(span.style.fontWeight, fontWeight);
    }

    // 3. fontVariant: normal, small-caps
    const fontVariants: CitationFontVariant[] = ["normal", "small-caps"];
    for (const fontVariant of fontVariants) {
      const span: CitationRenderSpan = {
        type: "span",
        style: { fontVariant },
        children: [{ type: "text", text: `variant:${fontVariant}` }],
      };
      assert.equal(span.style.fontVariant, fontVariant);
    }

    // 4. textDecoration: none, underline
    const textDecorations: CitationTextDecoration[] = ["none", "underline"];
    for (const textDecoration of textDecorations) {
      const span: CitationRenderSpan = {
        type: "span",
        style: { textDecoration },
        children: [{ type: "text", text: `decoration:${textDecoration}` }],
      };
      assert.equal(span.style.textDecoration, textDecoration);
    }

    // 5. verticalAlign: baseline, superscript, subscript
    const verticalAligns: CitationVerticalAlign[] = ["baseline", "superscript", "subscript"];
    for (const verticalAlign of verticalAligns) {
      const span: CitationRenderSpan = {
        type: "span",
        style: { verticalAlign },
        children: [{ type: "text", text: `valign:${verticalAlign}` }],
      };
      assert.equal(span.style.verticalAlign, verticalAlign);
    }

    // Empty style object is valid
    const emptyStyleSpan: CitationRenderSpan = {
      type: "span",
      style: {},
      children: [{ type: "text", text: "plain span" }],
    };
    assert.deepEqual(emptyStyleSpan.style, {});
  });

  it("represents explicit roman reset within an italic span context (nested spans)", () => {
    // Structure:
    // span italic
    //   -> text: "An Introduction to "
    //   -> span fontStyle normal (reset to roman)
    //        -> text: "Principia Mathematica"
    //   -> text: " in Historical Context"
    const nestedSpan: CitationRenderSpan = {
      type: "span",
      style: { fontStyle: "italic" },
      children: [
        {
          type: "text",
          text: "An Introduction to ",
        },
        {
          type: "span",
          style: { fontStyle: "normal" },
          children: [
            {
              type: "text",
              text: "Principia Mathematica",
            },
          ],
        },
        {
          type: "text",
          text: " in Historical Context",
        },
      ],
    };

    assert.equal(nestedSpan.type, "span");
    assert.equal(nestedSpan.style.fontStyle, "italic");
    assert.equal(nestedSpan.children.length, 3);

    const childText1 = nestedSpan.children[0] as CitationRenderText;
    assert.equal(childText1.type, "text");
    assert.equal(childText1.text, "An Introduction to ");

    const childSpan = nestedSpan.children[1] as CitationRenderSpan;
    assert.equal(childSpan.type, "span");
    assert.equal(childSpan.style.fontStyle, "normal");

    const innerText = childSpan.children[0] as CitationRenderText;
    assert.equal(innerText.type, "text");
    assert.equal(innerText.text, "Principia Mathematica");

    const childText2 = nestedSpan.children[2] as CitationRenderText;
    assert.equal(childText2.type, "text");
    assert.equal(childText2.text, " in Historical Context");
  });

  it("supports all 4 CSL bibliography block display modes", () => {
    const displays: CitationRenderDisplay[] = ["block", "left-margin", "right-inline", "indent"];

    for (const display of displays) {
      const block: CitationRenderBlock = {
        type: "block",
        display,
        children: [
          {
            type: "text",
            text: `Content for ${display}`,
          },
        ],
      };

      assert.equal(block.type, "block");
      assert.equal(block.display, display);
      assert.equal(block.children.length, 1);
    }
  });

  it("supports structured link nodes with href and children", () => {
    const link: CitationRenderLink = {
      type: "link",
      href: "https://doi.org/10.1145/3371078",
      children: [
        {
          type: "text",
          text: "https://doi.org/10.1145/3371078",
        },
      ],
    };

    assert.equal(link.type, "link");
    assert.equal(link.href, "https://doi.org/10.1145/3371078");
    assert.equal(link.children.length, 1);
    assert.equal((link.children[0] as CitationRenderText).text, "https://doi.org/10.1145/3371078");
  });

  it("represents numeric bibliography entry with left-margin callout and right-inline content", () => {
    // Numeric layout:
    // block left-margin -> "[1]"
    // block right-inline -> bibliographic content
    const numericEntry: RenderedBibliographyEntry = {
      itemIds: ["shannon1948"],
      plainText: "[1] C. E. Shannon, 'A Mathematical Theory of Communication', 1948.",
      content: [
        {
          type: "block",
          display: "left-margin",
          children: [
            {
              type: "text",
              text: "[1]",
            },
          ],
        },
        {
          type: "block",
          display: "right-inline",
          children: [
            {
              type: "text",
              text: "C. E. Shannon, ",
            },
            {
              type: "span",
              style: { fontStyle: "italic" },
              children: [
                {
                  type: "text",
                  text: "A Mathematical Theory of Communication",
                },
              ],
            },
            {
              type: "text",
              text: ", 1948.",
            },
            {
              type: "link",
              href: "https://doi.org/10.1002/j.1538-7305.1948.tb01338.x",
              children: [
                {
                  type: "text",
                  text: " doi:10.1002/j.1538-7305.1948.tb01338.x",
                },
              ],
            },
          ],
        },
      ],
    };

    assert.equal(numericEntry.content.length, 2);

    const leftMargin = numericEntry.content[0] as CitationRenderBlock;
    assert.equal(leftMargin.type, "block");
    assert.equal(leftMargin.display, "left-margin");
    assert.equal((leftMargin.children[0] as CitationRenderText).text, "[1]");

    const rightInline = numericEntry.content[1] as CitationRenderBlock;
    assert.equal(rightInline.type, "block");
    assert.equal(rightInline.display, "right-inline");
    assert.equal(rightInline.children.length, 4);
  });

  it("supports nullable bibliography when includeBibliography is false", () => {
    const result: CitationDocumentResult = {
      documentId: "doc-1",
      revision: 1,
      citations: [],
      bibliography: null,
      diagnostics: [],
    };

    assert.equal(result.bibliography, null);
    assert.equal(result.revision, 1);
  });

  it("preserves strict documentary order across citation clusters (representative scenario)", () => {
    // Representative scenario specified in Lot 3:
    // c1: smith2024
    // c2: doe2023 with locator="42", label="page"
    // c3: smith2024 (repeated citation)
    const clusters: CitationClusterInput[] = [
      {
        id: "c1",
        items: [{ id: "smith2024" }],
      },
      {
        id: "c2",
        items: [{ id: "doe2023", locator: "42", label: "page" }],
      },
      {
        id: "c3",
        items: [{ id: "smith2024" }],
      },
    ];

    const request: CitationDocumentRequest = {
      documentId: "doc-representative",
      revision: 0,
      style: {
        id: "ieee",
        version: "1.0.0",
        xml: "<style>...</style>",
      },
      bibliographies: [
        {
          id: "main-bib",
          version: "rev-1",
          format: "bibtex",
          content: "@article{smith2024, title={A}} @book{doe2023, title={B}}",
        },
      ],
      clusters,
      includeBibliography: true,
    };

    // 1. Invariant: Cluster order c1 -> c2 -> c3 is strictly preserved
    assert.equal(request.clusters.length, 3);
    assert.equal(request.clusters[0].id, "c1");
    assert.equal(request.clusters[1].id, "c2");
    assert.equal(request.clusters[2].id, "c3");

    // 2. Invariant: Item properties are intact
    assert.equal(request.clusters[0].items[0].id, "smith2024");
    assert.equal(request.clusters[1].items[0].id, "doe2023");
    assert.equal(request.clusters[1].items[0].locator, "42");
    assert.equal(request.clusters[1].items[0].label, "page");
    assert.equal(request.clusters[2].items[0].id, "smith2024");

    // 3. Invariant: Validate successfully through engine validation
    const validation = validateCitationDocumentRequest(request);
    assert.equal(validation.valid, true);
    if (validation.valid) {
      assert.equal(validation.request.clusters[0].id, "c1");
      assert.equal(validation.request.clusters[1].id, "c2");
      assert.equal(validation.request.clusters[2].id, "c3");
    }
  });

  it("keeps CitationDocumentEngine internal to Feuillets-CSL without modifying FeuilletsCslProvider", () => {
    // Mock internal engine implementing CitationDocumentEngine
    class MockEngine implements CitationDocumentEngine {
      private disposed = false;
      private documents = new Set<string>();

      async renderDocument(req: CitationDocumentRequest): Promise<CitationDocumentResult> {
        this.documents.add(req.documentId);
        return {
          documentId: req.documentId,
          revision: req.revision,
          citations: [],
          bibliography: null,
          diagnostics: [],
        };
      }

      disposeDocument(documentId: string): void {
        this.documents.delete(documentId);
      }

      dispose(): void {
        this.disposed = true;
        this.documents.clear();
      }

      isDisposed(): boolean {
        return this.disposed;
      }
    }

    const engine = new MockEngine();
    assert.equal(typeof engine.renderDocument, "function");
    assert.equal(typeof engine.disposeDocument, "function");
    assert.equal(typeof engine.dispose, "function");

    // Verify FeuilletsCslProvider is UNMODIFIED (minimal Lot 2 provider)
    const provider = new FeuilletsCslProvider("0.1.0");
    const providerRecord = provider as unknown as Record<string, unknown>;

    assert.equal(provider.id, PROVIDER_ID);
    assert.equal(provider.name, PROVIDER_NAME);
    assert.equal(provider.version, "0.1.0");
    assert.equal(CITATION_API_VERSION, 1);

    // Provider must NOT contain engine methods
    assert.equal(providerRecord["renderDocument"], undefined);
    assert.equal(providerRecord["disposeDocument"], undefined);
    assert.equal(providerRecord["dispose"], undefined);
    assert.equal(providerRecord["createSession"], undefined);
    assert.equal(providerRecord["parseBibtex"], undefined);
  });

  it("verifies engine files do not import Obsidian or contain network/process modules", () => {
    const forbiddenPatterns = [
      /from\s+["']obsidian["']/,
      /require\(["']obsidian["']\)/,
      /\bfetch\b/,
      /\bXMLHttpRequest\b/,
      /\bWebSocket\b/,
      /\bEventSource\b/,
      /\bWebTransport\b/,
      /["']node:http["']/,
      /["']http["']/,
      /["']node:https["']/,
      /["']https["']/,
      /["']node:net["']/,
      /["']net["']/,
      /["']node:tls["']/,
      /["']tls["']/,
      /["']node:dns["']/,
      /["']dns["']/,
      /["']node:child_process["']/,
      /["']child_process["']/,
    ];

    const engineFiles = [
      path.resolve(__dirname, "../src/engine-contract.ts"),
      path.resolve(__dirname, "../src/engine-validation.ts"),
    ];

    for (const file of engineFiles) {
      const content = fs.readFileSync(file, "utf-8");
      for (const pattern of forbiddenPatterns) {
        assert.equal(
          pattern.test(content),
          false,
          `File ${path.basename(file)} must not contain pattern ${pattern.toString()}`
        );
      }
    }
  });
});
