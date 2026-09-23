const fs = require("fs");
const path = require("path");
const express = require("express");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yaml");

const router = express.Router();

const spec = YAML.parse(
  fs.readFileSync(path.join(__dirname, "..", "docs", "openapi.yaml"), "utf8")
);

router.get("/openapi.json", (req, res) => res.json(spec));

router.use("/docs", swaggerUi.serve, swaggerUi.setup(spec, {
  customSiteTitle: "Notification Service API",
}));

module.exports = router;
