import type { Metadata } from "next";
import Link from "next/link";
import SiteFrame from "@/components/site/SiteFrame";
import { holderName, LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Términos del servicio · Calendars360",
  description: "Condiciones de uso de Calendars360.",
};

export default function Terminos() {
  const mail = <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>;
  return (
    <SiteFrame>
      <main className="legal">
        <h1>Términos del servicio</h1>
        <p className="upd">Última actualización: {LEGAL.updated.es}</p>
        <p className="langs">
          <a href="#en" lang="en">English version below</a>
        </p>

        <h2>1. El servicio</h2>
        <p>
          Calendars360 ({LEGAL.domain}) es un servicio de {holderName()} que permite a agencias y negocios conectar su
          calendario de Google o Microsoft y publicar páginas de reserva de citas, para compartir por enlace o insertar en
          su web. Estos términos se aplican a quien usa el panel y a quien reserva una cita.
        </p>

        <h2>2. Cuentas del panel</h2>
        <ul>
          <li>El acceso al panel es por invitación. Cada persona es responsable de su cuenta y de lo que se haga con ella.</li>
          <li>
            Quien conecta un calendario declara que tiene derecho a hacerlo y autoriza a Calendars360 a consultar su
            disponibilidad y a crear, cambiar y cancelar en él los eventos de las citas reservadas.
          </li>
          <li>El negocio puede desconectar su calendario en cualquier momento desde el panel o desde su cuenta de Google o Microsoft.</li>
        </ul>

        <h2>3. Responsabilidades del negocio</h2>
        <ul>
          <li>Mantener al día su horario, sus servicios y los datos que publica.</li>
          <li>Atender las citas que recibe y comunicarse con las personas que reservan.</li>
          <li>
            Informar a sus clientes del tratamiento de sus datos: el negocio es responsable de los datos de quienes reservan
            con él (ver la <Link href="/privacidad">política de privacidad</Link>).
          </li>
          <li>No usar el servicio para fines ilícitos, para enviar comunicaciones no solicitadas ni para suplantar a otros.</li>
        </ul>

        <h2>4. Quien reserva una cita</h2>
        <p>
          La cita se reserva con el negocio, no con Calendars360. Los cambios, cancelaciones y cualquier condición de la
          cita dependen del negocio. Los enlaces del correo de confirmación permiten cambiarla o cancelarla dentro del plazo
          que el negocio haya fijado.
        </p>

        <h2>5. Servicios de terceros</h2>
        <p>
          Calendars360 funciona sobre servicios de terceros (Google, Microsoft, Nylas y proveedores de alojamiento). Su
          disponibilidad y sus cambios pueden afectar al servicio. Los correos de confirmación los envía Nylas y las
          invitaciones de calendario, el proveedor del calendario del negocio.
        </p>

        <h2>6. Disponibilidad y cambios</h2>
        <p>
          Procuramos que el servicio esté disponible y funcione correctamente, pero no garantizamos que esté libre de
          interrupciones o errores. Podemos mejorar, cambiar o retirar funciones; si un cambio afecta de forma importante a
          quien usa el panel, avisaremos con antelación razonable.
        </p>

        <h2>7. Suspensión</h2>
        <p>Podemos suspender una cuenta que incumpla estos términos o ponga en riesgo el servicio o a otras personas.</p>

        <h2>8. Responsabilidad</h2>
        <p>
          En la medida que permita la ley, {holderName()} no responde de daños indirectos ni de citas perdidas por causas
          ajenas a su control, como fallos de los proveedores de calendario o datos mal configurados por el negocio. Nada en
          estos términos limita los derechos que la ley reconoce a los consumidores.
        </p>

        <h2>9. Contacto{LEGAL.jurisdiction ? " y ley aplicable" : ""}</h2>
        <p>
          Para cualquier consulta sobre estos términos: {mail}.
          {LEGAL.jurisdiction ? ` Estos términos se rigen por la ley de ${LEGAL.jurisdiction}.` : ""}
        </p>

        <hr />

        <section id="en" lang="en">
          <h1>Terms of service</h1>
          <p className="upd">Last updated: {LEGAL.updated.en}</p>

          <h2>1. The service</h2>
          <p>
            Calendars360 ({LEGAL.domain}) is a service by {holderName()} that lets agencies and businesses connect their
            Google or Microsoft calendar and publish appointment booking pages, to share by link or embed on their website.
            These terms apply to dashboard users and to people who book an appointment.
          </p>

          <h2>2. Dashboard accounts</h2>
          <ul>
            <li>Dashboard access is by invitation. Each person is responsible for their account and its use.</li>
            <li>
              Whoever connects a calendar confirms they are entitled to do so and authorizes Calendars360 to check its
              availability and to create, update and cancel the events of booked appointments in it.
            </li>
            <li>The business can disconnect its calendar at any time from the dashboard or from its Google or Microsoft account.</li>
          </ul>

          <h2>3. Business responsibilities</h2>
          <ul>
            <li>Keep its hours, services and published information up to date.</li>
            <li>Attend the appointments it receives and communicate with the people who book.</li>
            <li>
              Inform its customers about the processing of their data: the business is the controller of the data of people
              who book with it (see the <Link href="/privacidad#en">privacy policy</Link>).
            </li>
            <li>Not use the service for unlawful purposes, to send unsolicited communications or to impersonate others.</li>
          </ul>

          <h2>4. People who book</h2>
          <p>
            The appointment is booked with the business, not with Calendars360. Changes, cancellations and any conditions of
            the appointment depend on the business. The links in the confirmation email allow rescheduling or cancelling
            within the notice period set by the business.
          </p>

          <h2>5. Third-party services</h2>
          <p>
            Calendars360 relies on third-party services (Google, Microsoft, Nylas and hosting providers). Their availability
            and changes may affect the service. Confirmation emails are sent by Nylas and calendar invitations by the
            business&apos;s calendar provider.
          </p>

          <h2>6. Availability and changes</h2>
          <p>
            We aim to keep the service available and working properly, but we do not guarantee it will be free of
            interruptions or errors. We may improve, change or withdraw features; if a change significantly affects
            dashboard users, we will give reasonable notice.
          </p>

          <h2>7. Suspension</h2>
          <p>We may suspend an account that breaches these terms or puts the service or other people at risk.</p>

          <h2>8. Liability</h2>
          <p>
            To the extent permitted by law, {holderName()} is not liable for indirect damages or for appointments lost due to
            causes beyond its control, such as calendar provider failures or data misconfigured by the business. Nothing in
            these terms limits the rights that the law grants to consumers.
          </p>

          <h2>9. Contact{LEGAL.jurisdiction ? " and governing law" : ""}</h2>
          <p>
            For any question about these terms: {mail}.
            {LEGAL.jurisdiction ? ` These terms are governed by the law of ${LEGAL.jurisdiction}.` : ""}
          </p>
        </section>
      </main>
    </SiteFrame>
  );
}
