export default [
  {
    ignores: ["node_modules/**", "main.js", "dist/**", ".engine-audit/**"],
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    rules: {
      "semi": ["error", "always"],
    },
  },
];
