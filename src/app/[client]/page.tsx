import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import ClientFrame, { publicTheme } from "@/components/ClientFrame";
import { Icon } from "@/components/public/icons";
import { T, asLang } from "@/lib/public-texts";
import { getPublicClient, getPublicEventTypes } from "@/lib/public";

export default async function ClientPage({
  params, searchParams,
}: { params: Promise<{ client: string }>; searchParams: Promise<{ embed?: string; estilo?: string; lang?: string }> }) {
  const { client: slug } = await params;
  const search = await searchParams;
  const host = (await headers()).get("host");
  const client = await getPublicClient(slug, host);
  if (!client) notFound();
  const types = await getPublicEventTypes(client.id);

  const keep = new URLSearchParams();
  if (search.embed === "1") keep.set("embed", "1");
  if (search.estilo) keep.set("estilo", search.estilo);
  if (search.lang) keep.set("lang", search.lang);
  const qs = keep.toString() ? `?${keep}` : "";

  // Con un solo servicio, la lista sobra: se entra directo a reservar.
  if (types.length === 1) redirect(`/${client.slug}/${types[0].slug}${qs}`);

  const t = T[asLang(search.lang ?? client.locale)];
  return (
    <ClientFrame
      branding={client.branding}
      name={client.name}
      embedded={search.embed === "1"}
      theme={publicTheme(client.branding, search.estilo)}
      width="narrow"
    >
      <div className="pc-lhead">
        <h1>{t.chooseService}</h1>
        <p>{t.chooseServiceSub}</p>
      </div>
      {types.length === 0 ? (
        <p className="pc-empty">{t.noServices}</p>
      ) : (
        <div className="pc-svcs">
          {types.map((s) => (
            <Link key={s.id} href={`/${client.slug}/${s.slug}${qs}`} className="pc-svc pc-g2">
              <span className="pc-svc-bar" />
              <span className="pc-svc-body">
                <span className="pc-svc-title">{s.name}</span>
                <span className="pc-svc-meta" style={{ display: "block" }}>
                  {t.minutes(s.duration_minutes)} · {s.location_details || t.location[s.location_type] || t.location.in_person}
                </span>
                {s.description && <span className="pc-svc-desc">{s.description}</span>}
              </span>
              <span className="pc-svc-arrow">{Icon.right}</span>
            </Link>
          ))}
        </div>
      )}
    </ClientFrame>
  );
}
