import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(path.join(__dirname, "..", "package.json"), "utf-8")
);

describe("package.json - arcjet dependencies", () => {
  it("declares @arcjet/node as a dependency, required by src/arcjet.js", () => {
    expect(pkg.dependencies).toHaveProperty("@arcjet/node");
    expect(typeof pkg.dependencies["@arcjet/node"]).toBe("string");
  });

  it("declares @arcjet/inspect as a dependency", () => {
    expect(pkg.dependencies).toHaveProperty("@arcjet/inspect");
    expect(typeof pkg.dependencies["@arcjet/inspect"]).toBe("string");
  });
});