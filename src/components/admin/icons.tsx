const sv = (d: React.ReactNode, size = 18) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);

/** Iconos del panel (los mismos trazos que la maqueta). */
export const I = {
  logo: sv(<><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
  home: sv(<><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /></>),
  cal: sv(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
  users: sv(<><circle cx="9" cy="8" r="3.2" /><path d="M3 20c.6-3.4 3-5.2 6-5.2s5.4 1.8 6 5.2" /><path d="M16 5.2a3 3 0 0 1 0 5.6M18.5 20c-.3-2-1.2-3.5-2.6-4.4" /></>),
  brief: sv(<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" /></>),
  cog: sv(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>),
  more: sv(<><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></>),
  down: sv(<path d="m6 9 6 6 6-6" />, 16),
  right: sv(<path d="m9 6 6 6-6 6" />, 16),
  left: sv(<path d="m15 6-6 6 6 6" />, 16),
  search: sv(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>, 17),
  plus: sv(<path d="M12 5v14M5 12h14" />, 16),
  check: sv(<path d="m5 12.5 4.5 4.5L19 7.5" />, 14),
  checkL: sv(<path d="m5 12.5 4.5 4.5L19 7.5" />, 18),
  x: sv(<path d="M6 6l12 12M18 6 6 18" />, 14),
  xL: sv(<path d="M6 6l12 12M18 6 6 18" />, 18),
  swap: sv(<path d="M7 7h11l-3-3M17 17H6l3 3" />, 14),
  clock: sv(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>, 14),
  warn: sv(<><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v4M12 17.5v.01" /></>, 16),
  info: sv(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.01" /></>, 16),
  link: sv(<><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></>, 16),
  copy: sv(<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></>, 15),
  ext: sv(<><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>, 15),
  globe: sv(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>, 16),
  up: sv(<><path d="M12 16V4M6 10l6-6 6 6" /><path d="M4 20h16" /></>, 17),
  download: sv(<><path d="M12 4v12M6 10l6 6 6-6" /><path d="M4 20h16" /></>, 17),
  web: sv(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /></>, 14),
  api: sv(<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" />, 14),
  mail: sv(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>, 16),
  trash: sv(<><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>, 15),
  out: sv(<><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" /><path d="M10 17l5-5-5-5M15 12H4" /></>, 16),
  google: (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" />
      <path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9z" />
      <path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6z" />
    </svg>
  ),
};

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "·";
