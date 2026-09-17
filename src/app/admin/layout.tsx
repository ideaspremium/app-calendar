import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { signOut } from "./actions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  return (
    <div className="min-h-screen">
      <nav className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/admin" className="font-semibold">Premium Calendar</Link>
          {user && (
            <form action={signOut} className="flex items-center gap-3 text-sm">
              <span className="opacity-60">{user.email}</span>
              <button className="underline">Salir</button>
            </form>
          )}
        </div>
      </nav>
      <div className="mx-auto max-w-5xl px-4 py-8">{children}</div>
    </div>
  );
}
