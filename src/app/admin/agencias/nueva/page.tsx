import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin/context";
import { NewAgency } from "@/components/admin/AgencyForms";
import { I } from "@/components/admin/icons";

export const metadata = { title: "Crear agencia · Premium Calendar" };

export default async function NuevaAgencia() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/admin/login");
  if (!ctx.isPlatform) redirect("/admin");
  return (
    <>
      <Link className="crumb" href="/admin">{I.left}Inicio</Link>
      <div className="hd">
        <div>
          <h1>Crear agencia</h1>
          <p>Solo la plataforma puede crear agencias. Cada agencia tiene sus negocios y su equipo.</p>
        </div>
      </div>
      <NewAgency timezone={ctx.agency?.timezone ?? "America/New_York"} />
    </>
  );
}
