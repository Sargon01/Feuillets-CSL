/**
 * Feuillets CSL — BibTeX / BibLaTeX to CSL-JSON Adapter
 *
 * Converts raw bibliography sources into internal CSL-JSON item representations
 * using @retorquere/bibtex-parser.
 *
 * Invariants:
 * - Every CSL item preserves exact citekey as `id`.
 * - No synthetic citekeys, no silent overwrite on duplicate citekeys.
 * - Unsupported BibTeX types generate UNSUPPORTED_BIBTEX_TYPE diagnostics.
 */

import { parse } from "@retorquere/bibtex-parser";
import type { Creator, Entry } from "@retorquere/bibtex-parser";
import type {
  CitationBibliographySource,
  CitationEngineDiagnostic,
} from "./engine-contract.ts";

export interface CslName {
  family?: string;
  given?: string;
  suffix?: string;
  "non-dropping-particle"?: string;
  "dropping-particle"?: string;
  literal?: string;
}

export interface CslDate {
  "date-parts"?: number[][];
  raw?: string;
}

export interface CslItem {
  id: string;
  type: string;
  title?: string;
  subtitle?: string;
  "container-title"?: string;
  author?: CslName[];
  editor?: CslName[];
  translator?: CslName[];
  issued?: CslDate;
  "original-date"?: CslDate;
  volume?: string | number;
  issue?: string | number;
  page?: string;
  publisher?: string;
  "publisher-place"?: string;
  edition?: string | number;
  DOI?: string;
  URL?: string;
  ISBN?: string;
  ISSN?: string;
  language?: string;
  genre?: string;
}

export interface BibtexAdapterResult {
  items: Map<string, CslItem>;
  diagnostics: CitationEngineDiagnostic[];
}

/** Entry failures can be isolated; source/parser failures remain document errors. */
export const BIBTEX_ENTRY_DIAGNOSTIC_CODES: ReadonlySet<string> = new Set([
  "MISSING_CITEKEY", "UNSUPPORTED_BIBTEX_TYPE", "DUPLICATE_CITEKEY", "AMBIGUOUS_CROSSREF", "CYCLIC_CROSSREF",
]);

const BIBTEX_TYPE_TO_CSL: Readonly<Record<string, string>> = {
  article: "article-journal",
  book: "book",
  inbook: "chapter",
  incollection: "chapter",
  inproceedings: "paper-conference",
  conference: "paper-conference",
  proceedings: "book",
  phdthesis: "thesis",
  mastersthesis: "thesis",
  thesis: "thesis",
  techreport: "report",
  report: "report",
  online: "webpage",
  www: "webpage",
  // A URL alone does not make a miscellaneous work a webpage.
  misc: "document",
  booklet: "pamphlet",
  manual: "report",
  unpublished: "manuscript",
  mvbook: "book",
  collection: "book",
  mvcollection: "book",
  reference: "book",
  mvreference: "book",
  inreference: "entry",
  software: "software",
  dataset: "dataset",
  patent: "patent",
  artwork: "graphic",
  image: "graphic",
  movie: "motion_picture",
  video: "motion_picture",
  audio: "song",
  music: "song",
  performance: "performance",
  letter: "personal_communication",
  jurisdiction: "legal_case",
  legislation: "legislation",
};

const MONTH_NAMES: Readonly<Record<string, number>> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function parseMonth(monthVal: unknown): number | undefined {
  if (typeof monthVal === "number" && monthVal >= 1 && monthVal <= 12) {
    return monthVal;
  }
  if (typeof monthVal === "string") {
    const trimmed = monthVal.trim().toLowerCase();
    const asNum = parseInt(trimmed, 10);
    if (!isNaN(asNum) && asNum >= 1 && asNum <= 12) {
      return asNum;
    }
    return MONTH_NAMES[trimmed];
  }
  return undefined;
}

function parseDateParts(
  dateStr?: unknown,
  yearStr?: unknown,
  monthStr?: unknown
): number[][] | undefined {
  if (typeof dateStr === "string") {
    const trimmed = dateStr.trim();
    const match = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?/.exec(trimmed);
    if (match) {
      const year = parseInt(match[1], 10);
      if (match[3]) {
        const month = parseInt(match[2], 10);
        const day = parseInt(match[3], 10);
        return [[year, month, day]];
      }
      if (match[2]) {
        const month = parseInt(match[2], 10);
        return [[year, month]];
      }
      return [[year]];
    }
  }

  const rawYear =
    typeof yearStr === "string" || typeof yearStr === "number"
      ? String(yearStr).trim()
      : undefined;

  if (rawYear) {
    const matchYear = /^(\d{4})/.exec(rawYear);
    if (matchYear) {
      const year = parseInt(matchYear[1], 10);
      const parsedM = parseMonth(monthStr);
      if (parsedM !== undefined) {
        return [[year, parsedM]];
      }
      return [[year]];
    }
  }

  return undefined;
}

function mapCreators(creators?: Creator[]): CslName[] | undefined {
  if (!creators || !Array.isArray(creators) || creators.length === 0) {
    return undefined;
  }

  const result: CslName[] = [];
  for (const c of creators) {
    if (c.name && c.name.trim().length > 0) {
      result.push({ literal: c.name.trim() });
    } else {
      const nameObj: CslName = {};
      if (c.lastName && c.lastName.trim().length > 0) {
        nameObj.family = c.lastName.trim();
      }
      if (c.firstName && c.firstName.trim().length > 0) {
        nameObj.given = c.firstName.trim();
      }
      if (c.suffix && c.suffix.trim().length > 0) {
        nameObj.suffix = c.suffix.trim();
      }
      if (c.prefix && c.prefix.trim().length > 0) {
        nameObj["non-dropping-particle"] = c.prefix.trim();
      }
      if (Object.keys(nameObj).length > 0) {
        result.push(nameObj);
      }
    }
  }

  return result.length > 0 ? result : undefined;
}

function isArray(val: unknown): val is unknown[] {
  return Array.isArray(val);
}

function getFirstString(val: unknown): string | undefined {
  if (typeof val === "string") {
    const trimmed = val.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (isArray(val) && val.length > 0) {
    const first = val[0];
    if (typeof first === "string" && first.trim().length > 0) {
      return first.trim();
    }
  }
  return undefined;
}

function getJoinedString(val: unknown, delimiter: string = ", "): string | undefined {
  if (typeof val === "string") {
    const trimmed = val.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (isArray(val) && val.length > 0) {
    const validStrings: string[] = [];
    for (const item of val) {
      if (typeof item === "string" && item.trim().length > 0) {
        validStrings.push(item.trim());
      }
    }
    return validStrings.length > 0 ? validStrings.join(delimiter) : undefined;
  }
  return undefined;
}

function convertEntryToCsl(
  entry: Entry,
  diagnostics: CitationEngineDiagnostic[],
  entryByKey?: Map<string, Entry>
): CslItem | null {
  const citekey = entry.key ? entry.key.trim() : "";
  if (!citekey) {
    diagnostics.push({
      code: "MISSING_CITEKEY",
      severity: "error",
      message: "Bibliography entry is missing a citekey.",
    });
    return null;
  }

  const rawType = (entry.type || "").toLowerCase().trim();
  const cslType = Object.prototype.hasOwnProperty.call(BIBTEX_TYPE_TO_CSL, rawType)
    ? BIBTEX_TYPE_TO_CSL[rawType] : undefined;
  if (!cslType) {
    diagnostics.push({
      code: "UNSUPPORTED_BIBTEX_TYPE",
      severity: "error",
      citekey,
      message: `Unsupported BibTeX entry type '${entry.type}' for citekey '${citekey}'.`,
    });
    return null;
  }

  const fields = entry.fields;
  // Parsing each source separately cannot apply inheritance across files.
  // Resolve the existing supported fallback fields from the nearest ancestor.
  // Ambiguity and cycles are rejected before conversion.
  const parentChain: Entry[] = [];
  const visited = new Set<string>();
  let parentKey = getFirstString(fields.crossref)?.toUpperCase();
  while (parentKey && entryByKey && !visited.has(parentKey)) {
    visited.add(parentKey);
    const parent = entryByKey.get(parentKey);
    if (!parent) break;
    parentChain.push(parent);
    parentKey = getFirstString(parent.fields.crossref)?.toUpperCase();
  }
  const parentValue = <T>(read: (fields: Entry["fields"]) => T | undefined): T | undefined => {
    for (const parent of parentChain) {
      const value = read(parent.fields);
      if (value !== undefined) return value;
    }
    return undefined;
  };

  const item: CslItem = {
    id: citekey,
    type: cslType,
  };

  // Titles
  const title = getFirstString(fields.title);
  if (title) {
    item.title = title;
  }

  const subtitle = getFirstString(fields.subtitle);
  if (subtitle) {
    item.subtitle = subtitle;
  }

  const containerTitle =
    getFirstString(fields.journaltitle) ??
    getFirstString(fields.journal) ??
    getFirstString(fields.booktitle) ??
    parentValue((parent) => getFirstString(parent.journaltitle) ??
      getFirstString(parent.journal) ?? getFirstString(parent.booktitle) ?? getFirstString(parent.title));
  if (containerTitle) {
    item["container-title"] = containerTitle;
  }

  // Creators
  const author = mapCreators(fields.author);
  if (author) {
    item.author = author;
  }

  const editor =
    mapCreators(
      fields.editor ?? fields.editors ?? fields.editora ?? fields.editorb
    ) ??
    parentValue((parent) => mapCreators(parent.editor ?? parent.editors ?? parent.editora ?? parent.editorb));
  if (editor) {
    item.editor = editor;
  }

  const translator = mapCreators(fields.translator);
  if (translator) {
    item.translator = translator;
  }

  // Dates
  const issuedParts =
    parseDateParts(fields.date, fields.year, fields.month) ??
    parentValue((parent) => parseDateParts(parent.date, parent.year, parent.month));
  if (issuedParts) {
    item.issued = { "date-parts": issuedParts };
  }

  const origdateParts = parseDateParts(fields.origdate);
  if (origdateParts) {
    item["original-date"] = { "date-parts": origdateParts };
  }

  // Volume, Issue, Pages
  const volume = getFirstString(fields.volume);
  if (volume) {
    item.volume = volume;
  }

  const issue = getFirstString(fields.issue) ?? getFirstString(fields.number);
  if (issue) {
    item.issue = issue;
  }

  const pages = getFirstString(fields.pages);
  if (pages) {
    item.page = pages;
  }

  // Publisher & Location
  const publisher =
    getJoinedString(fields.publisher) ?? getJoinedString(fields.organization) ??
    getJoinedString(fields.institution) ??
    (cslType === "thesis" ? getJoinedString(fields.school) : undefined) ??
    parentValue((parent) => getJoinedString(parent.publisher) ?? getJoinedString(parent.organization) ??
      getJoinedString(parent.institution) ?? (cslType === "thesis" ? getJoinedString(parent.school) : undefined));
  if (publisher) {
    item.publisher = publisher;
  }

  const location =
    getJoinedString(fields.location ?? fields.address) ??
    parentValue((parent) => getJoinedString(parent.location) ?? getJoinedString(parent.address));
  if (location) {
    item["publisher-place"] = location;
  }

  // Edition & Standard Identifiers
  const edition = getFirstString(fields.edition);
  if (edition) {
    item.edition = edition;
  }

  const doi = getFirstString(fields.doi);
  if (doi) {
    item.DOI = doi;
  }

  const url = getFirstString(fields.url);
  if (url) {
    item.URL = url;
  }

  const isbn = getFirstString(fields.isbn);
  if (isbn) {
    item.ISBN = isbn;
  }

  const issn = getFirstString(fields.issn);
  if (issn) {
    item.ISSN = issn;
  }

  const language =
    getFirstString(fields.langid) ?? getFirstString(fields.language);
  if (language) {
    item.language = language;
  }

  // BibTeX/BibLaTeX's field `type` describes the work, not its entry type.
  const genre = getFirstString(fields.type);
  if (genre) item.genre = genre;

  return item;
}

/**
 * Parses and adapts multiple bibliography sources into a CSL item store.
 *
 * Invariant: If duplicate citekeys are detected, all occurrences are flagged
 * with DUPLICATE_CITEKEY (severity: "error") and removed from the returned items
 * store to prevent ambiguous resolution.
 */
export function adaptBibliographies(
  sources: CitationBibliographySource[]
): BibtexAdapterResult {
  const diagnostics: CitationEngineDiagnostic[] = [];
  const items = new Map<string, CslItem>();
  const seenCitekeys = new Set<string>();
  const duplicateCitekeys = new Set<string>();

  const parsedEntries: { entry: Entry; sourceId: string }[] = [];
  const entryByKey = new Map<string, Entry>();
  const ambiguousParentKeys = new Set<string>();

  for (const source of sources) {
    const rawFormat: string = source.format;
    if (rawFormat !== "bibtex") {
      diagnostics.push({
        code: "UNSUPPORTED_BIBLIOGRAPHY_FORMAT",
        severity: "error",
        message: `Unsupported bibliography format '${rawFormat}'. Only 'bibtex' is supported.`,
      });
      continue;
    }

    let parsedLibrary;
    try {
      parsedLibrary = parse(source.content, {
        applyCrossRef: true,
        sentenceCase: false,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      diagnostics.push({
        code: "BIBTEX_PARSE_ERROR",
        severity: "error",
        message: `Failed to parse BibTeX source '${source.id}': ${msg}`,
      });
      continue;
    }

    if (parsedLibrary.errors && parsedLibrary.errors.length > 0) {
      for (const parseErr of parsedLibrary.errors) {
        diagnostics.push({
          code: "BIBTEX_SYNTAX_WARNING",
          severity: "warning",
          message: `BibTeX syntax warning in '${source.id}': ${parseErr.error}`,
        });
      }
    }

    for (const entry of parsedLibrary.entries) {
      const citekey = entry.key ? entry.key.trim() : "";
      if (citekey) {
        // Match the parser's folding, including Unicode expansions (ß -> SS).
        const parentKey = citekey.toUpperCase();
        if (entryByKey.has(parentKey)) ambiguousParentKeys.add(parentKey);
        entryByKey.set(parentKey, entry);
      }
      parsedEntries.push({ entry, sourceId: source.id });
    }
  }

  // The parser applies crossrefs before adaptation, so merely deleting a
  // duplicate parent is insufficient: inherited fields may already be present.
  // Follow the full dependency chain, including parents in other sources.
  const crossrefFailure = (entry: Entry): "AMBIGUOUS_CROSSREF" | "CYCLIC_CROSSREF" | undefined => {
    const visited = new Set<string>();
    let current: Entry | undefined = entry;
    while (current) {
      const parent = getFirstString(current.fields.crossref)?.toUpperCase();
      if (!parent) return undefined;
      if (ambiguousParentKeys.has(parent)) return "AMBIGUOUS_CROSSREF";
      if (visited.has(parent)) return "CYCLIC_CROSSREF";
      visited.add(parent);
      current = entryByKey.get(parent);
    }
    return undefined;
  };

  for (const { entry, sourceId } of parsedEntries) {
    const citekey = entry.key ? entry.key.trim() : "";
    if (!citekey) {
      diagnostics.push({
        code: "MISSING_CITEKEY",
        severity: "error",
        message: `Bibliography entry in '${sourceId}' is missing a citekey.`,
      });
      continue;
    }

    if (seenCitekeys.has(citekey)) {
      duplicateCitekeys.add(citekey);
      diagnostics.push({
        code: "DUPLICATE_CITEKEY",
        severity: "error",
        citekey,
        message: `Duplicate citekey '${citekey}' detected across bibliography sources.`,
      });
      items.delete(citekey);
      continue;
    }

    seenCitekeys.add(citekey);
    const failure = crossrefFailure(entry);
    if (failure) {
      diagnostics.push({
        code: failure,
        severity: "error",
        citekey,
        message: `Citekey '${citekey}' depends on ${failure === "AMBIGUOUS_CROSSREF" ? "an ambiguous" : "a cyclic"} crossref parent.`,
      });
      continue;
    }
    const cslItem = convertEntryToCsl(entry, diagnostics, entryByKey);
    if (cslItem) {
      items.set(cslItem.id, cslItem);
    }
  }

  for (const dupKey of duplicateCitekeys) {
    items.delete(dupKey);
  }

  return {
    items,
    diagnostics,
  };
}
