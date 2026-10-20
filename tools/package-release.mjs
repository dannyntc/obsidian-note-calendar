import { mkdir, cp, rm } from "node:fs/promises";
import { join } from "node:path";

const outputRoot = "/Users/danny/Desktop/codex's outputs";
const releaseDir = join(outputRoot, "note-calendar");

await mkdir(outputRoot, { recursive: true });
await rm(releaseDir, { recursive: true, force: true });
await mkdir(releaseDir, { recursive: true });

for (const file of ["main.js", "manifest.json", "styles.css", "README.md"]) {
	await cp(file, join(releaseDir, file));
}

console.log(`Packaged Note Calendar in ${releaseDir}`);
