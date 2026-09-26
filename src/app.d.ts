/// <reference types="vite-plugin-pwa/client" />

declare global {
  namespace App {
    interface Locals {
      user: import('$lib/server/schema').users.$inferSelect | null;
    }
  }
}
export {};
