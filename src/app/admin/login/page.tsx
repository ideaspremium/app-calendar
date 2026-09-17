"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const sb = supabaseBrowser();
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setErr(error.message); else setSent(true);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-6 text-2xl font-semibold">Premium Calendar</h1>
      {sent ? (
        <p>Te enviamos un enlace de acceso a <strong>{email}</strong>. Revisa tu correo.</p>
      ) : (
        <form onSubmit={send} className="space-y-3">
          <label className="block text-sm">Correo electrónico
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2" />
          </label>
          <button className="w-full rounded-lg bg-black px-4 py-2 text-white">Enviar enlace de acceso</button>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </form>
      )}
    </main>
  );
}
