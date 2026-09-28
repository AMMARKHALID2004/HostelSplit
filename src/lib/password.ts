export const passwordPattern = String.raw`(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9\s])\S{10,72}`;
export const passwordHelp = 'Use 10–72 characters with an uppercase letter, lowercase letter, number and symbol. No spaces.';
export function validPassword(password: string) {
  return new RegExp(`^${passwordPattern}$`).test(password) && new TextEncoder().encode(password).length <= 72;
}
