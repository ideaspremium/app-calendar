import { NextRequest, NextResponse } from "next/server";
import { buildConfiguration, configurationVariants, deleteConfiguration, upsertConfiguration } from "@/lib/nylas";
import { supabaseServer } from "@/lib/supabase/server";
import type { AvailabilityRule, CalendarConnection, Client, EventType } from "@/lib/types";

/** Crea o actualiza la configuración del Scheduler en Nylas para un tipo de cita. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "no autorizado" }, { status: 401 });

  const { data: et } = await sb.from("event_types").select("*").eq("id", id).maybeSingle();
  if (!et) return NextResponse.json({ error: "tipo de cita no encontrado" }, { status: 404 });
  if (!et.calendar_connection_id) return NextResponse.json({ error: "Asigna primero un calendario conectado" }, { status: 400 });

  const [{ data: client }, { data: conn }, { data: rules }] = await Promise.all([
    sb.from("clients").select("*").eq("id", et.client_id).single(),
    sb.from("calendar_connections").select("*").eq("id", et.calendar_connection_id).single(),
    sb.from("availability_rules").select("weekday,start_time,end_time").eq("client_id", et.client_id)
      .or(`event_type_id.is.null,event_type_id.eq.${id}`),
  ]);
  if (!rules?.length) return NextResponse.json({ error: "Define al menos un horario de disponibilidad" }, { status: 400 });

  // Si hay reglas específicas del tipo de cita, prevalecen sobre las generales del cliente
  const specific = await sb.from("availability_rules").select("weekday,start_time,end_time").eq("event_type_id", id);
  const effective = (specific.data?.length ? specific.data : rules) as AvailabilityRule[];

  // Modo diagnóstico: prueba el cuerpo por capas y devuelve en cuál falla.
  // Cada capa que Nylas acepta se borra al momento para no dejar basura.
  if (req.nextUrl.searchParams.get("diagnose")) {
    const full = buildConfiguration(client as Client, et as EventType, conn as CalendarConnection, effective);
    const steps: { step: string; ok: boolean; error?: string; body?: object }[] = [];
    for (const variant of configurationVariants(full)) {
      try {
        const res = await upsertConfiguration(null, variant.body);
        steps.push({ step: variant.label, ok: true });
        await deleteConfiguration(res.data.id).catch(() => {});
      } catch (err) {
        steps.push({ step: variant.label, ok: false, error: (err as Error).message, body: variant.body });
        break;
      }
    }
    return NextResponse.json({ diagnose: steps }, { status: 200 });
  }

  try {
    const body = buildConfiguration(client as Client, et as EventType, conn as CalendarConnection, effective);
    const res = await upsertConfiguration(et.nylas_configuration_id, body);
    await sb.from("event_types").update({ nylas_configuration_id: res.data.id }).eq("id", id);
    return NextResponse.json({ ok: true, configuration_id: res.data.id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
