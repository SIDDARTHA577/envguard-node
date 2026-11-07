/* global process, console */
export function verifyToken(_req, _res) {
  const secret = process.env.AUTH_SECRET;
  // Unsafe secret logging pattern:
  console.log('User authenticated with SECRET_KEY:', secret);
  return { authenticated: true };
}
