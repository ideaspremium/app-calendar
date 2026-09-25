import "@fontsource-variable/dm-sans";
import "@/styles/site.css";
import Link from "next/link";
import { holderName, LEGAL } from "@/lib/legal";

function Mark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <rect x="1" y="3" width="26" height="24" rx="7" fill="#5b3fe0" />
      <rect x="1" y="3" width="26" height="8" rx="4" fill="#3f2aa8" />
      <rect x="7" y="0.5" width="3" height="6" rx="1.5" fill="#1c1530" />
      <rect x="18" y="0.5" width="3" height="6" rx="1.5" fill="#1c1530" />
      <path d="M9 18.5l3.2 3.2L19.5 14" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function SiteFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="site">
      <div className="site-wrap">
        <header className="site-top">
          <Link href="/" className="site-mark">
            <Mark />
            {LEGAL.product}
          </Link>
          <Link href="/admin/login" className="site-enter">
            Entrar al panel
          </Link>
        </header>
        {children}
        <footer className="site-foot">
          <span>
            © 2026 {holderName()}. {LEGAL.product} es un servicio de {LEGAL.company}.
          </span>
          <nav aria-label="Información legal">
            <Link href="/privacidad">Privacidad</Link>
            <Link href="/terminos">Términos</Link>
            <a href={`mailto:${LEGAL.email}`}>Contacto</a>
          </nav>
        </footer>
      </div>
    </div>
  );
}
