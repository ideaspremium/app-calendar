import type { Metadata } from "next";
import Link from "next/link";
import SiteFrame from "@/components/site/SiteFrame";

export const metadata: Metadata = {
  title: "Calendars360 · Reserva de citas en línea para negocios",
  description:
    "Calendars360 conecta el calendario de Google o Microsoft de un negocio y publica su página de reservas, con su logo y sus colores, para compartir por enlace o insertar en su web.",
};

const DAYS = [
  { d: "Lun", n: 5 },
  { d: "Mar", n: 6 },
  { d: "Mié", n: 7 },
  { d: "Jue", n: 8 },
  { d: "Vie", n: 9 },
];
const TIMES = ["9:00", "10:00", "11:30", "13:00"];
// Qué huecos se ven ocupados (fuera de horario) o reservados en la muestra.
const OFF = new Set(["0-3", "2-0", "4-2", "4-3"]);
const TAKEN = "1-1";

export default function Home() {
  return (
    <SiteFrame>
      <main>
        <section className="hero">
          <div>
            <h1>Citas en línea para cada negocio, con su propia imagen.</h1>
            <p>
              Calendars360 conecta el calendario de Google o Microsoft de un negocio y publica su página de reservas,
              con su logo y sus colores. Se comparte por enlace o se inserta en su web, y cada cita llega sola a su agenda.
            </p>
            <Link href="/admin/login" className="hero-cta">
              Entrar al panel
            </Link>
          </div>

          <figure className="week" aria-label="Ejemplo de huecos disponibles en una semana">
            <div className="week-head" aria-hidden="true">
              {DAYS.map((x) => (
                <span key={x.d}>
                  {x.d}
                  <b>{x.n}</b>
                </span>
              ))}
            </div>
            <div className="week-grid" aria-hidden="true">
              {TIMES.map((t, ti) =>
                DAYS.map((_, di) => {
                  const k = `${di}-${ti}`;
                  const cls = k === TAKEN ? "slot taken" : OFF.has(k) ? "slot off" : "slot";
                  return (
                    <span key={k} className={cls}>
                      {t}
                    </span>
                  );
                })
              )}
            </div>
            <figcaption className="week-note">
              Quien reserva solo ve los huecos libres de verdad: el horario del negocio, menos lo que ya tiene en su calendario.
            </figcaption>
          </figure>
        </section>

        <section className="steps" aria-labelledby="como">
          <h2 id="como">Cómo funciona</h2>
          <ol>
            <li>
              <h3>Conectar el calendario</h3>
              <p>El negocio autoriza su cuenta de Google o Microsoft. Calendars360 consulta cuándo está ocupado y crea ahí las citas.</p>
            </li>
            <li>
              <h3>Definir horario y servicios</h3>
              <p>Días y horas de atención, duración de cada cita, márgenes entre citas y las preguntas que se hacen al reservar.</p>
            </li>
            <li>
              <h3>Compartir la página</h3>
              <p>Un enlace para redes y mensajes, o un código para insertar el calendario en la web o en una landing.</p>
            </li>
            <li>
              <h3>Recibir las reservas</h3>
              <p>Cada cita aparece en la agenda del negocio, con correo de confirmación y enlaces para cambiarla o cancelarla.</p>
            </li>
          </ol>
        </section>

        <section className="block" aria-labelledby="agencias">
          <h2 id="agencias">Para agencias</h2>
          <div>
            <p>
              Una agencia gestiona desde un solo panel los calendarios de todos sus negocios: su imagen, sus horarios, sus
              servicios y las citas que reciben, cada una en la zona horaria correcta.
            </p>
            <p>
              Las reservas conservan de qué campaña o página llegó cada persona, para medir qué acciones traen clientes.
            </p>
          </div>
        </section>

        <section className="block" aria-labelledby="datos">
          <h2 id="datos">Los datos, en Europa</h2>
          <div>
            <p>
              Todo se aloja en la Unión Europea. Del calendario conectado solo se usa lo necesario para calcular los huecos
              libres y crear, cambiar o cancelar las citas reservadas. No se venden datos ni se usan para publicidad.
            </p>
            <p>
              Los detalles están en la <Link href="/privacidad">política de privacidad</Link> y en los{" "}
              <Link href="/terminos">términos del servicio</Link>.
            </p>
          </div>
        </section>
      </main>
    </SiteFrame>
  );
}
