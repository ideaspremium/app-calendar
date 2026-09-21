"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SyncButton({ eventTypeId, hasConfig }: { eventTypeId: string; hasConfig: boolean }) {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnosis, setDiagnosis] = useState("");
  const router = useRouter();

  async function sync() {
    setState("loading");
    setMsg("");
    setDiagnosis("");
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

  async function diagnose() {
    setDiagnosing(true);
    setDiagnosis("");
    try {
      const r = await fetch(`/api/event-types/${eventTypeId}/sync?diagnose=1`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      setDiagnosis(JSON.stringify(j, null, 2));
    } catch (e) {
      setDiagnosis((e as Error).message);
    } finally {
      setDiagnosing(false);
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
        {state === "error" && (
          <button
            onClick={diagnose}
            disabled={diagnosing}
            className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {diagnosing ? "Diagnosticando…" : "Diagnosticar"}
          </button>
        )}
      </span>

      {state === "error" && (
        <span className="max-w-xl whitespace-pre-wrap break-words rounded-lg bg-red-50 p-2 text-xs text-red-700">
          {msg}
        </span>
      )}

      {diagnosis && (
        <textarea
          readOnly
          value={diagnosis}
          rows={14}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full min-w-[32rem] max-w-3xl rounded-lg border bg-neutral-50 p-2 font-mono text-[11px]"
        />
      )}
    </span>
  );
}
