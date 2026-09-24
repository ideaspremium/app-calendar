/**
 * Parámetros de atribución que viajan por las páginas públicas: los `utm_*` (enlace
 * directo) y `pc_attr` (lo que manda embed.js desde la web que embebe). Se conservan al
 * pasar de la lista de servicios a la reserva y en la redirección cuando hay uno solo.
 */
export const ATTR_PARAM = "pc_attr";
const UTM_PARAM = /^utm_(source|medium|campaign|content|term)$/;

export function keepAttributionParams(search: Record<string, string | string[] | undefined>, keep: URLSearchParams) {
  for (const [k, v] of Object.entries(search)) {
    if (k !== ATTR_PARAM && !UTM_PARAM.test(k)) continue;
    const val = Array.isArray(v) ? v[0] : v;
    if (val && val.length <= 4000) keep.set(k, val);
  }
}
