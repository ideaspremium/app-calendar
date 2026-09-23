import "@fontsource-variable/inter";
import "@/styles/public.css";

export default function NotFound() {
  return (
    <main className="pc-404">
      <div>
        <h1>Esta página de reservas no existe</h1>
        <p>Puede que el enlace esté incompleto o que el servicio ya no esté disponible. Pide a quien te lo envió que te lo pase de nuevo.</p>
        <p style={{ marginTop: 14, fontSize: 14 }} lang="en">This booking page doesn&apos;t exist or is no longer available.</p>
      </div>
    </main>
  );
}
