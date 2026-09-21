"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SyncButton({ eventTypeId, hasConfig }: { eventTypeId: string; hasConfig: boolean }) {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");
  const router = useRouter();

  async function sync() {
    setState("loading");
    setMsg("");
    try {
      const r = await fetch(`/api/event-types/${eventTypeId}/sync`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setState("ok");
        router.refresh();
      } else {
        setState("error");
        setMsg(j.error ?? `Error ${r.status}`);
      }
    } catch (e) {
      setState("error");
      setMsg((e as Error).message);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span className="inline-flex items-center gap-2">
        <button
          onClick={sync}
          disabled={state === "loading"}
          className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black hover:text-white disabled:opacity-50"
        >
          {state === "loading" ? "Publicando…" : hasConfig ? "Actualizar en Nylas" : "Publicar calendario"}
        </button>
        {state === "ok" && <span className="text-sm text-green-700">Publicado</span>}
      </span>
      {state === "error" && (
        <span className="max-w-xl whitespace-pre-wrap break-words rounded-lg bg-red-50 p-2 text-xs text-red-700">
          {msg}
        </span>
      )}
    </span>
  );
}
