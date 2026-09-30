import tsParser from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  ...obsidianmd.configs.recommended,
  {
    files: ["main.ts", "src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "obsidianmd/no-unsupported-api": "error",
    },
  },
  {
    ignores: [
      "main.js",
      "main.js.map",
      "node_modules/**",
      "test/**",
      "docs/**",
    ],
  },
];
