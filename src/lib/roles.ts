/** Perfil de app: un solo administrador por email; el resto son managers. */

export type AppRole = "admin" | "manager";

const DEFAULT_ADMIN_EMAIL = "peniasuki@gmail.com";

export function adminEmail(): string {
  return (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === adminEmail();
}

export function appRoleFromEmail(email: string | null | undefined): AppRole {
  return isAdminEmail(email) ? "admin" : "manager";
}
