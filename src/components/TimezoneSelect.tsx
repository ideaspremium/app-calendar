/**
 * Selector de zona horaria con la lista IANA completa.
 * Antes era un campo de texto libre, y un valor inválido (por ejemplo «Miami»)
 * hace que Nylas lo ignore y calcule y muestre todas las horas en UTC.
 */
const ZONES: string[] = Intl.supportedValuesOf("timeZone");

export function isValidTimezone(value: string | null | undefined): boolean {
  return !!value && ZONES.includes(value);
}

export function TimezoneSelect({
  value,
  name = "timezone",
  label = "Zona horaria",
}: {
  value?: string | null;
  name?: string;
  label?: string;
}) {
  const current = value ?? "America/New_York";
  const invalid = !!value && !ZONES.includes(value);

  return (
    <label className="block text-sm">
      {label}
      <select
        name={name}
        defaultValue={current}
        required
        className="mt-1 w-full rounded-lg border px-3 py-2"
      >
        {invalid && <option value={value!}>{value} (no es una zona válida)</option>}
        {ZONES.map((z) => (
          <option key={z} value={z}>
            {z.replace(/_/g, " ")}
          </option>
        ))}
      </select>
      {invalid && (
        <span className="mt-1 block text-xs text-red-600">
          «{value}» no es una zona horaria válida. Elige una de la lista: mientras no lo hagas, las horas se
          calculan y se muestran en UTC.
        </span>
      )}
    </label>
  );
}
