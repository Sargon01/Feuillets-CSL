import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parse } from "@retorquere/bibtex-parser";

import { adaptBibliographies } from "../src/bibtex-adapter.ts";
import type { CitationBibliographySource } from "../src/engine-contract.ts";

function createBibSource(content: string, id: string = "bib-1"): CitationBibliographySource {
  return {
    id,
    version: "v1",
    format: "bibtex",
    content,
  };
}

describe("BibTeX Adapter", () => {
  it("converts standard BibTeX and BibLaTeX entry types to CSL types", () => {
    const bibContent = `
@article{art1, title={Article Title}, journal={Journal of Science}, year={2020}}
@book{bk1, title={Book Title}, publisher={Publisher}, year={2021}}
@incollection{chap1, title={Chapter Title}, booktitle={Edited Collection}, year={2022}}
@inbook{inbk1, title={Section Title}, booktitle={Big Book}, year={2023}}
@inproceedings{conf1, title={Paper Title}, booktitle={Proc Conf}, year={2024}}
@phdthesis{phd1, title={PhD Thesis}, school={University}, year={2018}}
@mastersthesis{msc1, title={Master Thesis}, school={University}, year={2019}}
@techreport{rep1, title={Tech Report}, institution={Institute}, year={2017}}
@online{web1, title={Online Doc}, url={https://example.org}, year={2025}}
`;

    const result = adaptBibliographies([createBibSource(bibContent)]);
    assert.equal(result.diagnostics.length, 0);

    assert.equal(result.items.get("art1")?.type, "article-journal");
    assert.equal(result.items.get("bk1")?.type, "book");
    assert.equal(result.items.get("chap1")?.type, "chapter");
    assert.equal(result.items.get("inbk1")?.type, "chapter");
    assert.equal(result.items.get("conf1")?.type, "paper-conference");
    assert.equal(result.items.get("phd1")?.type, "thesis");
    assert.equal(result.items.get("msc1")?.type, "thesis");
    assert.equal(result.items.get("rep1")?.type, "report");
    assert.equal(result.items.get("web1")?.type, "webpage");
  });

  it("converts BibTeX aliases conference, report, and www to CSL types", () => {
    const bibContent = `
@conference{conf_alias, title={Conference Paper}, booktitle={Proceedings}, year={2021}}
@report{rep_alias, title={Technical Report}, institution={Institute}, year={2022}}
@www{www_alias, title={Web Resource}, url={https://example.org}, year={2023}}
`;

    const result = adaptBibliographies([createBibSource(bibContent)]);
    assert.equal(result.diagnostics.length, 0);

    assert.equal(result.items.get("conf_alias")?.type, "paper-conference");
    assert.equal(result.items.get("rep_alias")?.type, "report");
    assert.equal(result.items.get("www_alias")?.type, "webpage");
  });

  it("extracts structured author names including particles, suffixes, and corporate literals", () => {
    const bibContent = `
@article{creators1,
  title={Collaboration},
  author={van Beethoven, Ludwig and Smith, Jr., John and {World Health Organization}},
  year={2020}
}
`;

    const result = adaptBibliographies([createBibSource(bibContent)]);
    assert.equal(result.diagnostics.length, 0);

    const item = result.items.get("creators1");
    assert.ok(item);
    assert.equal(item.author?.length, 3);

    // van Beethoven, Ludwig
    assert.equal(item.author?.[0]?.family, "Beethoven");
    assert.equal(item.author?.[0]?.given, "Ludwig");
    assert.equal(item.author?.[0]?.["non-dropping-particle"], "van");

    // Smith, Jr., John
    assert.equal(item.author?.[1]?.family, "Smith");
    assert.equal(item.author?.[1]?.given, "John");
    assert.equal(item.author?.[1]?.suffix, "Jr.");

    // Corporate / institutional literal author
    assert.equal(item.author?.[2]?.literal, "World Health Organization");
  });

  it("extracts editors, translators, and subtitle fields without fabrication", () => {
    const bibContent = `
@book{roles1,
  title={Philosophical Essays},
  subtitle={An Epistemological Inquiry},
  editor={Knuth, Donald E.},
  translator={Turing, Alan M.},
  year={1995}
}
`;

    const result = adaptBibliographies([createBibSource(bibContent)]);
    assert.equal(result.diagnostics.length, 0);

    const item = result.items.get("roles1");
    assert.ok(item);
    assert.equal(item.title, "Philosophical Essays");
    assert.equal(item.subtitle, "An Epistemological Inquiry");
    assert.equal(item.editor?.[0]?.family, "Knuth");
    assert.equal(item.editor?.[0]?.given, "Donald E.");
    assert.equal(item.translator?.[0]?.family, "Turing");
    assert.equal(item.translator?.[0]?.given, "Alan M.");
  });

  it("maps bibliographic metadata: container-title, volume, issue, page, publisher, identifiers", () => {
    const bibContent = `
@article{meta1,
  title={Information Entropy},
  journal={Bell Labs Technical Journal},
  volume={27},
  number={3},
  pages={379--423},
  publisher={{American Telephone and Telegraph Company}},
  address={New York},
  edition={2nd},
  doi={10.1002/j.1538-7305.1948.tb01338.x},
  url={https://archive.org/details/bstj27-3-379},
  isbn={978-0-12-345678-9},
  issn={0005-8580},
  langid={english},
  year={1948}
}
`;

    const result = adaptBibliographies([createBibSource(bibContent)]);
    assert.equal(result.diagnostics.length, 0);

    const item = result.items.get("meta1");
    assert.ok(item);
    assert.equal(item["container-title"], "Bell Labs Technical Journal");
    assert.equal(item.volume, "27");
    assert.equal(item.issue, "3");
    assert.ok(item.page?.includes("379"));
    assert.equal(item.publisher, "American Telephone and Telegraph Company");
    assert.equal(item["publisher-place"], "New York");
    assert.equal(item.edition, "2nd");
    assert.equal(item.DOI, "10.1002/j.1538-7305.1948.tb01338.x");
    assert.equal(item.URL, "https://archive.org/details/bstj27-3-379");
    assert.equal(item.ISBN, "978-0-12-345678-9");
    assert.equal(item.ISSN, "0005-8580");
    assert.equal(item.language, "english");
  });

  it("correctly populates CSL original-date from origdate and issued from date/year", () => {
    const bibContent = `
@book{kant1781,
  title={Critique of Pure Reason},
  author={Kant, Immanuel},
  origdate={1781-05-15},
  date={1998-02},
  publisher={Cambridge University Press}
}
`;

    const result = adaptBibliographies([createBibSource(bibContent)]);
    assert.equal(result.diagnostics.length, 0);

    const item = result.items.get("kant1781");
    assert.ok(item);
    assert.deepEqual(item["original-date"]?.["date-parts"], [[1781, 5, 15]]);
    assert.deepEqual(item.issued?.["date-parts"], [[1998, 2]]);
  });

  it("converts LaTeX accent commands to Unicode equivalents via Retorquere", () => {
    const bibContent = `
@article{accent1,
  title={L\\'etude sur les ph\\'{e}nom\\\x60enes fran\\c{c}ais, les \\oe uvres, l'\\"{u}ber-mensch et les pi\\~nas},
  author={M\\"{u}ller, Ren\\'{e} and Fran\\c{c}ois, Aim\\'{e}},
  year={2023}
}
`;

    const result = adaptBibliographies([createBibSource(bibContent)]);
    assert.equal(result.diagnostics.length, 0);

    const item = result.items.get("accent1");
    assert.ok(item);

    assert.ok(item.title?.includes("é") || item.title?.includes("é"));
    assert.ok(item.title?.includes("è") || item.title?.includes("è"));
    assert.ok(item.title?.includes("ç") || item.title?.includes("ç"));
    assert.ok(item.title?.includes("ü") || item.title?.includes("ü"));
    assert.ok(item.title?.includes("ñ") || item.title?.includes("ñ"));
    assert.ok(item.title?.includes("œ"));
    assert.ok(item.author?.[0]?.family?.includes("ü") || item.author?.[0]?.family?.includes("ü"));
    assert.ok(item.author?.[0]?.given?.includes("é") || item.author?.[0]?.given?.includes("é"));
  });

  it("inherits fields via crossref and expands @string macros", () => {
    const bibContent = `
@string{cup = "Cambridge University Press"}

@book{proceedings_main,
  title={Proceedings of the Formal Logic Colloquium},
  publisher=cup,
  address={Cambridge},
  year={2020}
}

@inproceedings{logic_paper,
  title={Completeness in Modal Logics},
  author={Gödel, Kurt},
  crossref={proceedings_main}
}
`;

    const result = adaptBibliographies([createBibSource(bibContent)]);
    assert.equal(result.diagnostics.length, 0);

    const child = result.items.get("logic_paper");
    assert.ok(child);
    assert.equal(child.publisher, "Cambridge University Press");
    assert.equal(child["publisher-place"], "Cambridge");
    assert.deepEqual(child.issued?.["date-parts"], [[2020]]);
  });

  it("produces an error diagnostic when an entry has no citekey", () => {
    const bibContent = `
@article{,
  title={Ghost Article},
  year={2020}
}
`;

    const result = adaptBibliographies([createBibSource(bibContent)]);
    assert.ok(result.diagnostics.some((d) => d.code === "MISSING_CITEKEY" && d.severity === "error"));
  });

  it("produces an error diagnostic when an entry has an unsupported BibTeX type", () => {
    const bibContent = `
@customtype{unsupported1,
  title={Unknown Custom Type},
  year={2020}
}
`;

    const result = adaptBibliographies([createBibSource(bibContent)]);
    assert.ok(
      result.diagnostics.some(
        (d) => d.code === "UNSUPPORTED_BIBTEX_TYPE" && d.severity === "error" && d.citekey === "unsupported1"
      )
    );

    assert.equal(result.items.has("unsupported1"), false);
  });

  it("detects duplicate citekeys across sources and eliminates them from the items store", () => {
    const source1 = createBibSource(
      `@article{dup_key, title={First Version}, year={2020}}`,
      "bib-primary"
    );
    const source2 = createBibSource(
      `@article{dup_key, title={Second Version}, year={2021}}`,
      "bib-secondary"
    );

    const result = adaptBibliographies([source1, source2]);
    const duplicateDiag = result.diagnostics.find(
      (d) => d.code === "DUPLICATE_CITEKEY" && d.citekey === "dup_key"
    );
    assert.ok(duplicateDiag);
    assert.equal(duplicateDiag.severity, "error");
    // Duplicate item is removed to prevent silent first-wins or last-wins resolution
    assert.equal(result.items.has("dup_key"), false);
  });
});


describe("Historical BibLaTeX dates", () => {
  for (const [field, value, parserValue, expected] of [
    ["date", "1936", "1936", [[1936]]],
    ["origdate", "1936", "1936", [[1936]]],
    ["date", "0001", "0001", [[1]]],
    ["date", "0000", "0000", [[-1]]],
    ["date", "-0001", "-0001", [[-2]]],
    ["date", "-0334", "-0334", [[-335]]],
    ["date", "-0335", "-0335", [[-336]]],
    ["origdate", "-0335", "-0335", [[-336]]],
    ["origdate", "-0334", "-0334", [[-335]]],
    ["origdate", "0000", "0000", [[-1]]],
    ["origdate", "-0001", "-0001", [[-2]]],
    ["date", "-0335-06", "-0335-06", [[-336, 6]]],
    ["origdate", "-0335-06-23", "-0335-06-23", [[-336, 6, 23]]],
    ["date", "0000-06-23", "0000-06-23", [[-1, 6, 23]]],
    ["date", "2024-02-03", "2024-02-03", [[2024, 2, 3]]],
    ["year", "1936", "1936", [[1936]]],
    ["year", "0001", "1", [[1]]],
    ["year", "0000", "0", [[-1]]],
    ["year", "-0001", "-1", [[-2]]],
    ["year", "-0334", "-334", [[-335]]],
    ["year", "-0335", "-335", [[-336]]],
    ["date", "-335", "-335", [[-336]]],
    ["origdate", "-335", "-335", [[-336]]],
    ["year", "-335", "-335", [[-336]]],
    ["date", "-335-06-23", "-335-06-23", [[-336, 6, 23]]],
  ] as const) {
    it(`preserves the parser's ${field}={${value}} and converts its astronomical year`, () => {
      const content = `@book{historical,title={Ancient Work},${field}={${value}}}`;
      const parsed = parse(content, { applyCrossRef: true, sentenceCase: false });
      assert.deepEqual(parsed.errors, []);
      assert.equal(parsed.entries[0].fields[field], parserValue);
      const adapted = adaptBibliographies([createBibSource(content)]);
      assert.deepEqual(adapted.diagnostics, []);
      const item = adapted.items.get("historical");
      assert.ok(item);
      assert.deepEqual(item[field === "origdate" ? "original-date" : "issued"]?.["date-parts"], expected);
    });
  }

  for (const [fields, expected] of [
    ["year={-0335},month=jun", [[-336, 6]]],
    ["date={unknown},year={-0335},month={6}", [[-336, 6]]],
    ["year={1936},month=mar", [[1936, 3]]],
    ["date={-0335-13},year={1936},month=mar", [[1936, 3]]],
  ] as const) {
    it(`preserves year/month fallback for ${fields}`, () => {
      const adapted = adaptBibliographies([createBibSource(`@book{fallback,title={Work},${fields}}`)]);
      assert.deepEqual(adapted.diagnostics, []);
      assert.deepEqual(adapted.items.get("fallback")?.issued?.["date-parts"], expected);
    });
  }

  it("keeps an ancient original date independent of a modern publication date", () => {
    const adapted = adaptBibliographies([createBibSource("@book{edition,title={Modern Edition},origdate={-0334},date={1936}}")]);
    assert.deepEqual(adapted.diagnostics, []);
    assert.deepEqual(adapted.items.get("edition")?.issued, { "date-parts": [[1936]] });
    assert.deepEqual(adapted.items.get("edition")?.["original-date"], { "date-parts": [[-335]] });
  });

  for (const separate of [false, true]) {
    it(`converts crossref-inherited dates once ${separate ? "across files" : "within a file"}`, () => {
      const parent = "@book{parent,title={Ancient Parent},date={-0335-06-23},origdate={-0334-06-23}}";
      const child = "@incollection{child,title={Chapter},crossref={parent}}";
      const sources = separate ? [createBibSource(child, "child"), createBibSource(parent, "parent")]
        : [createBibSource(parent + "\n" + child)];
      const adapted = adaptBibliographies(sources);
      assert.deepEqual(adapted.diagnostics, []);
      for (const key of ["parent", "child"]) {
        assert.deepEqual(adapted.items.get(key)?.issued, { "date-parts": [[-336, 6, 23]] });
        assert.deepEqual(adapted.items.get(key)?.["original-date"], { "date-parts": [[-335, 6, 23]] });
      }
    });
  }

  it("leaves modern dates and independent bibliographic metadata unchanged", () => {
    const adapted = adaptBibliographies([createBibSource(`@book{modern,title={Modern Study},author={Example, Alice},
      date={2024-02-03},origdate={1936-06-23},publisher={Example Press},doi={10.0000/example}}`)]);
    assert.deepEqual(adapted.diagnostics, []);
    assert.deepEqual(adapted.items.get("modern"), { id: "modern", type: "book", title: "Modern Study",
      author: [{ family: "Example", given: "Alice" }], issued: { "date-parts": [[2024, 2, 3]] },
      "original-date": { "date-parts": [[1936, 6, 23]] }, publisher: "Example Press", DOI: "10.0000/example" });
  });

  for (const value of ["-0335/-0334", "-0335?", "-0335-21", "-0335-13", "-0335-06-32"]) {
    it(`does not extend signed date support to ${value}`, () => {
      const item = adaptBibliographies([createBibSource(`@book{unsupported,title={Work},date={${value}},origdate={${value}}}`)]).items.get("unsupported");
      assert.ok(item);
      assert.equal(item.issued, undefined);
      assert.equal(item["original-date"], undefined);
    });
  }
});
