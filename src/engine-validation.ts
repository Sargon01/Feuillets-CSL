/**
 * Feuillets CSL — Runtime Engine Request Validation
 *
 * Validates document citation requests coming from Feuillets across the
 * plugin boundary. Since caller and callee are compiled separately, runtime
 * validation ensures all contract invariants and types are strictly satisfied.
 *
 * Rules:
 * - No silent normalization (invalid values are rejected, never coerced)
 * - Complete error reporting with exact paths, error codes, and messages
 */

import type {
  CitationBibliographySource,
  CitationClusterInput,
  CitationDocumentRequest,
  CitationItemMode,
  CitationStyleSource,
} from "./engine-contract.ts";

export interface CitationContractValidationError {
  path: string;
  code: string;
  message: string;
}

export type CitationRequestValidation =
  | {
      valid: true;
      request: CitationDocumentRequest;
    }
  | {
      valid: false;
      errors: CitationContractValidationError[];
    };

const VALID_MODES: ReadonlySet<string> = new Set<CitationItemMode>([
  "normal",
  "suppress-author",
  "author-only",
  "composite",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Validates an unknown input against the CitationDocumentRequest contract.
 *
 * Returns `{ valid: true, request }` if valid, or `{ valid: false, errors }`
 * with every detected schema and invariant violation.
 */
export function validateCitationDocumentRequest(
  value: unknown
): CitationRequestValidation {
  const errors: CitationContractValidationError[] = [];

  if (!isRecord(value)) {
    return {
      valid: false,
      errors: [
        {
          path: "",
          code: "INVALID_TYPE",
          message: "Request must be a non-null object.",
        },
      ],
    };
  }

  if (value.documentId === undefined) {
    errors.push({
      path: "documentId",
      code: "REQUIRED",
      message: "Field 'documentId' is required.",
    });
  } else if (typeof value.documentId !== "string") {
    errors.push({
      path: "documentId",
      code: "INVALID_TYPE",
      message: "Field 'documentId' must be a string.",
    });
  } else if (value.documentId.trim().length === 0) {
    errors.push({
      path: "documentId",
      code: "EMPTY_STRING",
      message: "Field 'documentId' cannot be empty or whitespace only.",
    });
  }

  if (value.revision === undefined) {
    errors.push({
      path: "revision",
      code: "REQUIRED",
      message: "Field 'revision' is required.",
    });
  } else if (typeof value.revision !== "number") {
    errors.push({
      path: "revision",
      code: "INVALID_TYPE",
      message: "Field 'revision' must be a number.",
    });
  } else if (!isNonNegativeInteger(value.revision)) {
    errors.push({
      path: "revision",
      code: "OUT_OF_RANGE",
      message: "Field 'revision' must be a non-negative integer (>= 0).",
    });
  }

  if (value.style === undefined) {
    errors.push({
      path: "style",
      code: "REQUIRED",
      message: "Field 'style' is required.",
    });
  } else if (!isRecord(value.style)) {
    errors.push({
      path: "style",
      code: "INVALID_TYPE",
      message: "Field 'style' must be a non-null object.",
    });
  } else {
    const styleObj = value.style;

    if (styleObj.id === undefined) {
      errors.push({
        path: "style.id",
        code: "REQUIRED",
        message: "Field 'style.id' is required.",
      });
    } else if (typeof styleObj.id !== "string") {
      errors.push({
        path: "style.id",
        code: "INVALID_TYPE",
        message: "Field 'style.id' must be a string.",
      });
    } else if (styleObj.id.trim().length === 0) {
      errors.push({
        path: "style.id",
        code: "EMPTY_STRING",
        message: "Field 'style.id' cannot be empty.",
      });
    }

    if (styleObj.version === undefined) {
      errors.push({
        path: "style.version",
        code: "REQUIRED",
        message: "Field 'style.version' is required.",
      });
    } else if (typeof styleObj.version !== "string") {
      errors.push({
        path: "style.version",
        code: "INVALID_TYPE",
        message: "Field 'style.version' must be a string.",
      });
    } else if (styleObj.version.trim().length === 0) {
      errors.push({
        path: "style.version",
        code: "EMPTY_STRING",
        message: "Field 'style.version' cannot be empty.",
      });
    }

    if (styleObj.xml === undefined) {
      errors.push({
        path: "style.xml",
        code: "REQUIRED",
        message: "Field 'style.xml' is required.",
      });
    } else if (typeof styleObj.xml !== "string") {
      errors.push({
        path: "style.xml",
        code: "INVALID_TYPE",
        message: "Field 'style.xml' must be a string.",
      });
    } else if (styleObj.xml.trim().length === 0) {
      errors.push({
        path: "style.xml",
        code: "EMPTY_STRING",
        message: "Field 'style.xml' cannot be empty.",
      });
    }
  }

  if (value.bibliographies === undefined) {
    errors.push({
      path: "bibliographies",
      code: "REQUIRED",
      message: "Field 'bibliographies' is required.",
    });
  } else if (!isArray(value.bibliographies)) {
    errors.push({
      path: "bibliographies",
      code: "INVALID_TYPE",
      message: "Field 'bibliographies' must be an array.",
    });
  } else if (value.bibliographies.length === 0) {
    errors.push({
      path: "bibliographies",
      code: "EMPTY_ARRAY",
      message: "Field 'bibliographies' must contain at least one bibliography source.",
    });
  } else {
    const seenBibIds = new Set<string>();

    for (let i = 0; i < value.bibliographies.length; i++) {
      const bib = value.bibliographies[i];
      const bibPath = `bibliographies[${i}]`;

      if (!isRecord(bib)) {
        errors.push({
          path: bibPath,
          code: "INVALID_TYPE",
          message: `Bibliography at index ${i} must be a non-null object.`,
        });
        continue;
      }

      if (bib.id === undefined) {
        errors.push({
          path: `${bibPath}.id`,
          code: "REQUIRED",
          message: `Field '${bibPath}.id' is required.`,
        });
      } else if (typeof bib.id !== "string") {
        errors.push({
          path: `${bibPath}.id`,
          code: "INVALID_TYPE",
          message: `Field '${bibPath}.id' must be a string.`,
        });
      } else if (bib.id.trim().length === 0) {
        errors.push({
          path: `${bibPath}.id`,
          code: "EMPTY_STRING",
          message: `Field '${bibPath}.id' cannot be empty.`,
        });
      } else {
        if (seenBibIds.has(bib.id)) {
          errors.push({
            path: `${bibPath}.id`,
            code: "DUPLICATE_ID",
            message: `Duplicate bibliography id '${bib.id}'.`,
          });
        }
        seenBibIds.add(bib.id);
      }

      if (bib.version === undefined) {
        errors.push({
          path: `${bibPath}.version`,
          code: "REQUIRED",
          message: `Field '${bibPath}.version' is required.`,
        });
      } else if (typeof bib.version !== "string") {
        errors.push({
          path: `${bibPath}.version`,
          code: "INVALID_TYPE",
          message: `Field '${bibPath}.version' must be a string.`,
        });
      } else if (bib.version.trim().length === 0) {
        errors.push({
          path: `${bibPath}.version`,
          code: "EMPTY_STRING",
          message: `Field '${bibPath}.version' cannot be empty.`,
        });
      }

      if (bib.format === undefined) {
        errors.push({
          path: `${bibPath}.format`,
          code: "REQUIRED",
          message: `Field '${bibPath}.format' is required.`,
        });
      } else if (bib.format !== "bibtex") {
        errors.push({
          path: `${bibPath}.format`,
          code: "INVALID_VALUE",
          message: `Field '${bibPath}.format' must be strictly 'bibtex'.`,
        });
      }

      if (bib.content === undefined) {
        errors.push({
          path: `${bibPath}.content`,
          code: "REQUIRED",
          message: `Field '${bibPath}.content' is required.`,
        });
      } else if (typeof bib.content !== "string") {
        errors.push({
          path: `${bibPath}.content`,
          code: "INVALID_TYPE",
          message: `Field '${bibPath}.content' must be a string.`,
        });
      } else if (bib.content.trim().length === 0) {
        errors.push({
          path: `${bibPath}.content`,
          code: "EMPTY_STRING",
          message: `Field '${bibPath}.content' cannot be empty.`,
        });
      }
    }
  }

  if (value.locale !== undefined) {
    if (typeof value.locale !== "string") {
      errors.push({
        path: "locale",
        code: "INVALID_TYPE",
        message: "Field 'locale' must be a string if provided.",
      });
    } else if (!isNonEmptyString(value.locale)) {
      errors.push({
        path: "locale",
        code: "EMPTY_STRING",
        message: "Field 'locale' cannot be empty if provided.",
      });
    }
  }

  if (value.clusters === undefined) {
    errors.push({
      path: "clusters",
      code: "REQUIRED",
      message: "Field 'clusters' is required.",
    });
  } else if (!isArray(value.clusters)) {
    errors.push({
      path: "clusters",
      code: "INVALID_TYPE",
      message: "Field 'clusters' must be an array.",
    });
  } else {
    const seenClusterIds = new Set<string>();

    for (let i = 0; i < value.clusters.length; i++) {
      const cluster = value.clusters[i];
      const clusterPath = `clusters[${i}]`;

      if (!isRecord(cluster)) {
        errors.push({
          path: clusterPath,
          code: "INVALID_TYPE",
          message: `Cluster at index ${i} must be a non-null object.`,
        });
        continue;
      }

      if (cluster.id === undefined) {
        errors.push({
          path: `${clusterPath}.id`,
          code: "REQUIRED",
          message: `Field '${clusterPath}.id' is required.`,
        });
      } else if (typeof cluster.id !== "string") {
        errors.push({
          path: `${clusterPath}.id`,
          code: "INVALID_TYPE",
          message: `Field '${clusterPath}.id' must be a string.`,
        });
      } else if (cluster.id.trim().length === 0) {
        errors.push({
          path: `${clusterPath}.id`,
          code: "EMPTY_STRING",
          message: `Field '${clusterPath}.id' cannot be empty.`,
        });
      } else {
        if (seenClusterIds.has(cluster.id)) {
          errors.push({
            path: `${clusterPath}.id`,
            code: "DUPLICATE_ID",
            message: `Duplicate cluster id '${cluster.id}'.`,
          });
        }
        seenClusterIds.add(cluster.id);
      }

      if (cluster.noteIndex !== undefined) {
        if (
          typeof cluster.noteIndex !== "number" ||
          !isNonNegativeInteger(cluster.noteIndex)
        ) {
          errors.push({
            path: `${clusterPath}.noteIndex`,
            code: "OUT_OF_RANGE",
            message: `Field '${clusterPath}.noteIndex' must be a non-negative integer if provided.`,
          });
        }
      }

      if (cluster.items === undefined) {
        errors.push({
          path: `${clusterPath}.items`,
          code: "REQUIRED",
          message: `Field '${clusterPath}.items' is required.`,
        });
      } else if (!isArray(cluster.items)) {
        errors.push({
          path: `${clusterPath}.items`,
          code: "INVALID_TYPE",
          message: `Field '${clusterPath}.items' must be an array.`,
        });
      } else if (cluster.items.length === 0) {
        const clusterIdDisplay =
          typeof cluster.id === "string" && cluster.id.trim().length > 0
            ? cluster.id
            : String(i);
        errors.push({
          path: `${clusterPath}.items`,
          code: "EMPTY_ARRAY",
          message: `Cluster '${clusterIdDisplay}' must contain at least one citation item.`,
        });
      } else {
        for (let j = 0; j < cluster.items.length; j++) {
          const item = cluster.items[j];
          const itemPath = `${clusterPath}.items[${j}]`;

          if (!isRecord(item)) {
            errors.push({
              path: itemPath,
              code: "INVALID_TYPE",
              message: `Citation item at index ${j} must be a non-null object.`,
            });
            continue;
          }

          if (item.id === undefined) {
            errors.push({
              path: `${itemPath}.id`,
              code: "REQUIRED",
              message: `Field '${itemPath}.id' (citekey) is required.`,
            });
          } else if (typeof item.id !== "string") {
            errors.push({
              path: `${itemPath}.id`,
              code: "INVALID_TYPE",
              message: `Field '${itemPath}.id' (citekey) must be a string.`,
            });
          } else if (item.id.trim().length === 0) {
            errors.push({
              path: `${itemPath}.id`,
              code: "EMPTY_STRING",
              message: `Field '${itemPath}.id' (citekey) cannot be empty.`,
            });
          }

          if (item.prefix !== undefined && typeof item.prefix !== "string") {
            errors.push({
              path: `${itemPath}.prefix`,
              code: "INVALID_TYPE",
              message: `Field '${itemPath}.prefix' must be a string if provided.`,
            });
          }

          if (item.suffix !== undefined && typeof item.suffix !== "string") {
            errors.push({
              path: `${itemPath}.suffix`,
              code: "INVALID_TYPE",
              message: `Field '${itemPath}.suffix' must be a string if provided.`,
            });
          }

          if (item.locator !== undefined && typeof item.locator !== "string") {
            errors.push({
              path: `${itemPath}.locator`,
              code: "INVALID_TYPE",
              message: `Field '${itemPath}.locator' must be a string if provided.`,
            });
          }

          if (item.label !== undefined && typeof item.label !== "string") {
            errors.push({
              path: `${itemPath}.label`,
              code: "INVALID_TYPE",
              message: `Field '${itemPath}.label' must be a string if provided.`,
            });
          }

          if (item.mode !== undefined) {
            if (typeof item.mode !== "string" || !VALID_MODES.has(item.mode)) {
              errors.push({
                path: `${itemPath}.mode`,
                code: "INVALID_VALUE",
                message: `Field '${itemPath}.mode' must be one of: normal, suppress-author, author-only, composite.`,
              });
            }
          }
        }
      }
    }
  }

  if (value.includeBibliography === undefined) {
    errors.push({
      path: "includeBibliography",
      code: "REQUIRED",
      message: "Field 'includeBibliography' is required.",
    });
  } else if (typeof value.includeBibliography !== "boolean") {
    errors.push({
      path: "includeBibliography",
      code: "INVALID_TYPE",
      message: "Field 'includeBibliography' must be a boolean.",
    });
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
    };
  }

  const validatedRequest: CitationDocumentRequest = {
    documentId: value.documentId as string,
    revision: value.revision as number,
    style: value.style as CitationStyleSource,
    bibliographies: value.bibliographies as CitationBibliographySource[],
    locale: value.locale !== undefined ? (value.locale as string) : undefined,
    clusters: value.clusters as CitationClusterInput[],
    includeBibliography: value.includeBibliography as boolean,
  };

  return {
    valid: true,
    request: validatedRequest,
  };
}
