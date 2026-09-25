import type { Metadata } from "next";
import SiteFrame from "@/components/site/SiteFrame";
import { holderName, LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Política de privacidad · Calendars360",
  description: "Qué datos trata Calendars360, para qué, dónde se guardan y cómo ejercer tus derechos.",
};

function Holder({ en = false }: { en?: boolean }) {
  return (
    <p>
      {en ? "The controller is" : "El responsable es"} <b>{holderName()}</b>
      {LEGAL.taxId ? ` (${LEGAL.taxId})` : ""}
      {LEGAL.address ? `, ${LEGAL.address}` : ""}.{" "}
      {en ? "Contact:" : "Contacto:"} <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
    </p>
  );
}

export default function Privacidad() {
  const mail = <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>;
  return (
    <SiteFrame>
      <main className="legal">
        <h1>Política de privacidad</h1>
        <p className="upd">Última actualización: {LEGAL.updated.es}</p>
        <p className="langs">
          <a href="#en" lang="en">English version below</a>
        </p>

        <p>
          Calendars360 ({LEGAL.domain}) es un servicio de {LEGAL.company} para que agencias y negocios publiquen páginas de
          reserva de citas conectadas a su calendario. Esta política explica qué datos tratamos, para qué, dónde se guardan y
          cómo ejercer tus derechos.
        </p>

        <h2>1. Quién es el responsable</h2>
        <Holder />
        <p>
          Hay dos papeles distintos. Somos <b>responsables</b> de los datos de las agencias y negocios que usan el panel y
          conectan su calendario. De los datos de las personas que reservan una cita, el <b>responsable es el negocio</b> con
          el que se reserva; nosotros los tratamos por su cuenta, como <b>encargados</b>, solo para prestarle el servicio.
        </p>

        <h2>2. Qué datos tratamos</h2>
        <h3>Usuarios del panel (agencias y negocios)</h3>
        <ul>
          <li>Correo electrónico y nombre, para iniciar sesión, y la agencia a la que pertenecen y su papel.</li>
          <li>Datos del negocio que configuran: nombre, dirección web, zona horaria, logo, colores, horarios y servicios.</li>
        </ul>
        <h3>Calendario conectado (datos de Google o Microsoft)</h3>
        <p>Cuando un negocio conecta su cuenta de Google o Microsoft, con su autorización accedemos a:</p>
        <ul>
          <li>
            Su <b>dirección de correo y su perfil básico</b> (nombre), para identificar la cuenta conectada.
          </li>
          <li>
            Sus <b>eventos de calendario</b>, para dos cosas y ninguna más: saber en qué horas está ocupado, y así ofrecer
            solo huecos libres; y crear, modificar y cancelar los eventos de las citas que se reservan con Calendars360,
            incluida la respuesta del invitado a esos eventos.
          </li>
        </ul>
        <p>
          No leemos el contenido de los demás eventos más allá de lo necesario para saber si una hora está libre, no
          accedemos al correo ni a los contactos, y no guardamos los eventos que no son citas reservadas con Calendars360.
        </p>
        <h3>Personas que reservan una cita</h3>
        <ul>
          <li>Nombre, correo electrónico, teléfono si se pide, zona horaria, respuestas al formulario del negocio y notas.</li>
          <li>La cita: servicio, fecha y hora, estado y, si se cancela, el motivo.</li>
          <li>
            Datos de procedencia de la visita: la página desde la que se reservó, la página de referencia y los parámetros de
            campaña (UTM) del enlace, para que el negocio sepa qué acciones le traen clientes.
          </li>
        </ul>
        <h3>Cookies y almacenamiento en el navegador</h3>
        <ul>
          <li>
            Si el negocio inserta el calendario en su web, se guarda en esa web una cookie propia, <code>ips_utm</code>, con
            los parámetros de campaña de la primera visita, durante 30 días. No identifica a la persona.
          </li>
          <li>La página de reserva guarda esos mismos datos en el almacenamiento de sesión del navegador mientras dura la visita.</li>
          <li>El panel usa cookies técnicas de sesión para mantener iniciada la sesión. No usamos cookies publicitarias.</li>
        </ul>

        <h2>3. Para qué los usamos</h2>
        <ul>
          <li>Prestar el servicio: calcular huecos libres, crear la cita en el calendario del negocio, enviar la confirmación y permitir cambiarla o cancelarla.</li>
          <li>Mantener la cita al día si cambia en el calendario (por ejemplo, si el invitado rechaza la invitación).</li>
          <li>Dar al negocio la información de sus citas y de su procedencia, en su panel y en las herramientas que conecte.</li>
          <li>Seguridad, prevención de abusos y soporte técnico.</li>
        </ul>
        <p>
          La base jurídica es la ejecución del contrato con la agencia o el negocio y, para la persona que reserva, la
          gestión de la cita que solicita. No tomamos decisiones automatizadas con efectos sobre las personas.
        </p>

        <h2>4. Datos de usuario de Google</h2>
        <div className="hl">
          <p>
            El uso que Calendars360 hace de la información recibida de las API de Google, y su transferencia a cualquier otra
            aplicación, se ajusta a la{" "}
            <a href="https://developers.google.com/terms/api-services-user-data-policy">Política de datos de usuario de los servicios de API de Google</a>,
            incluidos los requisitos de Uso limitado.
          </p>
        </div>
        <ul>
          <li>Solo usamos esos datos para las funciones descritas en el apartado 2, que el usuario ve y autoriza.</li>
          <li>No los vendemos, no los usamos para publicidad y no los usamos para entrenar modelos de inteligencia artificial.</li>
          <li>
            Ninguna persona los lee, salvo con el consentimiento expreso del usuario, cuando sea necesario por seguridad o
            para cumplir la ley, o de forma agregada y anónima para el funcionamiento interno.
          </li>
          <li>Solo los transferimos a los proveedores del apartado 5, en la medida necesaria para prestar el servicio.</li>
        </ul>

        <h2>5. Con quién los compartimos</h2>
        <ul>
          <li>
            <b>El negocio</b> con el que se reserva y la agencia que lo gestiona, que ven sus citas en el panel.
          </li>
          <li>
            Proveedores que nos prestan servicio, con contrato de encargo de tratamiento: <b>Nylas</b> (conexión con los
            calendarios y correos de confirmación, región UE), <b>Supabase</b> (base de datos, París) y <b>Vercel</b>
            (alojamiento de la aplicación, funciones en París).
          </li>
          <li>
            <b>Google o Microsoft</b>, como proveedores del calendario del negocio: la cita se crea en su calendario y, si la
            persona es invitada, ese proveedor le envía su invitación.
          </li>
          <li>Las herramientas que el propio negocio o su agencia conecten a su cuenta mediante nuestra API.</li>
          <li>Las autoridades, cuando la ley lo exija.</li>
        </ul>
        <p>No vendemos datos personales a nadie.</p>

        <h2>6. Dónde se guardan</h2>
        <p>
          En la Unión Europea. Si algún proveedor tratara datos fuera del Espacio Económico Europeo, lo haría con las
          garantías del Reglamento General de Protección de Datos, como las cláusulas contractuales tipo.
        </p>

        <h2>7. Cuánto tiempo</h2>
        <ul>
          <li>Los datos del panel y del negocio, mientras la cuenta esté activa.</li>
          <li>
            El acceso al calendario, hasta que el negocio lo desconecte en el panel o revoque el permiso en su cuenta de
            Google (<a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>) o Microsoft. Al
            revocarlo dejamos de acceder de inmediato.
          </li>
          <li>Las citas, mientras el negocio las conserve en su cuenta, o hasta que se pida su eliminación.</li>
        </ul>
        <p>Si se cierra la cuenta, eliminamos sus datos en un plazo de 30 días, salvo lo que la ley obligue a conservar.</p>

        <h2>8. Tus derechos</h2>
        <p>
          Puedes pedir acceso, rectificación, supresión, limitación, oposición y portabilidad de tus datos escribiendo a{" "}
          {mail}. Si reservaste una cita, también puedes dirigirte al negocio, que es su responsable; si nos escribes a
          nosotros, se lo trasladaremos. Si crees que no hemos atendido bien tu solicitud, puedes reclamar ante la autoridad
          de protección de datos, en España la Agencia Española de Protección de Datos (aepd.es).
        </p>

        <h2>9. Seguridad</h2>
        <p>
          Las conexiones van cifradas, el acceso a los datos de cada agencia está separado del de las demás, las claves de
          acceso se guardan de forma que no se pueden leer y las credenciales de los calendarios las custodia Nylas, no
          Calendars360.
        </p>

        <h2>10. Cambios</h2>
        <p>Si cambiamos esta política, publicaremos aquí la nueva versión con su fecha y avisaremos a los usuarios del panel de los cambios importantes.</p>

        <hr />

        <section id="en" lang="en">
          <h1>Privacy policy</h1>
          <p className="upd">Last updated: {LEGAL.updated.en}</p>
          <p>
            Calendars360 ({LEGAL.domain}) is a service by {LEGAL.company} that lets agencies and businesses publish
            appointment booking pages connected to their calendar. This policy explains what data we process, why, where it
            is stored and how to exercise your rights.
          </p>

          <h2>1. Controller</h2>
          <Holder en />
          <p>
            We are the <b>controller</b> of the data of agencies and businesses that use the dashboard and connect their
            calendar. For the data of people who book an appointment, the <b>business</b> they book with is the controller;
            we process it on its behalf, as a <b>processor</b>, only to provide the service.
          </p>

          <h2>2. Data we process</h2>
          <h3>Dashboard users (agencies and businesses)</h3>
          <ul>
            <li>Email address and name, to sign in, plus the agency they belong to and their role.</li>
            <li>Business settings: name, website, time zone, logo, colours, opening hours and services.</li>
          </ul>
          <h3>Connected calendar (Google or Microsoft data)</h3>
          <p>When a business connects its Google or Microsoft account, with its authorization we access:</p>
          <ul>
            <li>Its <b>email address and basic profile</b> (name), to identify the connected account.</li>
            <li>
              Its <b>calendar events</b>, for two purposes only: to know when it is busy, so that only free time slots are
              offered; and to create, update and cancel the events of appointments booked through Calendars360, including
              the invitee&apos;s response to those events.
            </li>
          </ul>
          <p>
            We do not read the content of other events beyond what is needed to know whether a time is free, we do not
            access email or contacts, and we do not store events that are not appointments booked through Calendars360.
          </p>
          <h3>People who book an appointment</h3>
          <ul>
            <li>Name, email address, phone number if requested, time zone, answers to the business&apos;s form and notes.</li>
            <li>The appointment: service, date and time, status and, if cancelled, the reason.</li>
            <li>
              Visit source: the page where the booking was made, the referring page and the campaign (UTM) parameters of the
              link, so the business can see which actions bring customers.
            </li>
          </ul>
          <h3>Cookies and browser storage</h3>
          <ul>
            <li>
              If the business embeds the calendar on its website, a first-party cookie, <code>ips_utm</code>, stores the
              campaign parameters of the first visit on that website for 30 days. It does not identify the person.
            </li>
            <li>The booking page keeps the same data in the browser&apos;s session storage during the visit.</li>
            <li>The dashboard uses technical session cookies to keep users signed in. We do not use advertising cookies.</li>
          </ul>

          <h2>3. How we use it</h2>
          <ul>
            <li>To provide the service: compute free slots, create the appointment in the business&apos;s calendar, send the confirmation and allow rescheduling or cancelling.</li>
            <li>To keep the appointment up to date if it changes in the calendar (for example, if the invitee declines the invitation).</li>
            <li>To give the business information about its appointments and where they came from, in its dashboard and in the tools it connects.</li>
            <li>Security, abuse prevention and technical support.</li>
          </ul>
          <p>
            The legal basis is the performance of the contract with the agency or business and, for the person booking,
            handling the appointment they request. We make no automated decisions with effects on people.
          </p>

          <h2>4. Google user data</h2>
          <div className="hl">
            <p>
              Calendars360&apos;s use and transfer to any other app of information received from Google APIs will adhere to
              the{" "}
              <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>,
              including the Limited Use requirements.
            </p>
          </div>
          <ul>
            <li>We only use this data for the features described in section 2, which the user sees and authorizes.</li>
            <li>We do not sell it, we do not use it for advertising and we do not use it to train artificial intelligence models.</li>
            <li>
              No person reads it, except with the user&apos;s explicit consent, when necessary for security or to comply with
              the law, or in aggregated and anonymized form for internal operations.
            </li>
            <li>We only transfer it to the providers in section 5, to the extent needed to provide the service.</li>
          </ul>

          <h2>5. Who we share it with</h2>
          <ul>
            <li><b>The business</b> the appointment is booked with and the agency that manages it, who see their appointments in the dashboard.</li>
            <li>
              Service providers under data processing agreements: <b>Nylas</b> (calendar connection and confirmation emails,
              EU region), <b>Supabase</b> (database, Paris) and <b>Vercel</b> (application hosting, functions in Paris).
            </li>
            <li>
              <b>Google or Microsoft</b>, as the business&apos;s calendar provider: the appointment is created in its calendar
              and, if the person is invited, that provider sends its own invitation.
            </li>
            <li>Tools that the business or its agency connect to their account through our API.</li>
            <li>Authorities, when required by law.</li>
          </ul>
          <p>We do not sell personal data to anyone.</p>

          <h2>6. Where it is stored</h2>
          <p>
            In the European Union. If a provider processed data outside the European Economic Area, it would do so with the
            safeguards of the General Data Protection Regulation, such as standard contractual clauses.
          </p>

          <h2>7. Retention</h2>
          <ul>
            <li>Dashboard and business data, while the account is active.</li>
            <li>
              Calendar access, until the business disconnects it in the dashboard or revokes the permission in its Google (
              <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>) or Microsoft account. Once
              revoked, we stop accessing it immediately.
            </li>
            <li>Appointments, while the business keeps them in its account, or until deletion is requested.</li>
          </ul>
          <p>If an account is closed, we delete its data within 30 days, except what the law requires us to keep.</p>

          <h2>8. Your rights</h2>
          <p>
            You can request access, rectification, erasure, restriction, objection and portability by writing to {mail}. If
            you booked an appointment, you can also contact the business, which is the controller; if you write to us, we will
            forward your request. You can lodge a complaint with a data protection authority.
          </p>

          <h2>9. Security</h2>
          <p>
            Connections are encrypted, each agency&apos;s data is isolated from the others, access keys are stored in a form
            that cannot be read back, and calendar credentials are held by Nylas, not by Calendars360.
          </p>

          <h2>10. Changes</h2>
          <p>If we change this policy, we will publish the new version here with its date and notify dashboard users of significant changes.</p>
        </section>

      </main>
    </SiteFrame>
  );
}
