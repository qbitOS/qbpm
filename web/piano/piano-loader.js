/** Lazy-load piano-buddy panel into qbpm right panel */
let pianoMounted = false;

export async function ensurePianoPanel() {
  if (pianoMounted) return;
  const host = document.getElementById("piano-panel-body");
  if (!host) return;
  host.textContent = "loading piano…";
  const res = await fetch("/static/piano/panel.html", { cache: "no-store" });
  if (!res.ok) throw new Error(`piano panel: ${res.status}`);
  host.innerHTML = await res.text();
  const root = host.querySelector("#piano-panel-inner") || host.firstElementChild || host;
  const mod = await import("/static/piano/piano-app.js");
  mod.mountPianoPanel(root);
  pianoMounted = true;
}