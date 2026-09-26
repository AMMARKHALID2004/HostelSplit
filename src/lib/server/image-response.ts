import { error } from '@sveltejs/kit';

export function imageResponse(dataUrl: string | null) {
  const match = dataUrl?.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) error(404, 'Image not found');
  return new Response(Buffer.from(match[2], 'base64'), { headers: { 'content-type': match[1], 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
}
