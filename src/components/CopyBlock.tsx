"use client";
import { useState } from "react";

export default function CopyBlock({ code }: { code: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg bg-neutral-900 p-3 text-xs text-neutral-100">{code}</pre>
      <button onClick={() => { navigator.clipboard.writeText(code); setOk(true); setTimeout(() => setOk(false), 1500); }}
        className="absolute right-2 top-2 rounded bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20">
        {ok ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}
