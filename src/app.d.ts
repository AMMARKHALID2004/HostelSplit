/// <reference types="vite-plugin-pwa/client" />

declare global {
  namespace App {
    interface Platform { context: { waitUntil(promise: Promise<unknown>): void } }
    interface Locals {
      roomId: string | null;
      membership: import('$lib/server/schema').roomMemberships.$inferSelect | null;
      user: import('$lib/server/schema').users.$inferSelect | null;
    }
  }
}
export {};
