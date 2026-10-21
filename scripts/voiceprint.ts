import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  ADAPTER_TARGETS,
  REGISTER_NAMES,
  compileProfile,
  exportVoiceprintPackage,
  importProfile,
  scoreTextAgainstProfile,
  type AdapterTarget,
  type RegisterName,
  type VoiceprintProfile
} from "../src/domain/index.ts";

const HELP = `Voiceprint CLI

Commands:
  context --profile profile.voiceprint.json [--target universal] [--register default] [--json]
  audit --profile profile.voiceprint.json <draft.txt> [--register default] [--threshold 70] [--json]
  check --profile profile.voiceprint.json <draft.txt> [--register default] [--threshold 70] [--json]
  install --profile profile.voiceprint.json --target codex --out SKILL.md [--register default]
  package --profile profile.voiceprint.json --out voiceprint-package.json

Audit and check return exit code 1 when the feature-first alignment score is below --threshold.
All commands are local and deterministic; draft text is not emitted in reports.`;

interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Map<string, string | true>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command = "help", ...rest] = argv;
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (!argument.startsWith("--")) {
      positional.push(argument);
      continue;
    }
    const [key, inlineValue] = argument.slice(2).split("=", 2);
    if (inlineValue !== undefined) flags.set(key, inlineValue);
    else if (rest[index + 1] && !rest[index + 1].startsWith("--")) flags.set(key, rest[++index]);
    else flags.set(key, true);
  }
  return { command, positional, flags };
}

function flag(args: ParsedArgs, name: string, fallback = ""): string {
  const value = args.flags.get(name);
  return typeof value === "string" ? value : fallback;
}

function hasFlag(args: ParsedArgs, name: string): boolean {
  return args.flags.get(name) === true || args.flags.has(name);
}

function registerFlag(args: ParsedArgs): RegisterName {
  const value = flag(args, "register", "default") as RegisterName;
  if (!REGISTER_NAMES.includes(value)) throw new Error(`Unknown register: ${value}`);
  return value;
}

function targetFlag(args: ParsedArgs): AdapterTarget {
  const value = flag(args, "target", "universal") as AdapterTarget;
  if (!ADAPTER_TARGETS.includes(value)) throw new Error(`Unknown target: ${value}`);
  return value;
}

async function loadProfile(path: string): Promise<VoiceprintProfile> {
  if (!path) throw new Error("--profile is required.");
  const result = importProfile(await readFile(resolve(path), "utf8"));
  if (!result.valid) throw new Error(`Profile is invalid: ${result.errors.join("; ")}`);
  return result.value;
}

function output(value: unknown, json: boolean): void {
  if (json) console.log(JSON.stringify(value, null, 2));
  else console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

async function writeOutput(path: string, content: string): Promise<void> {
  if (!path) throw new Error("--out is required.");
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content, "utf8");
  console.log(`Wrote ${absolute}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "help" || hasFlag(args, "help")) {
    console.log(HELP);
    return;
  }
  if (args.command === "version") {
    console.log("voiceprint 0.1.0");
    return;
  }
  const profile = await loadProfile(flag(args, "profile"));
  const register = registerFlag(args);
  const target = targetFlag(args);
  const json = hasFlag(args, "json");
  if (args.command === "context") {
    const content = compileProfile(profile, target, { register, includeEvidence: hasFlag(args, "include-evidence") });
    output(json ? { profileId: profile.profileId, profileVersion: profile.version, target, register, content } : content, json);
    return;
  }
  if (args.command === "install") {
    const content = compileProfile(profile, target, { register, includeEvidence: hasFlag(args, "include-evidence") });
    await writeOutput(flag(args, "out"), content);
    return;
  }
  if (args.command === "package") {
    await writeOutput(flag(args, "out"), exportVoiceprintPackage(profile, hasFlag(args, "include-evidence")));
    return;
  }
  if (args.command === "audit" || args.command === "check") {
    const draftPath = args.positional[0];
    if (!draftPath) throw new Error("A draft file path is required.");
    const draft = await readFile(resolve(draftPath), "utf8");
    const score = scoreTextAgainstProfile(draft, profile, register);
    const threshold = Number(flag(args, "threshold", "70"));
    if (!Number.isFinite(threshold)) throw new Error("--threshold must be a finite number.");
    const passed = score.overall >= threshold;
    const report = { passed, threshold, profileId: profile.profileId, profileVersion: profile.version, register, score };
    output(json ? report : `Voiceprint audit · ${register}\nAlignment: ${score.overall}% (${score.confidence} confidence)\nMeasured features: ${score.measuredFeatureCount}; drift: ${score.driftCount}; threshold: ${threshold}%\n${passed ? "PASS" : "FAIL"}`, json);
    if (!passed) process.exitCode = 1;
    return;
  }
  throw new Error(`Unknown command: ${args.command}\n\n${HELP}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
});
