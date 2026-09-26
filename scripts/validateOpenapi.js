const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");

const fileArg = process.argv[2];
const candidates = [
  fileArg,
  "docs/openapi.yaml",
  "src/docs/openapi.yaml",
  "openapi.yaml",
].filter(Boolean);

const file = candidates.find((candidate) => {
  const resolved = path.resolve(process.cwd(), candidate);
  return fs.existsSync(resolved);
});

if (!file) {
  console.error("OpenAPI file not found. Provide a path or use docs/openapi.yaml.");
  process.exit(1);
}

const filePath = path.resolve(process.cwd(), file);
const source = fs.readFileSync(filePath, "utf8");
const document = YAML.parseDocument(source, {
  prettyErrors: true,
  strict: true,
});

if (document.errors.length > 0) {
  console.error(`Invalid YAML in ${filePath}`);
  for (const error of document.errors) {
    console.error(error.message);
  }
  process.exit(1);
}

const spec = document.toJS();
if (!spec || typeof spec !== "object" || typeof spec.openapi !== "string" || !spec.info || typeof spec.info.title !== "string" || !spec.info.version) {
  console.error(`Invalid OpenAPI document in ${filePath}: missing openapi, info.title, or info.version`);
  process.exit(1);
}

console.log(`${filePath} is valid`);
