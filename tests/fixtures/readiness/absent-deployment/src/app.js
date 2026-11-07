// Basic express routes without health checks or graceful shutdown
export function createApp() {
  return {
    '/api/v1/items': () => [{ id: 1, name: 'Sample Item' }],
  };
}
