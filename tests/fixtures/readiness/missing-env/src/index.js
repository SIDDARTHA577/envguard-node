/* global process, console */
// Unsafe raw environment variable access without validation
const dbUrl = process.env.DATABASE_URL;
const secretKey = process.env.SECRET_KEY;

export function connect() {
  if (!dbUrl) console.warn('No database url configured');
  return { dbUrl, secretKey };
}
