import { describe, it, expect } from 'vitest';
import { UserService } from '../src/modules/users/user.service';

describe('Healthy Monolith User Service', () => {
  it('instantiates user service correctly', () => {
    const service = new UserService();
    expect(service).toBeDefined();
  });
});
