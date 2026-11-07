import React from 'react';
import Image from 'next/image';
import ClientCounter from './components/ClientCounter';

export default function HomePage() {
  return (
    <main>
      <h1>Welcome to Next.js App</h1>
      <Image src="/logo.png" alt="Company Logo" width={200} height={50} priority />
      <ClientCounter initialCount={0} />
    </main>
  );
}
