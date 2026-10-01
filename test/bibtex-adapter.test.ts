import { describe, it } from "node:test";
import assert from "node:assert/strict";

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

describe("BibTeX Adapter (Lot 4)", () => {
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
    // Checks that LaTeX commands are converted to Unicode characters
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
    // Does not create a false or synthetic CSL entry
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
