import { requireAgency } from "@/lib/admin/context";
import { AgencySettings } from "@/components/admin/AgencyForms";

export const metadata = { title: "Ajustes · Calendars360" };

export default async function Ajustes() {
  const ctx = await requireAgency();
  const a = ctx.agency;
  return (
    <>
      <div className="hd">
        <div>
          <h1>Ajustes de la agencia</h1>
          <p>Datos de {a.name} y valores por defecto para los negocios nuevos.</p>
        </div>
      </div>
      <AgencySettings
        canEdit={ctx.canManage}
        agency={{
          name: a.name,
          contact_email: a.contact_email ?? "",
          timezone: a.timezone,
          default_locale: a.settings?.default_locale === "en" ? "en" : "es",
          default_style: a.settings?.default_style === "vidrio" ? "vidrio" : "clasico",
        }}
      />
    </>
  );
}
