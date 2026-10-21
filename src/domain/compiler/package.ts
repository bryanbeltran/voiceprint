import { ADAPTER_TARGETS, type AdapterTarget, type VoiceprintPackage, type VoiceprintProfile } from "../types";
import { sanitizeForPersistence, stableStringify, validateProfile } from "../profile/schema";
import { compileProfile } from "./adapters";

export function createVoiceprintPackage(profile: VoiceprintProfile, includeEvidence = false): VoiceprintPackage {
  const checked = validateProfile(profile);
  if (!checked.valid) throw new Error(checked.errors.join("; "));
  const artifacts = ADAPTER_TARGETS.reduce<Record<AdapterTarget, string>>((result, target) => {
    result[target] = compileProfile(checked.value, target, { register: "default", includeEvidence });
    return result;
  }, {} as Record<AdapterTarget, string>);
  return {
    packageVersion: "1.0.0",
    profileId: checked.value.profileId,
    profileVersion: checked.value.version,
    generatedAt: checked.value.updatedAt,
    provenance: {
      schemaVersion: checked.value.schemaVersion,
      analysisVersion: checked.value.provenance.analysisVersion,
      sourceCount: checked.value.provenance.sources.length
    },
    install: {
      universal: "Import the .voiceprint.json profile or copy universal.md into your AI tool's instructions.",
      agents: "Copy agent-skill.md to a compatible skills directory, or use the generated target artifact for Codex, Claude, Cursor, ChatGPT, or Gemini."
    },
    artifacts
  };
}

export function exportVoiceprintPackage(profile: VoiceprintProfile, includeEvidence = false): string {
  const checked = validateProfile(profile);
  if (!checked.valid) throw new Error(checked.errors.join("; "));
  return stableStringify({ profile: sanitizeForPersistence(checked.value, { persistApprovedEvidence: includeEvidence }), package: createVoiceprintPackage(checked.value, includeEvidence) }, 2);
}
