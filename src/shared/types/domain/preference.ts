export interface Preference {
  readonly agentType: string;
  readonly workspacePath: string;
  readonly key: string;
  readonly value: string;
  readonly consecutiveCount: number;
  readonly updatedAt: string;
}

export const PREFERENCE_THRESHOLD_ESTABLISH = 3;
export const PREFERENCE_THRESHOLD_SHIFT = 2;

export function shouldEstablishPreference(consecutiveCount: number): boolean {
  return consecutiveCount >= PREFERENCE_THRESHOLD_ESTABLISH;
}

export function shouldShiftPreference(consecutiveDifferentCount: number): boolean {
  return consecutiveDifferentCount >= PREFERENCE_THRESHOLD_SHIFT;
}
