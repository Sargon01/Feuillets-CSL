import { it } from "node:test";
import { measureBibliographyScale } from "./helpers/bibliography-scale.ts";

for (const count of [500, 5000]) {
  it(`real Chicago renders 100 valid citations from ${count} entries with anomalies and parses only on resource changes`, async () => {
    await measureBibliographyScale(count);
  });
}
