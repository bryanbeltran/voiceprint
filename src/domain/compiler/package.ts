import { ADAPTER_TARGETS, REGISTER_NAMES, type AdapterTarget, type RegisterName, type VoiceprintPackage, type VoiceprintProfile } from "../types";
import { sanitizeForPersistence, stableStringify, validateProfile } from "../profile/schema";
import { compileProfile } from "./adapters";

export function createVoiceprintPackage(profile: VoiceprintProfile, includeEvidence = false): VoiceprintPackage {
  const checked = validateProfile(profile);
  if (!checked.valid) throw new Error(checked.errors.join("; "));
  const artifacts = ADAPTER_TARGETS.reduce<Record<AdapterTarget, string>>((result, target) => {
    result[target] = compileProfile(checked.value, target, { register: "default", includeEvidence });
    return result;
  }, {} as Record<AdapterTarget, string>);
  const registerArtifacts = REGISTER_NAMES.reduce<Record<RegisterName, Record<AdapterTarget, string>>>((result, register) => {
    result[register] = ADAPTER_TARGETS.reduce<Record<AdapterTarget, string>>((targetResult, target) => {
      targetResult[target] = compileProfile(checked.value, target, { register, includeEvidence });
      return targetResult;
    }, {} as Record<AdapterTarget, string>);
    return result;
  }, {} as Record<RegisterName, Record<AdapterTarget, string>>);
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
    artifacts,
    registerArtifacts
  };
}

export function exportVoiceprintPackage(profile: VoiceprintProfile, includeEvidence = false): string {
  const checked = validateProfile(profile);
  if (!checked.valid) throw new Error(checked.errors.join("; "));
  return stableStringify({ profile: sanitizeForPersistence(checked.value, { persistApprovedEvidence: includeEvidence }), package: createVoiceprintPackage(checked.value, includeEvidence) }, 2);
}
