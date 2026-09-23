"use client";
import { useEffect } from "react";

/**
 * Dentro de un iframe (embed.js), avisa a la página que lo contiene de la altura real del
 * contenido, para que el iframe crezca con él y no aparezca una barra de desplazamiento
 * interna. embed.js solo acepta estos mensajes si vienen de su propio iframe.
 */
export default function EmbedResizer() {
  useEffect(() => {
    if (window.parent === window) return;
    let last = 0;
    const send = () => {
      const h = Math.ceil(document.documentElement.scrollHeight);
      if (Math.abs(h - last) < 2) return;
      last = h;
      window.parent.postMessage({ type: "premium-calendar:resize", height: h }, "*");
    };
    const ro = new ResizeObserver(send);
    ro.observe(document.body);
    // El componente de Nylas cambia de alto dentro de su shadow DOM (al elegir día,
    // al pasar al formulario): el body lo refleja, pero por si acaso se revisa cada poco.
    const timer = window.setInterval(send, 800);
    send();
    return () => {
      ro.disconnect();
      window.clearInterval(timer);
    };
  }, []);
  return null;
}
