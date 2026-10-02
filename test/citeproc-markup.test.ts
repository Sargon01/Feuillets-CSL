import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  convertCiteprocHtmlToNodes,
  decodeHtmlEntities,
  renderNodesToPlainText,
} from "../src/citeproc-markup.ts";
import type {
  CitationRenderSpan,
  CitationRenderBlock,
  CitationRenderLink,
} from "../src/engine-contract.ts";

describe("Citeproc Markup Adapter", () => {
  it("decodes HTML entities into Unicode text", () => {
    const raw = "Smith &#38; Jones &#60;text&#62; &quot;quoted&quot; &#39;single&#39; &#160;spaced";
    const decoded = decodeHtmlEntities(raw);
    assert.equal(decoded, "Smith & Jones <text> \"quoted\" 'single'  spaced");
  });

  it("converts simple italic formatting <i>", () => {
    const html = "<i>Critique of Pure Reason</i>";
    const result = convertCiteprocHtmlToNodes(html);

    assert.equal(result.diagnostics.length, 0);
    assert.equal(result.plainText, "Critique of Pure Reason");
    assert.equal(result.nodes.length, 1);

    const span = result.nodes[0] as CitationRenderSpan;
    assert.equal(span.type, "span");
    assert.equal(span.style.fontStyle, "italic");
    assert.equal(span.children.length, 1);
    assert.equal(span.children[0].type, "text");
    assert.equal((span.children[0] as { text: string }).text, "Critique of Pure Reason");
  });

  it("converts oblique formatting <em>", () => {
    const html = "<em>Journal of Philosophy</em>";
    const result = convertCiteprocHtmlToNodes(html);

    assert.equal(result.diagnostics.length, 0);
    assert.equal(result.plainText, "Journal of Philosophy");

    const span = result.nodes[0] as CitationRenderSpan;
    assert.equal(span.type, "span");
    assert.equal(span.style.fontStyle, "oblique");
  });

  it("converts explicit normal style inside italic context (nested roman reset)", () => {
    const html = "<i>The Concept of <span style=\"font-style:normal;\">Mind</span> in Epistemology</i>";
    const result = convertCiteprocHtmlToNodes(html);

    assert.equal(result.diagnostics.length, 0);
    assert.equal(result.plainText, "The Concept of Mind in Epistemology");

    const outerSpan = result.nodes[0] as CitationRenderSpan;
    assert.equal(outerSpan.type, "span");
    assert.equal(outerSpan.style.fontStyle, "italic");
    assert.equal(outerSpan.children.length, 3);

    assert.equal(outerSpan.children[0].type, "text");
    assert.equal((outerSpan.children[0] as { text: string }).text, "The Concept of ");

    const innerSpan = outerSpan.children[1] as CitationRenderSpan;
    assert.equal(innerSpan.type, "span");
    assert.equal(innerSpan.style.fontStyle, "normal");
    assert.equal((innerSpan.children[0] as { text: string }).text, "Mind");

    assert.equal(outerSpan.children[2].type, "text");
    assert.equal((outerSpan.children[2] as { text: string }).text, " in Epistemology");
  });

  it("converts bold <b> and explicit normal weight", () => {
    const html = "<b>Volume <span style=\"font-weight:normal;\">12</span></b>";
    const result = convertCiteprocHtmlToNodes(html);

    assert.equal(result.diagnostics.length, 0);
    assert.equal(result.plainText, "Volume 12");

    const outerSpan = result.nodes[0] as CitationRenderSpan;
    assert.equal(outerSpan.style.fontWeight, "bold");

    const innerSpan = outerSpan.children[1] as CitationRenderSpan;
    assert.equal(innerSpan.style.fontWeight, "normal");
  });

  it("converts small-caps and normal variant", () => {
    const html = "<span style=\"font-variant:small-caps;\">Smith, J.</span> <span style=\"font-variant:normal;\">Jr.</span>";
    const result = convertCiteprocHtmlToNodes(html);

    assert.equal(result.diagnostics.length, 0);
    assert.equal(result.plainText, "Smith, J. Jr.");

    const span1 = result.nodes[0] as CitationRenderSpan;
    assert.equal(span1.style.fontVariant, "small-caps");

    const span2 = result.nodes[2] as CitationRenderSpan;
    assert.equal(span2.style.fontVariant, "normal");
  });

  it("converts underline and none text-decoration", () => {
    const html = "<span style=\"text-decoration:underline;\">Underlined</span> <span style=\"text-decoration:none;\">None</span>";
    const result = convertCiteprocHtmlToNodes(html);

    assert.equal(result.diagnostics.length, 0);
    assert.equal(result.plainText, "Underlined None");

    const span1 = result.nodes[0] as CitationRenderSpan;
    assert.equal(span1.style.textDecoration, "underline");

    const span2 = result.nodes[2] as CitationRenderSpan;
    assert.equal(span2.style.textDecoration, "none");
  });

  it("converts superscript <sup>, subscript <sub>, and baseline alignment", () => {
    const html = "Note<sup>1</sup> H<sub>2</sub>O <span style=\"baseline\">baseline</span>";
    const result = convertCiteprocHtmlToNodes(html);

    assert.equal(result.diagnostics.length, 0);
    assert.equal(result.plainText, "Note1 H2O baseline");

    const sup = result.nodes[1] as CitationRenderSpan;
    assert.equal(sup.style.verticalAlign, "superscript");

    const sub = result.nodes[3] as CitationRenderSpan;
    assert.equal(sub.style.verticalAlign, "subscript");

    const base = result.nodes[5] as CitationRenderSpan;
    assert.equal(base.style.verticalAlign, "baseline");
  });

  it("converts hyperlink anchors <a href=...> to CitationRenderLink nodes", () => {
    const html = "See <a href=\"https://doi.org/10.1000/182\">10.1000/182</a> for details";
    const result = convertCiteprocHtmlToNodes(html);

    assert.equal(result.diagnostics.length, 0);
    assert.equal(result.plainText, "See 10.1000/182 for details");

    const link = result.nodes[1] as CitationRenderLink;
    assert.equal(link.type, "link");
    assert.equal(link.href, "https://doi.org/10.1000/182");
    assert.equal(link.children.length, 1);
    assert.equal((link.children[0] as { text: string }).text, "10.1000/182");
  });

  it("converts bibliography layout blocks: left-margin and right-inline", () => {
    const html = "<div class=\"csl-entry\"><div class=\"csl-left-margin\">[1]</div><div class=\"csl-right-inline\">Smith, J. <i>Title</i>.</div></div>";
    const result = convertCiteprocHtmlToNodes(html);

    assert.equal(result.diagnostics.length, 0);
    assert.equal(result.plainText, "[1] Smith, J. Title.");

    assert.equal(result.nodes.length, 2);
    const leftMargin = result.nodes[0] as CitationRenderBlock;
    assert.equal(leftMargin.type, "block");
    assert.equal(leftMargin.display, "left-margin");
    assert.equal((leftMargin.children[0] as { text: string }).text, "[1]");

    const rightInline = result.nodes[1] as CitationRenderBlock;
    assert.equal(rightInline.type, "block");
    assert.equal(rightInline.display, "right-inline");
    assert.equal(rightInline.children[0].type, "text");
    assert.equal(rightInline.children[1].type, "span");
  });

  it("converts csl-block and csl-indent display classes", () => {
    const html = "<div class=\"csl-block\">Block text</div><div class=\"csl-indent\">Indented text</div>";
    const result = convertCiteprocHtmlToNodes(html);

    assert.equal(result.diagnostics.length, 0);

    const block = result.nodes[0] as CitationRenderBlock;
    assert.equal(block.type, "block");
    assert.equal(block.display, "block");

    const indent = result.nodes[1] as CitationRenderBlock;
    assert.equal(indent.type, "block");
    assert.equal(indent.display, "indent");
  });

  it("handles unknown tags gracefully with CSL_MARKUP_UNSUPPORTED warning diagnostic", () => {
    const html = "Before <marquee>Unsupported Animation</marquee> After";
    const result = convertCiteprocHtmlToNodes(html);

    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0].code, "CSL_MARKUP_UNSUPPORTED");
    assert.equal(result.diagnostics[0].severity, "warning");
    assert.equal(result.plainText, "Before Unsupported Animation After");
  });

  it("safely neutralizes malicious script and markup tags in metadata", () => {
    // In citeproc output, metadata with tags is escaped via text_escape
    const escapedCiteprocOutput =
      "<i>Book Title</i> &#60;script&#62;alert(1)&#60;/script&#62; &#60;img src=x onerror=alert(1)&#62; &#38;amp;";
    const result = convertCiteprocHtmlToNodes(escapedCiteprocOutput);

    assert.equal(result.diagnostics.length, 0);

    assert.equal(result.nodes.length, 2);
    assert.equal(result.nodes[0].type, "span");
    assert.equal(result.nodes[1].type, "text");

    const textNode = result.nodes[1] as { text: string };
    assert.ok(textNode.text.includes("<script>alert(1)</script>"));
    assert.ok(textNode.text.includes("<img src=x onerror=alert(1)>"));

    assert.ok(result.plainText.includes("<script>alert(1)</script>"));
  });

  it("preserves javascript: URL as data without executing, leaving protocol sanitization to host renderer", () => {
    const html = "<a href=\"javascript:alert(1)\">Dangerous Link</a>";
    const result = convertCiteprocHtmlToNodes(html);

    assert.equal(result.nodes.length, 1);
    const link = result.nodes[0] as CitationRenderLink;
    assert.equal(link.type, "link");

    assert.equal(link.href, "javascript:alert(1)");
    // Pure data, no DOM insertion, no window.open
    assert.equal(renderNodesToPlainText([link]), "Dangerous Link");
  });
});
