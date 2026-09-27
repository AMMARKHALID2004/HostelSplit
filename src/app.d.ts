/// <reference types="vite-plugin-pwa/client" />

declare global {
  namespace App {
    interface Platform { context: { waitUntil(promise: Promise<unknown>): void } }
    interface Locals {
      user: import('$lib/server/schema').users.$inferSelect | null;
    }
  }
}
export {};
