import { appUrl } from "@/lib/config";
import { NextResponse } from "next/server";

/**
 * Script de embed. Los fragmentos que ya tienen pegados los clientes siguen valiendo:
 *   <script src="https://…/embed.js" data-client="acme" data-event="consulta"
 *           data-mode="inline|popup" data-label="Reservar cita" data-color="#123456"></script>
 * Opcionales nuevos: data-lang="es|en" y data-estilo="clasico|vidrio".
 *
 * - En línea: el iframe crece con su contenido (la página avisa de su altura), sin barra
 *   de desplazamiento interna.
 * - Popup: el iframe se crea al abrirlo por primera vez; se cierra con Esc, con la X o
 *   tocando fuera; en el móvil ocupa toda la pantalla. El texto del botón se elige
 *   blanco o negro según el color, para que se lea.
 * - Solo se aceptan mensajes que vengan de la propia app y de su iframe.
 * - Al reservar se dispara en la página el evento `premium-calendar:booked`.
 * - Atribución (CONTRATO_CONVERSIONES §3.1.2): lee los `utm_*` de la página que embebe;
 *   si no hay, los de la cookie de primera parte `ips_utm` (JSON, 30 días), que se escribe
 *   la primera vez que se ven UTM en ese dominio. Pasa a la página de reserva, en `pc_attr`,
 *   la URL de la página, su referrer y esos UTM; la página los guarda con la cita.
 */
export function GET() {
  const base = appUrl();
  const js = `(function(){
  var s=document.currentScript; if(!s) return;
  var d=s.dataset, base=${JSON.stringify(base)}, origin=new URL(base).origin;
  var q="?embed=1"+(d.lang?"&lang="+encodeURIComponent(d.lang):"")+(d.estilo?"&estilo="+encodeURIComponent(d.estilo):"");
  var UK=["source","medium","campaign","content","term"];
  function readUtmCookie(){try{var m=document.cookie.match(/(?:^|; )ips_utm=([^;]*)/);return m?JSON.parse(decodeURIComponent(m[1])):null}catch(e){return null}}
  function attribution(){
    var qp=new URLSearchParams(location.search),utm={},has=false,at=new Date().toISOString();
    UK.forEach(function(k){var v=qp.get("utm_"+k);v=v?String(v).trim().slice(0,200):"";utm[k]=v||null;if(v)has=true});
    var c=readUtmCookie();
    if(has){if(!c){try{document.cookie="ips_utm="+encodeURIComponent(JSON.stringify({utm:utm,captured_at:at}))+"; max-age=2592000; path=/; SameSite=Lax"+(location.protocol==="https:"?"; Secure":"")}catch(e){}}}
    else if(c&&c.utm){UK.forEach(function(k){utm[k]=typeof c.utm[k]==="string"&&c.utm[k]?c.utm[k].slice(0,200):null});if(c.captured_at)at=c.captured_at}
    return {page_url:String(location.href).slice(0,2000),referrer:document.referrer?String(document.referrer).slice(0,2000):null,utm:utm,captured_at:at};
  }
  function b64u(o){return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"")}
  try{q+="&pc_attr="+b64u(attribution())}catch(e){}
  var url=base+"/"+encodeURIComponent(d.client||"")+(d.event?"/"+encodeURIComponent(d.event):"")+q;
  var mode=d.mode||"inline";
  function lum(hex){var h=String(hex||"").replace("#","");if(h.length===3)h=h.replace(/(.)/g,"$1$1");if(!/^[0-9a-f]{6}$/i.test(h))return 0.1;
    return [0,2,4].map(function(i){var v=parseInt(h.substr(i,2),16)/255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4)})
      .reduce(function(a,v,i){return a+v*[0.2126,0.7152,0.0722][i]},0)}
  function textOn(hex){var L=lum(hex);return (1.05/(L+0.05))>=((L+0.05)/0.0556)?"#ffffff":"#111111"}
  function frame(){var f=document.createElement("iframe");f.src=url;f.title=d.label||"Reservar cita";f.loading="lazy";
    f.setAttribute("allowtransparency","true");f.style.cssText="display:block;width:100%;border:0;background:transparent;color-scheme:normal;";return f}
  var frames=[];
  window.addEventListener("message",function(e){
    if(e.origin!==origin||!e.data)return;
    var f=null;for(var i=0;i<frames.length;i++){if(frames[i].contentWindow===e.source)f=frames[i]}
    if(!f)return;
    if(e.data.type==="premium-calendar:resize"&&f.getAttribute("data-autoheight")&&e.data.height>0){f.style.height=Math.ceil(e.data.height)+"px"}
    if(e.data.type==="premium-calendar:booked"){document.dispatchEvent(new CustomEvent("premium-calendar:booked",{detail:e.data.detail}))}
  });
  if(mode==="inline"){
    var wrap=document.createElement("div");wrap.className="premium-calendar";
    var f=frame();f.setAttribute("data-autoheight","1");f.style.height="720px";frames.push(f);
    wrap.appendChild(f);s.parentNode.insertBefore(wrap,s);return;
  }
  var color=d.color||"#2563eb";
  var btn=document.createElement("button");btn.type="button";btn.textContent=d.label||"Reservar cita";
  btn.style.cssText="position:fixed;right:20px;bottom:20px;z-index:99998;padding:14px 22px;border:0;border-radius:999px;background:"+color+";color:"+textOn(color)+";font:600 15px system-ui,-apple-system,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.18);cursor:pointer";
  var ov=null,box=null,lastFocus=null,prevOverflow="";
  function layout(){if(!box)return;var small=window.innerWidth<640;
    ov.style.padding=small?"0":"24px";box.style.maxWidth=small?"none":"1180px";box.style.borderRadius=small?"0":"20px"}
  function open(){
    if(!ov){
      ov=document.createElement("div");ov.setAttribute("role","dialog");ov.setAttribute("aria-modal","true");ov.setAttribute("aria-label",d.label||"Reservar cita");
      ov.style.cssText="display:none;position:fixed;inset:0;z-index:99999;background:rgba(15,15,20,.55);box-sizing:border-box";
      box=document.createElement("div");box.style.cssText="position:relative;height:100%;margin:0 auto;overflow:hidden;background:#fff;box-shadow:0 20px 60px rgba(0,0,0,.35)";
      var x=document.createElement("button");x.type="button";x.textContent="\\u00d7";x.setAttribute("aria-label","Cerrar");
      x.style.cssText="position:absolute;top:10px;right:10px;width:38px;height:38px;border:0;border-radius:50%;background:rgba(255,255,255,.92);box-shadow:0 1px 4px rgba(0,0,0,.2);font:400 24px/38px system-ui,sans-serif;color:#222;cursor:pointer;z-index:1";
      x.onclick=close;
      var f=frame();f.style.height="100%";f.style.overflow="auto";frames.push(f);
      box.appendChild(x);box.appendChild(f);ov.appendChild(box);
      ov.addEventListener("click",function(e){if(e.target===ov)close()});
      document.body.appendChild(ov);window.addEventListener("resize",layout);
    }
    layout();lastFocus=document.activeElement;prevOverflow=document.documentElement.style.overflow;
    document.documentElement.style.overflow="hidden";ov.style.display="block";
    var xb=box.querySelector("button");if(xb)xb.focus();
  }
  function close(){if(!ov)return;ov.style.display="none";document.documentElement.style.overflow=prevOverflow;if(lastFocus&&lastFocus.focus)lastFocus.focus()}
  document.addEventListener("keydown",function(e){if(e.key==="Escape"&&ov&&ov.style.display==="block")close()});
  btn.onclick=open;
  document.body.appendChild(btn);
})();`;
  return new NextResponse(js, {
    headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
