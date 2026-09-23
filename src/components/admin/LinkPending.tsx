"use client";
import { useLinkStatus } from "next/link";
import { useFormStatus } from "react-dom";

/**
 * Va dentro de un <Link>. Al pulsarlo, el enlace se marca al instante (y se enciende la
 * barrita de arriba) mientras llega la página: así se nota que el clic ha hecho algo.
 */
export default function LinkPending() {
  const { pending } = useLinkStatus();
  return <span className={pending ? "lp on" : "lp"} aria-hidden="true" />;
}

/** Lo mismo para formularios con acción de servidor (cambiar de agencia, salir). */
export function FormPending() {
  const { pending } = useFormStatus();
  return pending ? <span className="lp on" aria-hidden="true" /> : null;
}
