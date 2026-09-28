import { hash, compare } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { users, sessions } from './schema';
import { validName, validUsername } from './auth';
import { validPassword, passwordHelp } from '../password';
export async function registerAccount(input: { name: string; username: string; password: string; avatarBase64: string | null }) {
  const name = input.name.trim();
  const username = input.username.trim().toLowerCase();
  if (!validName(name)) throw new Error('Enter a name between 2 and 40 letters.');
  if (!validUsername(username)) throw new Error('Username: 3–24 letters, numbers or underscores.');
  if (!validPassword(input.password)) throw new Error(passwordHelp);
  const id = crypto.randomUUID();
  const passwordHash = await hash(input.password, 12);
  const result = await db.insert(users).values({ id, name, username, passwordHash, avatarBase64: input.avatarBase64, avatarUpdatedAt: input.avatarBase64 ? Date.now() : null, createdAt: Date.now() }).onConflictDoNothing({ target: users.username }).returning({ id: users.id });
  if (!result.length) throw new Error('That username is taken. Choose another.');
  return id;
}
export async function changePassword(userId: string, current: string, password: string) {
  if (!validPassword(password)) throw new Error(passwordHelp);
  const user = (await db.select().from(users).where(eq(users.id, userId)))[0];
  if (!user) throw new Error('Account not found.');
  if (user.passwordHash && !(await compare(current, user.passwordHash))) throw new Error('Your current password is incorrect.');
  const passwordHash = await hash(password, 12);
  await db.transaction(async tx => {
    await tx.update(users).set({ passwordHash, pinHash: null }).where(eq(users.id, userId));
    await tx.update(sessions).set({ revokedAt: Date.now() }).where(eq(sessions.userId, userId));
  });
}
