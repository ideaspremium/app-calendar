import { createClient } from "../../actions";
import { Field } from "@/components/Field";
import { TimezoneSelect } from "@/components/TimezoneSelect";

export default async function NewClient({ searchParams }: { searchParams: Promise<{ agency?: string }> }) {
  const { agency } = await searchParams;
  return (
    <form action={createClient} className="max-w-xl space-y-4 rounded-xl border bg-white p-6">
      <h1 className="text-xl font-semibold">Nuevo cliente</h1>
      <input type="hidden" name="agency_id" value={agency} />
      <Field label="Nombre" name="name" required />
      <Field label="Slug (URL)" name="slug" placeholder="se genera del nombre si lo dejas vacío" />
      <TimezoneSelect value="America/New_York" />
      <Field label="Correo de contacto" name="contact_email" type="email" />
      <Field label="Web del cliente" name="website_url" />
      <h2 className="pt-2 font-medium">Imagen</h2>
      <Field label="URL del logo" name="logo_url" />
      <div className="grid grid-cols-3 gap-3">
        <Field label="Color principal" name="primary_color" type="color" defaultValue="#2563eb" />
        <Field label="Fondo" name="background" type="color" defaultValue="#ffffff" />
        <Field label="Texto" name="text_color" type="color" defaultValue="#17181c" />
      </div>
      <Field label="Tipografía (CSS)" name="font_family" placeholder='"Inter", sans-serif' />
      <button className="rounded-lg bg-black px-4 py-2 text-white">Crear cliente</button>
    </form>
  );
}

