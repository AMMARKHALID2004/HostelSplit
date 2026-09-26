export async function imageToDataUrl(value: FormDataEntryValue | null, limitBytes = 1_500_000) {
  if (!(value instanceof File) || value.size === 0) return null;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(value.type)) throw new Error('Upload a PNG, JPEG, or WebP image');
  if (value.size > limitBytes) throw new Error('Image must be under 1.5 MB');
  return `data:${value.type};base64,${Buffer.from(await value.arrayBuffer()).toString('base64')}`;
}
