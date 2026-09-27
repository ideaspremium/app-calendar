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
  legalName: "Ideas Premium Solutions, Inc." as string | null,
  /** Domicilio postal completo. */
  address: "1222 SE 47th St., Suite C-1, Cape Coral, FL 33904, EE. UU." as string | null,
  /** Número fiscal (CIF/NIF, EIN…). */
  taxId: "EIN 33-4355264" as string | null,
  email: "team@ideaspremium.com",
  /** Ley aplicable a los términos (texto que sigue a «se rigen por…» / «are governed by…»). */
  jurisdiction: {
    es: "las leyes del estado de Florida (EE. UU.), sin perjuicio de los derechos que la ley de su país de residencia reconozca a los consumidores",
    en: "the laws of the State of Florida (USA), without prejudice to the rights that consumers have under the law of their country of residence",
  } as { es: string; en: string } | null,
  updated: { es: "24 de septiembre de 2026", en: "September 24, 2026" },
};

export const holderName = () => LEGAL.legalName ?? LEGAL.company;
