export interface UserProfile {
  readonly name: string;
  readonly avatarPersonaId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function createUserProfile(name: string): UserProfile {
  if (name.trim() === '') {
    throw new Error('User name cannot be empty');
  }
  const now = new Date();
  return {
    name: name.trim(),
    avatarPersonaId: null,
    createdAt: now,
    updatedAt: now,
  };
}
