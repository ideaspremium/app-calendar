"use client";
import { useState, useTransition } from "react";
import { inviteMember, removeMember, resendInvite, setMemberRole } from "@/app/admin/actions";
import { I } from "./icons";
import { Notice } from "./ui";

export type Person = { user_id: string; email: string; role: "owner" | "admin" | "member"; since: string; pending: boolean; me: boolean };

const ROLE = { owner: "Dueño/a", admin: "Admin", member: "Miembro" } as const;
const COLORS = [["#e4dcff", "#5b3fe0"], ["#ffe3d6", "#b4501d"], ["#dff3ea", "#0f7b3f"], ["#e8f0fc", "#1f5fbf"], ["#fdecea", "#b42318"]];
const color = (s: string) => COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

function Row({ p, isOwner, canManage, onMsg }: { p: Person; isOwner: boolean; canManage: boolean; onMsg: (m: { kind: "ok" | "bad"; text: string }) => void }) {
  const [pending, start] = useTransition();
  const [sure, setSure] = useState(false);
  const [bg, fg] = color(p.email);
  const canRemove = isOwner || (canManage && p.pending && p.role !== "owner");

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      // Las acciones ya devuelven la página actualizada (revalidatePath): no hace falta recargar.
      if (r.ok) onMsg({ kind: "ok", text: ok });
      else onMsg({ kind: "bad", text: (r as { error: string }).error });
      setSure(false);
    });

  return (
    <tr className="mrow">
      <td>
        <div className="person">
          <span className="av2" style={{ background: p.pending ? "#f1f0f5" : bg, color: p.pending ? "#8b879a" : fg }}>{p.pending ? I.mail : p.email[0].toUpperCase()}</span>
          <div className="n" style={{ minWidth: 0 }}>
            <b style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{p.email}{p.me && " (tú)"}</b>
            <small>{p.since}</small>
          </div>
        </div>
      </td>
      <td>
        {isOwner && !p.pending ? (
          <select className="inp" style={{ height: 34 }} value={p.role} disabled={pending} aria-label={`Papel de ${p.email}`}
            onChange={(e) => run(() => setMemberRole(p.user_id, e.target.value), `Papel de ${p.email} cambiado a ${ROLE[e.target.value as Person["role"]]}.`)}>
            {(Object.keys(ROLE) as Person["role"][]).map((r) => <option key={r} value={r}>{ROLE[r]}</option>)}
          </select>
        ) : (
          <span className={`pill ${p.pending ? "p-info" : p.role === "member" ? "p-n" : "p-v"}`}>{ROLE[p.role]}</span>
        )}
      </td>
      <td className="acts">
        {p.pending && canManage && (
          <button type="button" className="btn sec sm" disabled={pending} onClick={() => run(() => resendInvite(p.email), `Enlace de acceso reenviado a ${p.email}.`)}>
            Reenviar
          </button>
        )}{" "}
        {canRemove && !(p.me && !isOwner) && (
          <button type="button" className={p.pending ? "btn ghost sm" : "btn dan sm"} disabled={pending} onBlur={() => setSure(false)}
            onClick={() => (sure ? run(() => removeMember(p.user_id), p.pending ? `Invitación a ${p.email} anulada.` : `${p.email} ya no está en la agencia.`) : setSure(true))}>
            {sure ? (p.me ? "Sí, salir" : "¿Seguro?") : p.pending ? "Anular" : p.me ? "Salir de la agencia" : "Quitar"}
          </button>
        )}
      </td>
    </tr>
  );
}

export function TeamTable({ people, isOwner, canManage }: { people: Person[]; isOwner: boolean; canManage: boolean }) {
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const active = people.filter((p) => !p.pending);
  const invited = people.filter((p) => p.pending);
  return (
    <div className="stack" style={{ gap: 12 }}>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div className="card tbw">
        <table className="tb">
          <thead>
            <tr><th>Persona</th><th>Papel</th><th /></tr>
          </thead>
          <tbody>
            {active.map((p) => <Row key={p.user_id} p={p} isOwner={isOwner} canManage={canManage} onMsg={setMsg} />)}
            {invited.length > 0 && (
              <tr className="day"><td colSpan={3}>Invitaciones pendientes · aún no han entrado</td></tr>
            )}
            {invited.map((p) => <Row key={p.user_id} p={p} isOwner={isOwner} canManage={canManage} onMsg={setMsg} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function InviteForm({ canInviteOwner }: { canInviteOwner: boolean }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member" | "owner">("member");
  const [msg, setMsg] = useState<{ kind: "ok" | "bad" | "warn"; text: string } | null>(null);
  const [pending, start] = useTransition();

  function send(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      const r = await inviteMember({ email, role });
      if (!r.ok) return setMsg({ kind: "bad", text: r.error });
      if (r.status === "already_member") setMsg({ kind: "warn", text: `${email} ya está en la agencia.` });
      else if (r.status === "added") setMsg({ kind: "ok", text: `${email} ya tenía cuenta: la hemos añadido. Puede entrar con su correo desde la pantalla de acceso.` });
      else if (r.mailError) setMsg({ kind: "warn", text: `La invitación está creada, pero el correo no salió (${r.mailError}). Pide a la persona que entre desde la pantalla de acceso con ${email}, o revisa el correo saliente de Supabase.` });
      else setMsg({ kind: "ok", text: `Invitación enviada a ${email}.` });
      setEmail("");
    });
  }

  return (
    <form className="card" onSubmit={send}>
      <div className="ch">
        <div>
          <h2>Invitar a alguien</h2>
          <p>Le llega un correo con un enlace para entrar; no necesita contraseña.</p>
        </div>
      </div>
      <div className="cb form one">
        <div className="fl">
          <label htmlFor="inv-email">Correo</label>
          <input id="inv-email" type="email" required className="inp" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="persona@agencia.com" />
        </div>
        <div className="fl">
          <span className="lbl">Papel</span>
          <span className="seg2" role="radiogroup" aria-label="Papel">
            {(canInviteOwner ? (["owner", "admin", "member"] as const) : (["admin", "member"] as const)).map((r) => (
              <button key={r} type="button" role="radio" aria-checked={role === r} className={role === r ? "on" : ""} onClick={() => setRole(r)}>
                {ROLE[r]}
              </button>
            ))}
          </span>
        </div>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <div>
          <button className="btn pri" disabled={pending}>{I.mail}{pending ? "Enviando…" : "Enviar invitación"}</button>
        </div>
      </div>
    </form>
  );
}
