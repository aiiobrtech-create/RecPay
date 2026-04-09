import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

function main() {
  let entryPath;
  try {
    entryPath = require.resolve("drizzle-kit");
  } catch {
    console.log("[patch-drizzle-kit] drizzle-kit not installed; skipping");
    return;
  }

  const pkgDir = dirname(entryPath);
  const binPath = join(pkgDir, "bin.cjs");
  const source = readFileSync(binPath, "utf8");

  const needle = "              const constraintName = checks.constraint_name;\n";
  const guard = "              if (checkValue == null || checkValue === \"\") {\n                continue;\n              }\n";

  if (source.includes(guard)) {
    console.log("[patch-drizzle-kit] patch already applied");
    return;
  }

  if (!source.includes(needle)) {
    console.warn("[patch-drizzle-kit] target snippet not found; skipping");
    return;
  }

  const patched = source.replace(needle, `${needle}${guard}`);
  writeFileSync(binPath, patched);
  console.log("[patch-drizzle-kit] patch applied to drizzle-kit/bin.cjs");
}

main();
