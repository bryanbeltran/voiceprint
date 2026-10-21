import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(new URL("..", import.meta.url).pathname);

const run = (script, args = []) => new Promise((resolveRun, reject) => {
  const child = spawn("npm", ["run", script, ...args], { cwd: root, stdio: "inherit" });
  child.on("error", reject);
  child.on("exit", (code) => code === 0 ? resolveRun() : reject(new Error(`npm run ${script} exited with ${code}`)));
});

for (const script of ["typecheck", "lint", "test", "build"]) await run(script);
await run("voiceprint:audit", ["--", "--profile", "examples/example-profile.json", "examples/ci-draft.txt", "--threshold", "0"]);

const html = await readFile(resolve(root, "dist/index.html"), "utf8");
for (const marker of ["<html lang=\"en\">", "<div id=\"root\"></div>", "/assets/index-"]) {
  if (!html.includes(marker)) throw new Error(`Built entry is missing required marker: ${marker}`);
}
console.log("Voiceprint verification passed: typecheck, lint, tests, build, and bundle markers.");
