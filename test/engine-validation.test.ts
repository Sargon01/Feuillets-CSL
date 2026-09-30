import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type {
  CitationClusterInput,
  CitationDocumentRequest,
} from "../src/engine-contract.ts";
import { validateCitationDocumentRequest } from "../src/engine-validation.ts";

function createValidRequest(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    documentId: "doc-101",
    revision: 0,
    style: {
      id: "apa",
      version: "7.0.0",
      xml: "<style>mock apa csl</style>",
    },
    bibliographies: [
      {
        id: "bib-1",
        version: "v1",
        format: "bibtex",
        content: "@book{kant1781, title={Critique of Pure Reason}}",
      },
    ],
    clusters: [
      {
        id: "c1",
        items: [
          {
            id: "kant1781",
          },
        ],
      },
    ],
    includeBibliography: true,
    ...overrides,
  };
}

describe("Engine Request Validation (Lot 3)", () => {
  it("validates a minimal valid request successfully", () => {
    const raw = createValidRequest();
    const result = validateCitationDocumentRequest(raw);

    assert.equal(result.valid, true);
    if (result.valid) {
      assert.equal(result.request.documentId, "doc-101");
      assert.equal(result.request.revision, 0);
      assert.equal(result.request.style.id, "apa");
      assert.equal(result.request.bibliographies.length, 1);
      assert.equal(result.request.clusters.length, 1);
      assert.equal(result.request.includeBibliography, true);
    }
  });

  it("validates multiple bibliographies with unique ids", () => {
    const raw = createValidRequest({
      bibliographies: [
        {
          id: "bib-primary",
          version: "1.0",
          format: "bibtex",
          content: "@article{primary2020, title={P}}",
        },
        {
          id: "bib-secondary",
          version: "1.0",
          format: "bibtex",
          content: "@article{secondary2021, title={S}}",
        },
      ],
    });

    const result = validateCitationDocumentRequest(raw);
    assert.equal(result.valid, true);
    if (result.valid) {
      assert.equal(result.request.bibliographies.length, 2);
      assert.equal(result.request.bibliographies[0].id, "bib-primary");
      assert.equal(result.request.bibliographies[1].id, "bib-secondary");
    }
  });

  it("validates ordered citation clusters and preserves their sequence", () => {
    const raw = createValidRequest({
      clusters: [
        { id: "cluster-alpha", items: [{ id: "ref1" }] },
        { id: "cluster-beta", items: [{ id: "ref2" }] },
        { id: "cluster-gamma", items: [{ id: "ref3" }] },
      ],
    });

    const result = validateCitationDocumentRequest(raw);
    assert.equal(result.valid, true);
    if (result.valid) {
      assert.equal(result.request.clusters[0].id, "cluster-alpha");
      assert.equal(result.request.clusters[1].id, "cluster-beta");
      assert.equal(result.request.clusters[2].id, "cluster-gamma");
    }
  });

  it("validates a cluster with multiple citation items", () => {
    const raw = createValidRequest({
      clusters: [
        {
          id: "c-multi",
          items: [
            { id: "author1" },
            { id: "author2" },
            { id: "author3" },
          ],
        },
      ],
    });

    const result = validateCitationDocumentRequest(raw);
    assert.equal(result.valid, true);
    if (result.valid) {
      assert.equal(result.request.clusters[0].items.length, 3);
      assert.equal(result.request.clusters[0].items[1].id, "author2");
    }
  });

  it("validates item with prefix, suffix, locator, and label", () => {
    const raw = createValidRequest({
      clusters: [
        {
          id: "c-details",
          items: [
            {
              id: "smith2024",
              prefix: "see especially ",
              suffix: ", for an introduction",
              locator: "42-45",
              label: "page",
            },
          ],
        },
      ],
    });

    const result = validateCitationDocumentRequest(raw);
    assert.equal(result.valid, true);
    if (result.valid) {
      const item = result.request.clusters[0].items[0];
      assert.equal(item.prefix, "see especially ");
      assert.equal(item.suffix, ", for an introduction");
      assert.equal(item.locator, "42-45");
      assert.equal(item.label, "page");
    }
  });

  it("validates all 4 supported citation item modes", () => {
    const modes = ["normal", "suppress-author", "author-only", "composite"] as const;

    for (const mode of modes) {
      const raw = createValidRequest({
        clusters: [
          {
            id: `c-${mode}`,
            items: [
              {
                id: "smith2024",
                mode,
              },
            ],
          },
        ],
      });

      const result = validateCitationDocumentRequest(raw);
      assert.equal(result.valid, true, `Mode '${mode}' should be valid.`);
      if (result.valid) {
        assert.equal(result.request.clusters[0].items[0].mode, mode);
      }
    }
  });

  it("validates noteIndex when provided as a non-negative integer", () => {
    for (const noteIndex of [0, 1, 42, 1000]) {
      const raw = createValidRequest({
        clusters: [
          {
            id: "c-note",
            items: [{ id: "smith2024" }],
            noteIndex,
          },
        ],
      });

      const result = validateCitationDocumentRequest(raw);
      assert.equal(result.valid, true, `noteIndex ${noteIndex} should be valid.`);
      if (result.valid) {
        assert.equal(result.request.clusters[0].noteIndex, noteIndex);
      }
    }
  });

  it("validates optional locale when provided as non-empty string", () => {
    const raw = createValidRequest({
      locale: "fr-FR",
    });

    const result = validateCitationDocumentRequest(raw);
    assert.equal(result.valid, true);
    if (result.valid) {
      assert.equal(result.request.locale, "fr-FR");
    }
  });

  it("validates includeBibliography true and false", () => {
    for (const includeBibliography of [true, false]) {
      const raw = createValidRequest({ includeBibliography });
      const result = validateCitationDocumentRequest(raw);
      assert.equal(result.valid, true);
      if (result.valid) {
        assert.equal(result.request.includeBibliography, includeBibliography);
      }
    }
  });

  // -------------------------------------------------------------------------
  // Rejection Tests
  // -------------------------------------------------------------------------

  it("rejects non-object root inputs", () => {
    const invalidRoots = [null, undefined, "string", 123, true, []];

    for (const root of invalidRoots) {
      const result = validateCitationDocumentRequest(root);
      assert.equal(result.valid, false);
      if (!result.valid) {
        assert.equal(result.errors.length > 0, true);
        assert.equal(result.errors[0].path, "");
        assert.equal(result.errors[0].code, "INVALID_TYPE");
      }
    }
  });

  it("rejects missing or empty documentId", () => {
    const missing = createValidRequest();
    delete missing.documentId;
    const resMissing = validateCitationDocumentRequest(missing);
    assert.equal(resMissing.valid, false);
    if (!resMissing.valid) {
      assert.equal(resMissing.errors.some((e) => e.path === "documentId" && e.code === "REQUIRED"), true);
    }

    for (const empty of ["", "   ", "\t\n"]) {
      const raw = createValidRequest({ documentId: empty });
      const result = validateCitationDocumentRequest(raw);
      assert.equal(result.valid, false);
      if (!result.valid) {
        assert.equal(result.errors.some((e) => e.path === "documentId" && e.code === "EMPTY_STRING"), true);
      }
    }
  });

  it("rejects invalid revision: negative, non-integer, or wrong type", () => {
    const testCases = [-1, -100, 1.5, 3.14, NaN, Infinity, "0", null];

    for (const revision of testCases) {
      const raw = createValidRequest({ revision });
      const result = validateCitationDocumentRequest(raw);
      assert.equal(result.valid, false, `Revision ${String(revision)} must be rejected.`);
      if (!result.valid) {
        assert.equal(result.errors.some((e) => e.path === "revision"), true);
      }
    }
  });

  it("rejects missing, invalid, or empty style", () => {
    const missingStyle = createValidRequest();
    delete missingStyle.style;
    const resMissing = validateCitationDocumentRequest(missingStyle);
    assert.equal(resMissing.valid, false);

    const nonObjectStyles = ["apa", 123, null, []];
    for (const style of nonObjectStyles) {
      const raw = createValidRequest({ style });
      const result = validateCitationDocumentRequest(raw);
      assert.equal(result.valid, false);
      if (!result.valid) {
        assert.equal(result.errors.some((e) => e.path === "style" && e.code === "INVALID_TYPE"), true);
      }
    }

    const emptyFields = [
      { id: "", version: "1.0", xml: "<style/>", expectedField: "style.id" },
      { id: "apa", version: "   ", xml: "<style/>", expectedField: "style.version" },
      { id: "apa", version: "1.0", xml: "", expectedField: "style.xml" },
      { id: "apa", version: "1.0", xml: "  \n  ", expectedField: "style.xml" },
    ];

    for (const styleTest of emptyFields) {
      const raw = createValidRequest({
        style: {
          id: styleTest.id,
          version: styleTest.version,
          xml: styleTest.xml,
        },
      });
      const result = validateCitationDocumentRequest(raw);
      assert.equal(result.valid, false);
      if (!result.valid) {
        assert.equal(
          result.errors.some((e) => e.path === styleTest.expectedField && e.code === "EMPTY_STRING"),
          true,
          `Expected empty string error on ${styleTest.expectedField}`
        );
      }
    }
  });

  it("rejects empty bibliographies array", () => {
    const raw = createValidRequest({ bibliographies: [] });
    const result = validateCitationDocumentRequest(raw);

    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.equal(
        result.errors.some((e) => e.path === "bibliographies" && e.code === "EMPTY_ARRAY"),
        true
      );
    }
  });

  it("rejects bibliography with empty or whitespace-only content", () => {
    const raw = createValidRequest({
      bibliographies: [
        {
          id: "bib-empty",
          version: "1",
          format: "bibtex",
          content: "   ",
        },
      ],
    });

    const result = validateCitationDocumentRequest(raw);
    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.equal(
        result.errors.some((e) => e.path === "bibliographies[0].content" && e.code === "EMPTY_STRING"),
        true
      );
    }
  });

  it("rejects duplicate bibliography ids", () => {
    const raw = createValidRequest({
      bibliographies: [
        {
          id: "dup-id",
          version: "1",
          format: "bibtex",
          content: "@article{a, title={A}}",
        },
        {
          id: "dup-id",
          version: "2",
          format: "bibtex",
          content: "@article{b, title={B}}",
        },
      ],
    });

    const result = validateCitationDocumentRequest(raw);
    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.equal(
        result.errors.some((e) => e.path === "bibliographies[1].id" && e.code === "DUPLICATE_ID"),
        true
      );
    }
  });

  it("rejects bibliography with format other than strictly 'bibtex'", () => {
    const raw = createValidRequest({
      bibliographies: [
        {
          id: "b1",
          version: "1",
          format: "csl-json",
          content: "{}",
        },
      ],
    });

    const result = validateCitationDocumentRequest(raw);
    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.equal(
        result.errors.some((e) => e.path === "bibliographies[0].format" && e.code === "INVALID_VALUE"),
        true
      );
    }
  });

  it("rejects cluster without items (empty items array)", () => {
    const raw = createValidRequest({
      clusters: [
        {
          id: "c-empty",
          items: [],
        },
      ],
    });

    const result = validateCitationDocumentRequest(raw);
    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.equal(
        result.errors.some((e) => e.path === "clusters[0].items" && e.code === "EMPTY_ARRAY"),
        true
      );
    }
  });

  it("rejects duplicate cluster ids", () => {
    const raw = createValidRequest({
      clusters: [
        { id: "c1", items: [{ id: "item1" }] },
        { id: "c1", items: [{ id: "item2" }] },
      ],
    });

    const result = validateCitationDocumentRequest(raw);
    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.equal(
        result.errors.some((e) => e.path === "clusters[1].id" && e.code === "DUPLICATE_ID"),
        true
      );
    }
  });

  it("rejects empty cluster id", () => {
    const raw = createValidRequest({
      clusters: [
        { id: "  ", items: [{ id: "item1" }] },
      ],
    });

    const result = validateCitationDocumentRequest(raw);
    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.equal(
        result.errors.some((e) => e.path === "clusters[0].id" && e.code === "EMPTY_STRING"),
        true
      );
    }
  });

  it("rejects empty citekey (item id)", () => {
    for (const emptyKey of ["", "   "]) {
      const raw = createValidRequest({
        clusters: [
          { id: "c1", items: [{ id: emptyKey }] },
        ],
      });

      const result = validateCitationDocumentRequest(raw);
      assert.equal(result.valid, false);
      if (!result.valid) {
        assert.equal(
          result.errors.some((e) => e.path === "clusters[0].items[0].id" && e.code === "EMPTY_STRING"),
          true
        );
      }
    }
  });

  it("rejects unknown citation item mode", () => {
    const raw = createValidRequest({
      clusters: [
        {
          id: "c1",
          items: [{ id: "item1", mode: "inline" }],
        },
      ],
    });

    const result = validateCitationDocumentRequest(raw);
    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.equal(
        result.errors.some((e) => e.path === "clusters[0].items[0].mode" && e.code === "INVALID_VALUE"),
        true
      );
    }
  });

  it("rejects invalid noteIndex: negative or non-integer", () => {
    const invalidIndices = [-1, -10, 1.25, NaN, "0", null];

    for (const noteIndex of invalidIndices) {
      const raw = createValidRequest({
        clusters: [
          {
            id: "c1",
            items: [{ id: "item1" }],
            noteIndex,
          },
        ],
      });

      const result = validateCitationDocumentRequest(raw);
      assert.equal(result.valid, false, `noteIndex ${String(noteIndex)} must be rejected.`);
      if (!result.valid) {
        assert.equal(
          result.errors.some((e) => e.path === "clusters[0].noteIndex"),
          true
        );
      }
    }
  });

  it("rejects invalid types across request fields", () => {
    const badTypes = [
      { field: "clusters", val: "not-an-array", expectedCode: "INVALID_TYPE" },
      { field: "includeBibliography", val: "true", expectedCode: "INVALID_TYPE" },
      { field: "includeBibliography", val: 1, expectedCode: "INVALID_TYPE" },
      { field: "locale", val: 123, expectedCode: "INVALID_TYPE" },
      { field: "locale", val: "", expectedCode: "EMPTY_STRING" },
    ];

    for (const tc of badTypes) {
      const raw = createValidRequest({ [tc.field]: tc.val });
      const result = validateCitationDocumentRequest(raw);
      assert.equal(result.valid, false, `Field ${tc.field} with value ${String(tc.val)} should be invalid.`);
      if (!result.valid) {
        assert.equal(
          result.errors.some((e) => e.path === tc.field && e.code === tc.expectedCode),
          true,
          `Expected ${tc.expectedCode} on ${tc.field}`
        );
      }
    }
  });

  it("rejects non-string item properties (prefix, suffix, locator, label)", () => {
    const badItemProperties = [
      { prefix: 123, expectedPath: "clusters[0].items[0].prefix" },
      { suffix: true, expectedPath: "clusters[0].items[0].suffix" },
      { locator: {}, expectedPath: "clusters[0].items[0].locator" },
      { label: [], expectedPath: "clusters[0].items[0].label" },
    ];

    for (const prop of badItemProperties) {
      const raw = createValidRequest({
        clusters: [
          {
            id: "c1",
            items: [
              {
                id: "k1",
                ...prop,
              },
            ],
          },
        ],
      });

      const result = validateCitationDocumentRequest(raw);
      assert.equal(result.valid, false);
      if (!result.valid) {
        assert.equal(
          result.errors.some((e) => e.code === "INVALID_TYPE"),
          true
        );
      }
    }
  });

  it("performs no silent normalization on invalid inputs", () => {
    // 1. Revision as string is not coerced to integer
    const stringRevisionReq = createValidRequest({ revision: "1" });
    const res1 = validateCitationDocumentRequest(stringRevisionReq);
    assert.equal(res1.valid, false);

    // 2. Float revision is not rounded
    const floatRevisionReq = createValidRequest({ revision: 2.7 });
    const res2 = validateCitationDocumentRequest(floatRevisionReq);
    assert.equal(res2.valid, false);

    // 3. Invalid mode is not silently reset to 'normal'
    const invalidModeReq = createValidRequest({
      clusters: [{ id: "c1", items: [{ id: "k1", mode: "custom-mode" }] }],
    });
    const res3 = validateCitationDocumentRequest(invalidModeReq);
    assert.equal(res3.valid, false);

    // 4. includeBibliography as truthy value is not coerced to boolean
    const truthyReq = createValidRequest({ includeBibliography: "yes" });
    const res4 = validateCitationDocumentRequest(truthyReq);
    assert.equal(res4.valid, false);
  });
});
