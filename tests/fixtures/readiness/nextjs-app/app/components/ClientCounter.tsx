'use client';

import React, { useState } from 'react';

export default function ClientCounter({ initialCount = 0 }: { initialCount?: number }) {
  const [count, setCount] = useState(initialCount);

  // Uses valid public environment variable properly prefixed
  const appEnv = process.env.NEXT_PUBLIC_APP_ENV || 'production';

  return (
    <div>
      <p>Current Environment: {appEnv}</p>
      <button onClick={() => setCount(count + 1)} aria-label="Increment counter">
        Count: {count}
      </button>
    </div>
  );
}
