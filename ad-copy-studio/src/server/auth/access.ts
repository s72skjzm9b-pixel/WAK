// Who may use the hosted studio. Pure, so it is easy to test.
export function isAllowedEmail(email: string | null | undefined, domains: string[], emails: string[]): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  if (emails.includes(e)) return true;
  const domain = e.split('@')[1] ?? '';
  return domains.includes(domain);
}
