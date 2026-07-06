/** grok_play shell — Theatre params + qbpm imagine bridge */

(function boot() {
  const status = document.getElementById("status");
  const out = document.getElementById("output-image");
  const ph = document.getElementById("ph");
  const notes = document.getElementById("notes");
  let sheet = null;
  let obj = null;

  function setStatus(t) {
    if (status) status.textContent = t;
  }

  function initTheatre() {
    const theatre = window.Theatre?.core || window.theatre;
    if (!theatre?.getProject) return;
    const project = theatre.getProject("QbpmGrokPlay");
    sheet = project.sheet("Image Parameters");
    obj = sheet.object("Style", { intensity: 60, surreal: 40, cinematic: 50 });
    obj.onValuesChange((v) => {
      document.getElementById("intensity").value = v.intensity;
      document.getElementById("surreal").value = v.surreal;
      document.getElementById("cinematic").value = v.cinematic;
      document.getElementById("v-int").textContent = Math.round(v.intensity);
      document.getElementById("v-sur").textContent = Math.round(v.surreal);
      document.getElementById("v-cin").textContent = Math.round(v.cinematic);
    });
  }

  function bindSliders() {
    const sync = (id, key, lbl) => {
      const el = document.getElementById(id);
      el?.addEventListener("input", () => {
        const v = Number(el.value);
        document.getElementById(lbl).textContent = v;
        obj?.set?.({ [key]: v });
      });
    };
    sync("intensity", "intensity", "v-int");
    sync("surreal", "surreal", "v-sur");
    sync("cinematic", "cinematic", "v-cin");
  }

  function switchTab(tab) {
    document.querySelectorAll(".nav button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.dataset.panel === tab));
  }

  async function generate() {
    const prompt = document.getElementById("prompt")?.value?.trim();
    if (!prompt) return;
    const params = obj?.value || { intensity: 60, surreal: 40, cinematic: 50 };
    const full = `${prompt} · intensity ${params.intensity} surreal ${params.surreal} cinematic ${params.cinematic}`;
    setStatus("generating…");
    try {
      if (window.parent?.grokTools?.inject) {
        await window.parent.grokTools.inject(`imagine ${full}`);
        setStatus("sent to grok terminal · check imagine API");
        return;
      }
      const api = window.parent?.QBPM_PAGES?.api?.("api/imagine/slug/custom") || "/api/imagine/slug/custom";
      const res = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: full }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const url = data?.url || data?.image;
      if (url) {
        out.src = url;
        out.style.display = "block";
        ph.style.display = "none";
      }
      const line = `[${new Date().toISOString()}] ${full}\n`;
      notes.value = (notes.value || "") + line;
      setStatus("done");
    } catch (err) {
      setStatus(`error: ${err.message}`);
    }
  }

  document.querySelectorAll(".nav button").forEach((b) => {
    b.addEventListener("click", () => switchTab(b.dataset.tab));
  });
  document.getElementById("btn-gen")?.addEventListener("click", () => void generate());
  document.getElementById("prompt")?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); void generate(); }
  });
  document.getElementById("btn-save-seq")?.addEventListener("click", () => {
    const v = obj?.value;
    if (!v) return;
    setStatus(`sequence keyframe · ${JSON.stringify(v)}`);
    try { sheet?.sequence?.play?.({ iterationCount: 1, range: [0, 2] }); } catch (_) { /* optional */ }
  });

  bindSliders();
  initTheatre();
  setStatus("ready · Ctrl+Enter generate");
})();