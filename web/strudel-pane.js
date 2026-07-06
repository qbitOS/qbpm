/** Strudel live code — load GitHub projects, strudel.cc, @strudel/web play */

import { ensureSamplesInCode, parseGithubRepo, samplesPrefixForProject } from "./strudel-samples.js";

const STRUDEL_WEB = "https://esm.sh/@strudel/web@1.3.0";
const FAILSAFE_RAW =
  "https://raw.githubusercontent.com/algorave-dave/Fail-safe/main/Fail-safe.js";
const FAILSAFE_REPO = "https://github.com/algorave-dave/Fail-safe";

const PRESETS = [
  {
    id: "failsafe",
    label: "Fail-safe",
    url: FAILSAFE_RAW,
    repo: FAILSAFE_REPO,
    samples: "github:algorave-dave/Fail-safe/samples",
  },
  {
    id: "demo",
    label: "demo",
    code: `setcps(0.5)
stack(
  s("bd*4").bank("RolandTR808").gain(0.9),
  s("~ sd").bank("RolandTR808").gain(0.7),
  n("c3 e3 g3").sound("piano").gain(0.35)
)`,
  },
];

function githubRawUrl(input) {
  const s = String(input || "").trim();
  if (!s) return null;
  if (s.includes("raw.githubusercontent.com")) return s.split("?")[0];
  const m = s.match(/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+?)(\?|$)/);
  if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}/${m[4]}`;
  const m2 = s.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (m2) return `https://raw.githubusercontent.com/${m2[1]}/${m2[2]}/main/${m2[2]}.js`;
  return null;
}

function strudelShareUrl(code) {
  if (typeof LZString !== "undefined" && LZString?.compressToEncodedURIComponent) {
    return `https://strudel.cc/#c${LZString.compressToEncodedURIComponent(code)}`;
  }
  return "https://strudel.cc/";
}

async function wrapSamples(code, samplesPath, repoUrl) {
  let out = code;
  if (repoUrl) {
    const prefix = await samplesPrefixForProject(repoUrl);
    out = ensureSamplesInCode(out, prefix);
  } else if (samplesPath && !out.includes(samplesPath)) {
    out = `samples('${samplesPath}')\n${out}`;
  }
  return out;
}

export function createStrudelPane(opts = {}) {
  const { onStatus, onJamEval, getBpm = () => 120 } = opts;

  let host = null;
  let strudelMod = null;
  let initPromise = null;
  let mode = "editor";
  let currentProject = null;
  let samplesReady = false;

  function setStatus(t) {
    onStatus?.(t);
    const el = host?.querySelector("#sp-status");
    if (el) el.textContent = t;
  }

  async function ensureStrudel() {
    if (strudelMod) return strudelMod;
    if (!initPromise) {
      initPromise = import(STRUDEL_WEB)
        .then(async (mod) => {
          await mod.initStrudel?.({ audioContext: true });
          strudelMod = mod;
          return mod;
        })
        .catch((err) => {
          initPromise = null;
          throw err;
        });
    }
    return initPromise;
  }

  function getCode() {
    return host?.querySelector("#sp-code")?.value || "";
  }

  function setCode(code) {
    const ta = host?.querySelector("#sp-code");
    if (ta) ta.value = code;
  }

  function setMode(next) {
    mode = next;
    const editor = host?.querySelector(".sp-editor-wrap");
    const frame = host?.querySelector(".sp-iframe-wrap");
    host?.querySelector("#sp-mode-editor")?.classList.toggle("active", mode === "editor");
    host?.querySelector("#sp-mode-repl")?.classList.toggle("active", mode === "repl");
    if (editor) editor.style.display = mode === "editor" ? "flex" : "none";
    if (frame) frame.style.display = mode === "repl" ? "block" : "none";
  }

  function openInStrudel(code) {
    const url = strudelShareUrl(code || getCode());
    window.open(url, "_blank", "noopener");
    setStatus("opened strudel.cc");
  }

  async function fetchProject(url) {
    const raw = githubRawUrl(url) || url;
    const res = await fetch(raw);
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    return { code: await res.text(), url: raw };
  }

  async function loadPreset(preset) {
    if (preset.code) {
      setCode(preset.code);
      currentProject = { name: preset.label, url: null };
      setStatus(`loaded · ${preset.label}`);
      return preset.code;
    }
    if (preset.url) {
      const { code, url } = await fetchProject(preset.url);
      const repoUrl = preset.repo || FAILSAFE_REPO;
      const wrapped = await wrapSamples(code, preset.samples, repoUrl);
      setCode(wrapped);
      currentProject = { name: preset.label, url, repo: repoUrl };
      samplesReady = false;
      setStatus(`loaded · ${preset.label}`);
      return wrapped;
    }
    return "";
  }

  async function loadFrom(urlOrText) {
    if (!host) return;
    const raw = String(urlOrText || "").trim();
    if (!raw) return;
    const inp = host.querySelector("#sp-url");
    if (inp) inp.value = raw;
    if (raw.includes("strudel.cc") || raw.includes("github.com") || raw.startsWith("http")) {
      return loadFromInput();
    }
    setCode(raw);
    currentProject = { name: "paste", url: null };
    setStatus("pasted · code");
    return raw;
  }

  async function playCode(code) {
    if (code) setCode(code);
    return play();
  }

  async function loadFromInput() {
    const raw = host?.querySelector("#sp-url")?.value?.trim();
    if (!raw) return;
    if (raw.includes("strudel.cc")) {
      setMode("repl");
      const iframe = host?.querySelector("#sp-iframe");
      if (iframe) iframe.src = raw;
      setStatus("strudel.cc repl");
      return;
    }
    const url = githubRawUrl(raw) || raw;
    const { code } = await fetchProject(url);
    const parsed = parseGithubRepo(raw);
    const repoUrl = parsed ? `https://github.com/${parsed.owner}/${parsed.repo}` : null;
    const wrapped = await wrapSamples(code, null, repoUrl);
    setCode(wrapped);
    currentProject = { name: url.split("/").pop(), url, repo: repoUrl };
    samplesReady = false;
    setStatus(`loaded · ${currentProject.name}`);
  }

  async function prepareCode(code) {
    let prepared = code.trim();
    if (currentProject?.repo && !samplesReady) {
      setStatus("loading samples…");
      const prefix = await samplesPrefixForProject(currentProject.repo);
      prepared = ensureSamplesInCode(prepared, prefix);
      setCode(prepared);
      samplesReady = true;
    }
    return prepared;
  }

  async function play() {
    let code = getCode().trim();
    if (!code) return;
    setStatus("init…");
    try {
      const mod = await ensureStrudel();
      const ctx = mod.webaudio?.getAudioContext?.() || mod.getAudioContext?.();
      if (ctx?.state === "suspended") await ctx.resume();

      code = await prepareCode(code);
      setStatus("playing…");
      mod.hush?.();
      await mod.evaluate?.(code);
      onJamEval?.(code, getBpm());
      host?.querySelector("#sp-play")?.classList.add("active");
      setStatus(`live · ${currentProject?.name || "pattern"}`);
    } catch (err) {
      console.warn("strudel eval:", err);
      setStatus(`eval: ${err.message || err}`);
      setMode("repl");
      const iframe = host?.querySelector("#sp-iframe");
      if (iframe) iframe.src = strudelShareUrl(code);
      setStatus("fallback → strudel.cc repl");
    }
  }

  async function loadAndPlay(urlOrPreset) {
    if (typeof urlOrPreset === "object" && urlOrPreset?.id) {
      await loadPreset(urlOrPreset);
    } else {
      await loadFrom(urlOrPreset);
    }
    return play();
  }

  async function stop() {
    try {
      const mod = await ensureStrudel();
      mod.hush?.();
    } catch (_) {}
    host?.querySelector("#sp-play")?.classList.remove("active");
    setStatus("stopped");
  }

  function mount(root) {
    if (!root || root.querySelector(".strudel-pane")) return;
    host = root;
    host.innerHTML = `
      <div class="strudel-pane">
        <div class="sp-toolbar qb-btn-group">
          <button type="button" class="qb-btn qb-btn--play qb-btn--icon" id="sp-play" title="Play pattern">▶</button>
          <button type="button" class="qb-btn qb-btn--stop qb-btn--icon" id="sp-stop" title="Stop">■</button>
          <button type="button" class="qb-btn qb-btn--accent qb-btn--sm" id="sp-open" title="Open in strudel.cc">strudel.cc</button>
          <button type="button" class="qb-btn qb-btn--sm" id="sp-mode-editor" title="Code editor">code</button>
          <button type="button" class="qb-btn qb-btn--sm" id="sp-mode-repl" title="Embedded REPL">repl</button>
        </div>
        <div class="sp-presets qb-btn-group" id="sp-presets"></div>
        <div class="sp-load-row">
          <input id="sp-url" class="sp-url" type="text" placeholder="GitHub repo · raw .js · strudel.cc URL" spellcheck="false" autocomplete="off" />
          <button type="button" class="qb-btn qb-btn--sm" id="sp-load">load</button>
        </div>
        <pre class="sp-status" id="sp-status">strudel · load or play</pre>
        <div class="sp-editor-wrap">
          <textarea id="sp-code" class="sp-code" spellcheck="false" autocomplete="off" aria-label="Strudel code">${PRESETS[1].code}</textarea>
        </div>
        <div class="sp-iframe-wrap" style="display:none">
          <iframe id="sp-iframe" class="sp-iframe" title="Strudel REPL" src="https://strudel.cc/" allow="midi; microphone; autoplay"></iframe>
        </div>
      </div>`;

    const presetsEl = host.querySelector("#sp-presets");
    PRESETS.forEach((p) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "qb-chip";
      b.textContent = p.label;
      b.title = p.url || p.id;
      b.addEventListener("click", () =>
        loadPreset(p)
          .then(() => play())
          .catch((e) => setStatus(String(e.message || e))),
      );
      presetsEl.appendChild(b);
    });

    host.querySelector("#sp-play")?.addEventListener("click", () => play());
    host.querySelector("#sp-stop")?.addEventListener("click", () => stop());
    host.querySelector("#sp-open")?.addEventListener("click", () => openInStrudel());
    host.querySelector("#sp-load")?.addEventListener("click", () => loadFromInput().catch((e) => setStatus(String(e.message || e))));
    host.querySelector("#sp-url")?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        loadFromInput().catch((e) => setStatus(String(e.message || e)));
      }
    });
    host.querySelector("#sp-mode-editor")?.addEventListener("click", () => setMode("editor"));
    host.querySelector("#sp-mode-repl")?.addEventListener("click", () => {
      setMode("repl");
      const iframe = host.querySelector("#sp-iframe");
      if (iframe && (!iframe.src || iframe.src === "about:blank")) {
        iframe.src = strudelShareUrl(getCode());
      }
    });
    host.querySelector("#sp-code")?.addEventListener("keydown", (ev) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") {
        ev.preventDefault();
        play();
      }
    });

    setMode("editor");
  }

  function getState() {
    return { code: getCode(), project: currentProject, mode };
  }

  function setState(s) {
    if (!s) return;
    if (s.code) setCode(s.code);
    if (s.mode) setMode(s.mode);
    if (s.project) currentProject = s.project;
  }

  function destroy() {
    stop();
    strudelMod = null;
    initPromise = null;
    host = null;
  }

  return {
    mount,
    play,
    stop,
    playCode,
    loadPreset,
    loadFrom,
    loadAndPlay,
    loadFromInput,
    openInStrudel,
    getState,
    setState,
    getCode,
    setCode,
    destroy,
    FAILSAFE_REPO,
  };
}

export function isStrudelUrl(text) {
  const s = String(text || "").trim().toLowerCase();
  return (
    s.includes("strudel.cc") ||
    s.includes("github.com") && (s.endsWith(".js") || s.includes("/blob/") || /github\.com\/[^/]+\/[^/]+\/?$/.test(s))
  );
}