"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SyncButton({ eventTypeId, hasConfig }: { eventTypeId: string; hasConfig: boolean }) {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");
  const router = useRouter();
  async function sync() {
    setState("loading");
    const r = await fetch(`/api/event-types/${eventTypeId}/sync`, { method: "POST" });
    const j = await r.json();
    if (r.ok) { setState("ok"); router.refresh(); } else { setState("error"); setMsg(j.error ?? "Error"); }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={sync} disabled={state === "loading"}
        className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black hover:text-white disabled:opacity-50">
        {state === "loading" ? "Publicando…" : hasConfig ? "Actualizar en Nylas" : "Publicar calendario"}
      </button>
      {state === "ok" && <span className="text-sm text-green-700">Publicado</span>}
      {state === "error" && <span className="text-sm text-red-600" title={msg}>Error: {msg.slice(0, 120)}</span>}
    </span>
  );
}
