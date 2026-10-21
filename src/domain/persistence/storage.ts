import { DEFAULT_PROFILE, importProfile, sanitizeForPersistence } from "../profile/schema";
import { STORAGE_SCHEMA_VERSION, type PersistenceEnvelope, type VoiceprintProfile } from "../types";

export const STORAGE_KEY = "voiceprint-profile-v3";
export const MAX_HISTORY = 8;

export interface LoadedState {
  profile: VoiceprintProfile;
  history: VoiceprintProfile[];
  persistApprovedEvidence: boolean;
}

export function readPersistedState(storage: Storage | null): LoadedState {
  if (!storage) return { profile: DEFAULT_PROFILE, history: [], persistApprovedEvidence: false };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { profile: DEFAULT_PROFILE, history: [], persistApprovedEvidence: false };
    const parsed = JSON.parse(raw) as Partial<PersistenceEnvelope>;
    const current = parsed.current ? importProfile(parsed.current) : null;
    const history = Array.isArray(parsed.history)
      ? parsed.history.map((entry) => importProfile(entry)).filter((entry) => entry.valid).map((entry) => entry.value)
      : [];
    return {
      profile: current?.valid ? current.value : DEFAULT_PROFILE,
      history: history.slice(0, MAX_HISTORY),
      persistApprovedEvidence: Boolean(parsed.settings?.persistApprovedEvidence)
    };
  } catch {
    return { profile: DEFAULT_PROFILE, history: [], persistApprovedEvidence: false };
  }
}

export function writePersistedState(
  storage: Storage | null,
  profile: VoiceprintProfile,
  history: VoiceprintProfile[],
  persistApprovedEvidence: boolean
): void {
  if (!storage) return;
  const envelope: PersistenceEnvelope = {
    storageVersion: STORAGE_SCHEMA_VERSION,
    current: sanitizeForPersistence(profile, { persistApprovedEvidence }),
    history: history.slice(0, MAX_HISTORY).map((entry) => sanitizeForPersistence(entry, { persistApprovedEvidence })),
    settings: { persistApprovedEvidence }
  };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Quota and private-mode failures are intentionally non-fatal; the UI stays usable in memory.
  }
}
