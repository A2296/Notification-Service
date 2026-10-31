const js = require("@eslint/js");
const globals = require("globals");
const { defineConfig } = require("eslint/config");

module.exports = defineConfig([
  { ignores: ["node_modules/", "coverage/"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: globals.node,
    },
    rules: {
      // Allows `const { secret, ...safe } = value` to drop a field
      "no-unused-vars": ["error", { ignoreRestSiblings: true }],
    },
  },
  // The dashboard is a plain browser script (no bundler), loaded by index.html
  {
    files: ["Notification-Service-Dashboard/frontend/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: globals.browser,
    },
  },
]);
