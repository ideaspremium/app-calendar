import Link from "next/link";
import { requireAgency } from "@/lib/admin/context";
import { appUrl } from "@/lib/config";
import { createClient } from "../../actions";
import SubmitButton from "@/components/SubmitButton";
import { Notice, ZoneField } from "@/components/admin/ui";
import { I } from "@/components/admin/icons";
import LinkPending from "@/components/admin/LinkPending";

export const metadata = { title: "Nuevo negocio · Calendars360" };

export default async function NuevoNegocio({ searchParams }: { searchParams: Promise<{ error?: string; name?: string }> }) {
  const { error, name } = await searchParams;
  const ctx = await requireAgency();
  const host = appUrl().replace(/^https?:\/\//, "");
  const settings = ctx.agency.settings ?? {};

  return (
    <>
      <Link className="crumb" href="/admin/clients">{I.left}Negocios<LinkPending /></Link>
      <div className="hd">
        <div>
          <h1>Nuevo negocio</h1>
          <p>En {ctx.agency.name}. Después podrás conectar su calendario, poner su horario y crear sus servicios.</p>
        </div>
      </div>
      {!ctx.canManage ? (
        <Notice kind="warn">Solo dueño/a o admin de la agencia pueden crear negocios.</Notice>
      ) : (
        <form action={createClient} className="card" style={{ maxWidth: 820 }}>
          <div className="cb form">
            {error && (
              <div className="full">
                <Notice kind="bad">{error}</Notice>
              </div>
            )}
            <div className="fl">
              <label htmlFor="name">Nombre</label>
              <input id="name" name="name" className="inp" required defaultValue={name ?? ""} placeholder="Por ejemplo: Clínica Sonrisa" />
            </div>
            <div className="fl">
              <label htmlFor="slug">Dirección de su página</label>
              <div className="pre">
                <span>{host}/</span>
                <input id="slug" name="slug" className="inp" placeholder="se crea del nombre" pattern="[a-zA-Z0-9-]*" />
              </div>
              <small>Letras, números y guiones. Si la dejas vacía, se crea a partir del nombre.</small>
            </div>
            <div className="fl">
              <span className="lbl">Zona horaria</span>
              <ZoneField name="timezone" value={ctx.agency.timezone} />
              <small>La de la agencia; el horario del negocio se escribe en esta zona.</small>
            </div>
            <div className="fl">
              <label htmlFor="contact_email">Correo de contacto</label>
              <input id="contact_email" name="contact_email" type="email" className="inp" placeholder="opcional" />
            </div>
            <div className="fl full">
              <label htmlFor="website_url">Web del negocio</label>
              <input id="website_url" name="website_url" className="inp" placeholder="https://… (opcional)" />
              <small>
                Empieza con el estilo {settings.default_style === "vidrio" ? "vidrio" : "clásico"} y en {settings.default_locale === "en" ? "inglés" : "español"}, como dicen los ajustes de la agencia. Se cambia después en Imagen y Datos.
              </small>
            </div>
            <div className="full foot">
              <SubmitButton className="btn pri" pendingLabel="Creando…">Crear negocio</SubmitButton>
              <Link className="btn sec" href="/admin/clients">Cancelar</Link>
            </div>
          </div>
        </form>
      )}
    </>
  );
}
