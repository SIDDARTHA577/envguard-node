import React from 'react';

export default function App() {
  return (
    <main>
      <h1>Product Catalog</h1>
      <p>Welcome to our accessible store.</p>
      <img src="/logo.png" alt="Company Logo" width="200" height="50" />
      <button type="button" aria-label="Add item to shopping cart">
        Add to Cart
      </button>
    </main>
  );
}
