import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runCli(...args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx/esm", "scripts/voiceprint.ts", ...args], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
}

describe("Voiceprint CLI", () => {
  it("compiles context through the same domain adapter contract", () => {
    const result = runCli("context", "--profile", "examples/example-profile.json", "--target", "codex", "--register", "email");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("name: maya-patel");
    expect(result.stdout).toContain("Register: Email");
  });

  it("returns a CI failure when an audit threshold is not met", () => {
    const passing = runCli("audit", "--profile", "examples/example-profile.json", "examples/ci-draft.txt", "--threshold", "0", "--json");
    const failing = runCli("check", "--profile", "examples/example-profile.json", "examples/ci-draft.txt", "--threshold", "101", "--json");
    expect(passing.status).toBe(0);
    expect(JSON.parse(passing.stdout).passed).toBe(true);
    expect(failing.status).toBe(1);
    expect(JSON.parse(failing.stdout).passed).toBe(false);
    expect(failing.stdout).not.toContain("The next step is clear");
  });
});
