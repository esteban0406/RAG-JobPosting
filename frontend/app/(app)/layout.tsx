import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/AppShell";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

async function getUser() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth-token")?.value;
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
