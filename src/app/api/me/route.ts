import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { adminEmail } from "@/lib/roles";

/** Perfil de sesión tras login (admin vs manager). */
export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({
      uid: user.uid,
      email: user.email,
      name: user.name,
      picture: user.picture,
      appRole: user.appRole,
      isAdmin: user.appRole === "admin",
      adminEmail: adminEmail(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHENTICATED" ? 401 : 500 });
  }
}
