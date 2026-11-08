export interface UserProfile {
  id: string;
  email: string;
  role: 'admin' | 'user';
}

export const API_VERSION = 'v1';
