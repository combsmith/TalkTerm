export interface AvatarPersona {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly riveAssetPath: string;
  readonly ttsVoiceName: string;
}

export const MVP_PERSONAS: readonly AvatarPersona[] = [
  {
    id: 'mary',
    name: 'Mary',
    description: 'Your friendly AI project partner — sharp, warm, and always ready to brainstorm.',
    riveAssetPath: 'assets/avatars/mary.riv',
    ttsVoiceName: 'Google UK English Female',
  },
] as const;
