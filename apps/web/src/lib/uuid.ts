/** Client-generated idempotency key for attempts (E-041/E-012). */
export function randomUUID(): string {
  return crypto.randomUUID();
}
