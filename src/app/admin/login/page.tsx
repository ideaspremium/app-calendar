"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { I } from "@/components/admin/icons";

function spanish(message: string): string {
  if (/after \d+ seconds|rate limit/i.test(message)) return "Ya te enviamos un enlace hace muy poco. Espera un minuto y vuelve a pedirlo.";
  if (/invalid.*email|email.*invalid/i.test(message)) return "Ese correo no parece válido.";
  if (/signups not allowed|not allowed/i.test(message)) return "Ese correo no tiene acceso. Pide a tu agencia que te invite.";
  return message;
}

/**
 * Acceso por enlace mágico (sin contraseña). Además recoge la sesión cuando se llega desde
 * el correo de invitación de Supabase, que trae los tokens en el fragmento (#access_token=…)
 * en vez de un ?code=: /auth/callback no puede verlos porque el fragmento no llega al servidor.
 */
export default function Login() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "linking">("idle");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    const clean = () => window.history.replaceState(null, "", window.location.pathname);
    const access = hash.get("access_token"), refresh = hash.get("refresh_token");
    if (access && refresh) {
      setState("linking");
      supabaseBrowser()
        .auth.setSession({ access_token: access, refresh_token: refresh })
        .then(({ error }) => {
          clean();
          if (error) {
            setErr("No se pudo abrir la sesión con ese enlace. Pide uno nuevo.");
            setState("idle");
          } else window.location.replace("/admin");
        });
    } else if (hash.get("error") || hash.get("error_code") || query.get("error")) {
      const code = hash.get("error_code") || query.get("error") || "";
      setErr(/expired|otp/i.test(code) ? "Ese enlace ha caducado o ya se usó. Pide uno nuevo aquí." : "No se pudo entrar con ese enlace. Pide uno nuevo aquí.");
      clean();
    }
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setState("sending");
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setErr(spanish(error.message));
      setState("idle");
    } else setState("sent");
  }

  return (
    <div className="login">
      <div className="lc">
        <div className="brand" style={{ padding: 0 }}>
          <span className="lg">{I.logo}</span>
          <div>
            <b>Premium Calendar</b>
            <small>Panel de agencia</small>
          </div>
        </div>

        {state === "linking" ? (
          <>
            <h1>Entrando…</h1>
            <p>Estamos abriendo tu sesión.</p>
          </>
        ) : state === "sent" ? (
          <>
            <h1>Revisa tu correo</h1>
            <p>
              Te hemos enviado un enlace a <b style={{ color: "var(--text)" }}>{email}</b>. Ábrelo en este mismo dispositivo para entrar.
            </p>
            <button type="button" className="btn sec" style={{ width: "100%", height: 44, borderRadius: 14 }} onClick={() => setState("idle")}>
              Usar otro correo
            </button>
          </>
        ) : (
          <form onSubmit={send}>
            <h1>Entra en tu panel</h1>
            <p>Te mandamos un enlace a tu correo. No hace falta contraseña.</p>
            <div className="fl">
              <label htmlFor="email">Correo electrónico</label>
              <input id="email" className="inp" type="email" required autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="tu@agencia.com" />
            </div>
            {err && (
              <div className="notice bad" style={{ margin: "12px 0 0" }} role="alert">
                {I.warn}
                <span>{err}</span>
              </div>
            )}
            <button className="btn pri" disabled={state === "sending"}>
              {state === "sending" ? "Enviando…" : "Enviarme el enlace"}
            </button>
            <div className="foot">¿No tienes acceso? Pide a tu agencia que te invite.</div>
          </form>
        )}
      </div>
    </div>
  );
}
