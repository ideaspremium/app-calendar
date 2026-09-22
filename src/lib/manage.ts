import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Client } from "@/lib/types";

/**
 * Cita por su token de gestión (bookings.manage_token), para los enlaces que se dan al
 * visitante. El token es aleatorio (24 bytes): quien lo tiene puede gestionar la cita,
 * igual que con el enlace del correo de Nylas.
 */
export async function bookingByToken(token: string) {
  if (!/^[0-9a-f]{16,128}$/i.test(token)) return null;
  const db = supabaseAdmin();
  const { data: b } = await db
    .from("bookings")
    .select("id, client_id, event_type_id, start_at, end_at, status, invitee_timezone, nylas_booking_id")
    .eq("manage_token", token)
    .maybeSingle();
  if (!b) return null;
  const [{ data: client }, { data: et }] = await Promise.all([
    db.from("clients").select("*").eq("id", b.client_id).maybeSingle(),
    b.event_type_id
      ? db.from("event_types").select("id, name, slug, nylas_configuration_id").eq("id", b.event_type_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!client) return null;
  return {
    booking: b as {
      id: string;
      start_at: string;
      end_at: string;
      status: string;
      invitee_timezone: string;
      nylas_booking_id: string | null;
    },
    client: client as Client,
    service: et as { id: string; name: string; slug: string; nylas_configuration_id: string | null } | null,
  };
}
