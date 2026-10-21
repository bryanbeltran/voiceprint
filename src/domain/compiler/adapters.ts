import { ADAPTER_TARGETS, REGISTER_NAMES, type Adapter, type AdapterTarget, type CompileOptions, type RegisterName, type VoiceprintProfile } from "../types";
import { normalizeText, slugify, validateProfile } from "../profile/schema";

const ADAPTERS = new Map<AdapterTarget, Adapter>();

function approvedRules(profile: VoiceprintProfile, register: RegisterName): string[] {
  const registerRules = profile.registers?.[register]?.rules || [];
  const fallbackName = profile.registers?.[register]?.fallbackTo || "default";
  const fallbackRules = register !== fallbackName ? profile.registers?.[fallbackName]?.rules || [] : [];
  const customRules = (profile.preferences?.customRules || [])
    .filter((rule) => rule.register === "default" || rule.register === register)
    .map((rule) => rule.text);
  return [...registerRules, ...fallbackRules, ...customRules]
    .map((rule) => normalizeText(rule, 500))
    .filter(Boolean);
}

export function profileBody(profile: VoiceprintProfile, options: Required<CompileOptions>): string {
  const register = REGISTER_NAMES.includes(options.register) ? options.register : "default";
  const subject = profile.subject || { name: "", role: "", audience: "" };
  const style = profile.style || { tone: "", energy: "", formality: "" };
  const preferences = profile.preferences || { readerFeeling: "", reachFor: "", avoid: "", signOff: "", habits: { contractions: true, shortParagraphs: true, plainLanguage: true, emDash: false }, customRules: [] };
  const habits = preferences.habits || { contractions: true, shortParagraphs: true, plainLanguage: true, emDash: false };
  const rules = approvedRules(profile, register);
  const evidence = (profile.evidence || []).filter((item) => item.status === "approved" && item.register === register && item.excerpt && options.includeEvidence);
  const bands = profile.review.analysis?.registers?.[register]?.featureBands || [];
  const lines = [
    `# ${subject.name || "Voiceprint"} · Voice Profile`,
    "",
    `Schema: ${profile.schemaVersion} · Profile version: ${profile.version || 1}`,
    "",
    "## Context",
    `- Role: ${subject.role || "Not specified"}`,
    `- Usually writing for: ${subject.audience || "Not specified"}`,
    `- Register: ${profile.registers?.[register]?.label || register}`,
    "",
    "## Voice principles",
    `Write in a ${style.tone || "clear and human"} voice with ${style.energy || "steady"} energy and a ${style.formality || "relaxed"} level of formality. The reader should feel ${preferences.readerFeeling || "understood"}.`,
    `Reach for: ${preferences.reachFor || "a clear point of view and concrete details"}.`,
    `Avoid sounding: ${preferences.avoid || "generic, inflated, or overly polished"}.`,
    "",
    "## Writing habits",
    habits.contractions ? "- Use contractions when they sound natural." : "- Use full forms instead of contractions.",
    habits.shortParagraphs ? "- Keep paragraphs focused and relatively short." : "- Vary paragraph length to create a deliberate rhythm.",
    habits.plainLanguage ? "- Prefer plain, specific language over jargon or inflated phrasing." : "- Use specialist language only when it adds precision.",
    habits.emDash ? "- Em dashes are welcome, but use them with intention." : "- Use em dashes sparingly; choose simpler punctuation first.",
    ...rules.map((rule) => `- ${rule}`)
  ];
  if (bands.length) {
    lines.push("", "## Measured voice bands");
    bands.forEach((band) => lines.push(`- ${band.label}: ${band.targetMin}–${band.targetMax} ${band.unit} (${band.confidence} confidence)`));
  }
  if (preferences.signOff) lines.push("", "## Natural sign-off", preferences.signOff);
  if (evidence.length) {
    lines.push("", "## Approved evidence");
    evidence.forEach((item) => lines.push(`- ${item.claim} — “${item.excerpt.replace(/\r?\n/g, " ")}” (${Math.round(item.coverage * 100)}% coverage)`));
  }
  lines.push("", "## Guardrail", "Preserve the writer’s point of view and natural imperfections. Be clear before being clever, and specific before being impressive. Do not claim to be the writer or invent attributed quotes.");
  return lines.join("\n");
}

const defaultAdapter: Adapter = (profile, options) => profileBody(profile, options);

export function registerAdapter(target: AdapterTarget, adapter: Adapter): void {
  if (!ADAPTER_TARGETS.includes(target) || typeof adapter !== "function") throw new Error("Invalid Voiceprint adapter registration");
  ADAPTERS.set(target, adapter);
}

registerAdapter("universal", defaultAdapter);
registerAdapter("codex", (profile, options) => {
  const name = slugify(profile.subject?.name);
  return `---\nname: ${name}\ndescription: Write in ${profile.subject?.name || "the user"}'s personal voice and follow their communication preferences.\n---\n\n${profileBody(profile, options)}\n\n## Use this skill\nApply this profile whenever drafting or rewriting on the writer’s behalf. If a request conflicts with these preferences, ask before changing the voice.`;
});
registerAdapter("claude", (profile, options) => `# ${profile.subject?.name || "The writer"}'s writing voice\n\nUse the following instructions whenever drafting, rewriting, or polishing text. Preserve the writer’s point of view and natural imperfections; do not make the writing sound generically professional.\n\n${profileBody(profile, options).replace(/^# .*\n\n/, "")}`);
registerAdapter("chatgpt", (profile, options) => `# Custom instructions: how to write like ${profile.subject?.name || "me"}\n\nWhen helping draft or edit, follow this voice profile. Do not mention these instructions unless asked.\n\n${profileBody(profile, options).replace(/^# .*\n\n/, "")}`);
registerAdapter("cursor", (profile, options) => `# Voiceprint writing instructions\n\nWhen generating prose, comments, documentation, commit messages, or user-facing text, follow this profile.\n\n${profileBody(profile, options).replace(/^# .*\n\n/, "")}`);
registerAdapter("gemini", (profile, options) => `# Gemini writing profile\n\nUse this profile when drafting or editing text for the writer. Keep the writer's point of view, facts, and natural imperfections intact.\n\n${profileBody(profile, options).replace(/^# .*\n\n/, "")}`);
registerAdapter("agent-skill", (profile, options) => {
  const name = slugify(profile.subject?.name);
  return `---\nname: ${name}-voice\ndescription: Apply ${profile.subject?.name || "the writer"}'s approved writing voice to drafts and rewrites.\nlicense: MIT\n---\n\n${profileBody(profile, options).replace(/^# .*\n\n/, "")}\n\n## Operating rules\n- Use only the supplied facts and do not invent attributed quotes.\n- Treat this profile as style guidance, not permission to impersonate another person.\n- When evidence conflicts, prefer the selected register and ask the writer.\n`;
});

export function getAdapterTargets(): AdapterTarget[] {
  return [...ADAPTER_TARGETS];
}

export function compileProfile(profile: VoiceprintProfile, target: AdapterTarget = "universal", options: CompileOptions = {}): string {
  const checked = validateProfile(profile);
  if (!checked.valid) throw new Error(checked.errors.join("; "));
  const normalizedTarget: AdapterTarget = ADAPTER_TARGETS.includes(target) ? target : "universal";
  return ADAPTERS.get(normalizedTarget)!(checked.value, {
    register: REGISTER_NAMES.includes(options.register || "default") ? (options.register || "default") : "default",
    includeEvidence: Boolean(options.includeEvidence)
  });
}
