import type {
  CitationRenderNode,
  CitationRenderSpan,
  CitationRenderBlock,
  CitationRenderLink,
  CitationTextStyle,
  CitationRenderDisplay,
  CitationEngineDiagnostic,
} from "./engine-contract.ts";

/**
 * Decodes standard HTML entities into their plain character representations.
 */
export function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&#38;|&amp;/g, "&")
    .replace(/&#60;|&lt;/g, "<")
    .replace(/&#62;|&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#160;|&nbsp;|\xA0/g, " ");
}

/**
 * Recursively extracts plain text from an array of CitationRenderNode objects.
 *
 * Guarantees that the resulting string is pure text with zero markup or tags.
 */
export function renderNodesToPlainText(nodes: CitationRenderNode[]): string {
  let result = "";
  for (const node of nodes) {
    if (node.type === "text") {
      result += node.text;
    } else if (node.type === "span" || node.type === "link") {
      result += renderNodesToPlainText(node.children);
    } else if (node.type === "block") {
      const inner = renderNodesToPlainText(node.children);
      if (node.display === "left-margin") {
        result += inner.endsWith(" ") ? inner : inner + " ";
      } else {
        result += inner;
      }
    }
  }
  return result;
}

interface ParsedTag {
  isClosing: boolean;
  tagName: string;
  rawAttributes: string;
}

function parseTag(tagStr: string): ParsedTag {
  const trimmed = tagStr.trim();
  const isClosing = trimmed.startsWith("/");
  const content = isClosing ? trimmed.slice(1).trim() : trimmed;

  const match = /^([a-zA-Z0-9]+)([\s\S]*)$/.exec(content);
  if (!match) {
    return { isClosing, tagName: "", rawAttributes: "" };
  }

  return {
    isClosing,
    tagName: match[1].toLowerCase(),
    rawAttributes: match[2] || "",
  };
}

function extractAttribute(rawAttributes: string, attrName: string): string | undefined {
  const regex = new RegExp(`(?:^|\\s)${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = regex.exec(rawAttributes);
  if (!match) {
    return undefined;
  }
  return match[1] ?? match[2] ?? match[3];
}

function parseStyleAttribute(styleValue: string): CitationTextStyle {
  const style: CitationTextStyle = {};
  const declarations = styleValue.split(";");

  for (const decl of declarations) {
    const trimmed = decl.trim().toLowerCase();
    if (!trimmed) {
      continue;
    }

    // Special case observed in citeproc: <span style="baseline">
    if (trimmed === "baseline") {
      style.verticalAlign = "baseline";
      continue;
    }

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) {
      continue;
    }

    const prop = trimmed.slice(0, colonIdx).trim();
    const val = trimmed.slice(colonIdx + 1).trim();

    if (prop === "font-style") {
      if (val === "italic" || val === "oblique" || val === "normal") {
        style.fontStyle = val;
      }
    } else if (prop === "font-weight") {
      if (val === "bold" || val === "normal" || val === "light") {
        style.fontWeight = val;
      } else if (val === "lighter") {
        style.fontWeight = "light";
      }
    } else if (prop === "font-variant") {
      if (val === "small-caps" || val === "normal") {
        style.fontVariant = val;
      }
    } else if (prop === "text-decoration") {
      if (val === "underline" || val === "none") {
        style.textDecoration = val;
      }
    } else if (prop === "vertical-align") {
      if (val === "baseline" || val === "superscript" || val === "subscript") {
        style.verticalAlign = val;
      } else if (val === "super") {
        style.verticalAlign = "superscript";
      } else if (val === "sub") {
        style.verticalAlign = "subscript";
      }
    }
  }

  return style;
}

interface StackEntry {
  tag: string;
  node: CitationRenderNode | null; // null for transparent container blocks
  isContainer?: boolean;
}

export interface ConvertMarkupResult {
  nodes: CitationRenderNode[];
  plainText: string;
  diagnostics: CitationEngineDiagnostic[];
}

/**
 * Converts a raw HTML fragment produced by citeproc-ts into a safe CitationRenderNode AST.
 *
 * Enforces an allowlist of tags and attributes corresponding to citeproc's observed outputs.
 * Unknown markup triggers a CSL_MARKUP_UNSUPPORTED diagnostic and safe plain text fallback.
 */
export function convertCiteprocHtmlToNodes(htmlInput: string): ConvertMarkupResult {
  const diagnostics: CitationEngineDiagnostic[] = [];
  const rootNodes: CitationRenderNode[] = [];
  const stack: StackEntry[] = [];

  function getCurrentChildren(): CitationRenderNode[] {
    for (let i = stack.length - 1; i >= 0; i--) {
      const entry = stack[i];
      if (entry.node) {
        if ("children" in entry.node) {
          return entry.node.children;
        }
      }
    }
    return rootNodes;
  }

  function appendText(text: string): void {
    if (!text) {
      return;
    }
    const currentChildren = getCurrentChildren();
    const lastNode = currentChildren[currentChildren.length - 1];
    if (lastNode && lastNode.type === "text") {
      lastNode.text += text;
    } else {
      currentChildren.push({
        type: "text",
        text,
      });
    }
  }

  let pos = 0;
  const len = htmlInput.length;

  while (pos < len) {
    const tagStart = htmlInput.indexOf("<", pos);

    if (tagStart === -1) {
      // Remaining string is purely text
      const rawText = htmlInput.slice(pos);
      appendText(decodeHtmlEntities(rawText));
      break;
    }

    if (tagStart > pos) {
      const rawText = htmlInput.slice(pos, tagStart);
      appendText(decodeHtmlEntities(rawText));
    }

    const tagEnd = htmlInput.indexOf(">", tagStart);
    if (tagEnd === -1) {
      // Malformed HTML tag without closing angle bracket
      const rawText = htmlInput.slice(tagStart);
      appendText(decodeHtmlEntities(rawText));
      break;
    }

    const tagContent = htmlInput.slice(tagStart + 1, tagEnd);
    pos = tagEnd + 1;

    const parsed = parseTag(tagContent);
    if (!parsed.tagName) {
      continue;
    }

    if (parsed.isClosing) {
      // Find matching tag in stack
      let matchIdx = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === parsed.tagName) {
          matchIdx = i;
          break;
        }
      }

      if (matchIdx !== -1) {
        // Pop down to matchIdx
        stack.splice(matchIdx, stack.length - matchIdx);
      }
      continue;
    }

    // Opening tag
    switch (parsed.tagName) {
      case "i": {
        const spanNode: CitationRenderSpan = {
          type: "span",
          style: { fontStyle: "italic" },
          children: [],
        };
        getCurrentChildren().push(spanNode);
        stack.push({ tag: "i", node: spanNode });
        break;
      }
      case "em": {
        const spanNode: CitationRenderSpan = {
          type: "span",
          style: { fontStyle: "oblique" },
          children: [],
        };
        getCurrentChildren().push(spanNode);
        stack.push({ tag: "em", node: spanNode });
        break;
      }
      case "b": {
        const spanNode: CitationRenderSpan = {
          type: "span",
          style: { fontWeight: "bold" },
          children: [],
        };
        getCurrentChildren().push(spanNode);
        stack.push({ tag: "b", node: spanNode });
        break;
      }
      case "sup": {
        const spanNode: CitationRenderSpan = {
          type: "span",
          style: { verticalAlign: "superscript" },
          children: [],
        };
        getCurrentChildren().push(spanNode);
        stack.push({ tag: "sup", node: spanNode });
        break;
      }
      case "sub": {
        const spanNode: CitationRenderSpan = {
          type: "span",
          style: { verticalAlign: "subscript" },
          children: [],
        };
        getCurrentChildren().push(spanNode);
        stack.push({ tag: "sub", node: spanNode });
        break;
      }
      case "span": {
        const styleAttr = extractAttribute(parsed.rawAttributes, "style");
        const textStyle = styleAttr ? parseStyleAttribute(styleAttr) : {};
        const spanNode: CitationRenderSpan = {
          type: "span",
          style: textStyle,
          children: [],
        };
        getCurrentChildren().push(spanNode);
        stack.push({ tag: "span", node: spanNode });
        break;
      }
      case "a": {
        const hrefRaw = extractAttribute(parsed.rawAttributes, "href") ?? "";
        const decodedHref = decodeHtmlEntities(hrefRaw);
        const linkNode: CitationRenderLink = {
          type: "link",
          href: decodedHref,
          children: [],
        };
        getCurrentChildren().push(linkNode);
        stack.push({ tag: "a", node: linkNode });
        break;
      }
      case "div": {
        const classAttr = extractAttribute(parsed.rawAttributes, "class");
        let display: CitationRenderDisplay | undefined;

        if (classAttr === "csl-left-margin") {
          display = "left-margin";
        } else if (classAttr === "csl-right-inline") {
          display = "right-inline";
        } else if (classAttr === "csl-block") {
          display = "block";
        } else if (classAttr === "csl-indent") {
          display = "indent";
        }

        if (display) {
          const blockNode: CitationRenderBlock = {
            type: "block",
            display,
            children: [],
          };
          getCurrentChildren().push(blockNode);
          stack.push({ tag: "div", node: blockNode });
        } else {
          // Transparent container (e.g. csl-entry, csl-bib-body)
          stack.push({ tag: "div", node: null, isContainer: true });
        }
        break;
      }
      default: {
        // Unknown or unexpected tag outside the allowlist
        diagnostics.push({
          code: "CSL_MARKUP_UNSUPPORTED",
          severity: "warning",
          message: `Unsupported markup tag '<${parsed.tagName}>' encountered in citeproc output.`,
        });
        // We do not push a node for unknown markup; its inner text will safely be captured
        stack.push({ tag: parsed.tagName, node: null, isContainer: true });
        break;
      }
    }
  }

  function cleanBlockWhitespace(nodes: CitationRenderNode[]): CitationRenderNode[] {
    const hasBlock = nodes.some((n) => n.type === "block");
    if (!hasBlock) {
      return nodes;
    }
    return nodes.filter((n) => !(n.type === "text" && /^\s*$/.test(n.text)));
  }

  const finalNodes = cleanBlockWhitespace(rootNodes);
  const plainText = renderNodesToPlainText(finalNodes).trim();

  return {
    nodes: finalNodes,
    plainText,
    diagnostics,
  };
}
