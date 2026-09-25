/**
 * Datos del titular que aparecen en la página de inicio, la política de privacidad y los
 * términos. Google los revisa al verificar la app: tienen que ser reales.
 * Los campos en null no se muestran.
 */
export const LEGAL = {
  product: "Calendars360",
  domain: "calendars360.ai",
  company: "Ideas Premium Solutions",
  /** Forma jurídica y datos registrales, p. ej. «Ideas Premium Solutions LLC». */
  legalName: null as string | null,
  /** Domicilio postal completo. */
  address: null as string | null,
  /** Número fiscal (CIF/NIF, EIN…). */
  taxId: null as string | null,
  email: "jab@ideaspremium.com",
  /** Ley y tribunales aplicables a los términos, p. ej. «España, tribunales de Santa Cruz de Tenerife». */
  jurisdiction: null as string | null,
  updated: { es: "24 de septiembre de 2026", en: "September 24, 2026" },
};

export const holderName = () => LEGAL.legalName ?? LEGAL.company;
