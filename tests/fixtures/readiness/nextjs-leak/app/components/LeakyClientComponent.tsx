'use client';

import React from 'react';

export default function LeakyClientComponent() {
  // Vulnerable pattern: accessing server-only secret in browser component
  const dbUrl = process.env.DATABASE_URL;

  return <div>Database URL: {dbUrl}</div>;
}
