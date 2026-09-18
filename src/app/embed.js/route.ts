import { appUrl } from "@/lib/config";
import { NextResponse } from "next/server";

/**
 * Script de embed: <script src="https://citas.../embed.js" data-client="acme" data-event="consulta"
 *                          data-mode="inline|popup" data-label="Reservar cita" data-color="#123456"></script>
 */
export function GET() {
  const base = appUrl();
  const js = `(function(){
  var s=document.currentScript; if(!s) return;
  var d=s.dataset, base="${base}";
  var url=base+"/"+d.client+(d.event?"/"+d.event:"")+"?embed=1";
  var mode=d.mode||"inline";
  function frame(){var f=document.createElement("iframe");f.src=url;f.title="Reservar cita";
    f.style.cssText="width:100%;border:0;min-height:640px;background:transparent;";f.setAttribute("allowtransparency","true");return f;}
  if(mode==="inline"){var wrap=document.createElement("div");wrap.className="premium-calendar";wrap.appendChild(frame());s.parentNode.insertBefore(wrap,s);}
  else{var color=d.color||"#2563eb";var btn=document.createElement("button");btn.textContent=d.label||"Reservar cita";
    btn.style.cssText="position:fixed;right:20px;bottom:20px;z-index:99998;padding:14px 20px;border:0;border-radius:999px;background:"+color+";color:#fff;font:600 15px system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.18);cursor:pointer";
    var ov=document.createElement("div");ov.style.cssText="display:none;position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.5);padding:24px;box-sizing:border-box";
    var box=document.createElement("div");box.style.cssText="position:relative;max-width:920px;height:100%;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden";
    var x=document.createElement("button");x.textContent="\\u00d7";x.setAttribute("aria-label","Cerrar");
    x.style.cssText="position:absolute;top:8px;right:8px;width:36px;height:36px;border:0;border-radius:50%;background:#fff;font-size:22px;cursor:pointer;z-index:1";
    var f=frame();f.style.height="100%";box.appendChild(x);box.appendChild(f);ov.appendChild(box);
    btn.onclick=function(){ov.style.display="block"};x.onclick=function(){ov.style.display="none"};ov.onclick=function(e){if(e.target===ov)ov.style.display="none"};
    document.body.appendChild(btn);document.body.appendChild(ov);}
  window.addEventListener("message",function(e){if(e.data&&e.data.type==="premium-calendar:booked"){document.dispatchEvent(new CustomEvent("premium-calendar:booked",{detail:e.data.detail}));}});
})();`;
  return new NextResponse(js, {
    headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
