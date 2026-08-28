import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/AppShell";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth-cookies";

const API = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:4000/api/v1";

async function getUser() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
    if (!token) return null;
    const res = await fetch(`${API}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { tags: ["user"] },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

  return <AppShell user={user}>{children}</AppShell>;
}
