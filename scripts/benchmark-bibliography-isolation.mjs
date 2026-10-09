import { measureBibliographyScale } from "../test/helpers/bibliography-scale.ts";

const samples = [];
for (const count of [500, 5000]) {
  for (let run = 1; run <= 3; run++) samples.push({ run, ...await measureBibliographyScale(count) });
}
console.log(JSON.stringify({ node: process.version, samples }, null, 2));
