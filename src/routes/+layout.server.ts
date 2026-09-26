export function load({ locals }: import('./$types').LayoutServerLoadEvent) {
  return { user: locals.user ? { id: locals.user.id, name: locals.user.name } : null };
}
