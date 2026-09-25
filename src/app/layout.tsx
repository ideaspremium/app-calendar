import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Calendars360",
  description: "Reserva de citas en línea para negocios",
  metadataBase: new URL("https://calendars360.ai"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
