"use client";

import { useFormStatus } from "react-dom";

/**
 * Botón de envío que se desactiva y avisa mientras el formulario se está guardando,
 * para que nunca parezca que el clic no hizo nada.
 */
export default function SubmitButton({
  children,
  pendingLabel = "Guardando…",
  className = "rounded-lg bg-black px-4 py-2 text-sm text-white",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${className} disabled:cursor-wait disabled:opacity-60`}>
      {pending ? pendingLabel : children}
    </button>
  );
}
