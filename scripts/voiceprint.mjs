#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const entry = fileURLToPath(new URL("./voiceprint.ts", import.meta.url));
const result = spawnSync(process.execPath, ["--import", "tsx/esm", entry, ...process.argv.slice(2)], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
