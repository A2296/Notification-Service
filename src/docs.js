const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yaml");

const router = express.Router();

const openApiPath = path.resolve(__dirname, "..", "docs", "openapi.yaml");
const source = fs.readFileSync(openApiPath, "utf8");
const document = YAML.parseDocument(source, {
  prettyErrors: true,
  strict: true,
});

if (document.errors.length > 0) {
  const details = document.errors.map((error) => error.message).join("\n");
  throw new Error(`Invalid OpenAPI YAML in ${openApiPath}:\n${details}`);
}

const spec = document.toJS();

if (
  !spec ||
  typeof spec !== "object" ||
  typeof spec.openapi !== "string" ||
  !spec.info ||
  typeof spec.info.title !== "string" ||
  !spec.info.version
) {
  throw new Error(
    `Invalid OpenAPI document: ${openApiPath} must contain openapi, info.title, and info.version`
  );
}

router.get("/openapi.json", (req, res) => {
  res.json(spec);
});

router.use("/docs", swaggerUi.serve);
router.get(
  "/docs",
  swaggerUi.setup(spec, {
    customSiteTitle: "Notification Service API",
    swaggerOptions: {
      // Keep the token / API key entered under "Authorize" across page refreshes
      persistAuthorization: true,
    },
  })
);

module.exports = router;
