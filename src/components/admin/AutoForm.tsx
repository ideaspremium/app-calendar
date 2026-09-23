"use client";
import Form from "next/form";
import { useRef } from "react";

/**
 * Formulario GET de filtros que se envía solo: al cambiar un desplegable, o al dejar de
 * escribir. Con next/form la navegación es del lado del cliente y el cuadro de búsqueda
 * no pierde el foco.
 */
export default function AutoForm({ action, children, className }: { action: string; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const timer = useRef<number | undefined>(undefined);
  return (
    <Form
      ref={ref}
      action={action}
      replace
      scroll={false}
      className={className}
      onChange={(e) => {
        const t = e.target as HTMLElement;
        window.clearTimeout(timer.current);
        if (t.tagName === "SELECT") ref.current?.requestSubmit();
        else if (t.tagName === "INPUT" && (t as HTMLInputElement).type === "search") timer.current = window.setTimeout(() => ref.current?.requestSubmit(), 600);
      }}
    >
      {children}
    </Form>
  );
}
