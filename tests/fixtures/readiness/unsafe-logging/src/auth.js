/* global console */
export function verifyToken(_req, _res) {
  const secretKey = 'simulated_user_token_abc123';
  // Unsafe secret logging pattern:
  console.log('User authenticated with SECRET_KEY:', secretKey);
  return { authenticated: true };
}
