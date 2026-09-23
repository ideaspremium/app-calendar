import "@fontsource-variable/inter";
import "@/styles/public.css";

export default function NotFound() {
  return (
    <main className="pc-404">
      <div>
        <h1>No encontramos esta página</h1>
        <p>Puede que el enlace esté incompleto o que la página ya no exista.</p>
        <p style={{ marginTop: 14, fontSize: 14 }} lang="en">This page could not be found.</p>
      </div>
    </main>
  );
}
