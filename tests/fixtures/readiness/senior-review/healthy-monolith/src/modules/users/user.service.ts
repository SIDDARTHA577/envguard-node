export interface User {
  id: string;
  name: string;
  email: string;
}

export class UserService {
  async findById(id: string): Promise<User | null> {
    return { id, name: 'Alice', email: 'alice@example.com' };
  }
}
