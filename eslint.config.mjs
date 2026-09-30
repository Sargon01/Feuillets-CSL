export default [
  {
    ignores: ["node_modules/**", "main.js", "dist/**"],
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    rules: {
      "semi": ["error", "always"],
    },
  },
];
