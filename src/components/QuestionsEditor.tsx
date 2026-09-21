"use client";

import { useState } from "react";

export type Question = { key?: string; label: string; type: string; required: boolean };

const TYPES = [
  { value: "text", label: "Texto corto" },
  { value: "multi_line_text", label: "Texto largo" },
  { value: "phone_number", label: "Teléfono" },
  { value: "email", label: "Correo electrónico" },
];

/**
 * Editor visual de las preguntas extra del formulario de reserva.
 * Sustituye al antiguo cuadro de texto con formato "Etiqueta | tipo | *".
 * Envía el resultado en el campo oculto `questions_json`.
 */
export default function QuestionsEditor({ initial }: { initial?: Question[] }) {
  const [rows, setRows] = useState<Question[]>(
    initial && initial.length ? initial : [{ label: "Teléfono", type: "phone_number", required: true }]
  );

  const patch = (i: number, p: Partial<Question>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const remove = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));
  const add = () => setRows((rs) => [...rs, { label: "", type: "text", required: false }]);

  return (
    <div className="sm:col-span-2">
      <p className="text-sm font-medium">Preguntas adicionales</p>
      <p className="mb-3 text-xs opacity-60">
        El nombre y el correo de quien reserva se piden siempre. Añade aquí solo lo que necesites además de eso.
      </p>

      <input type="hidden" name="questions_json" value={JSON.stringify(rows.filter((r) => r.label.trim()))} />

      {rows.length === 0 ? (
        <p className="mb-2 text-sm opacity-60">Sin preguntas adicionales.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <input
                value={r.label}
                onChange={(e) => patch(i, { label: e.target.value })}
                placeholder="Pregunta (por ejemplo: Teléfono de contacto)"
                className="min-w-[220px] flex-1 rounded-lg border px-3 py-2 text-sm"
              />
              <select
                value={r.type}
                onChange={(e) => patch(i, { type: e.target.value })}
                className="rounded-lg border px-3 py-2 text-sm"
                aria-label="Tipo de respuesta"
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-sm whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={r.required}
                  onChange={(e) => patch(i, { required: e.target.checked })}
                />
                Obligatoria
              </label>
              <button
                type="button"
                onClick={() => remove(i)}
                title="Quitar esta pregunta"
                aria-label="Quitar esta pregunta"
                className="rounded-lg border px-2.5 py-2 text-sm opacity-60 hover:opacity-100"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={add} className="mt-3 rounded-lg border px-3 py-1.5 text-sm">
        + Añadir pregunta
      </button>
    </div>
  );
}
