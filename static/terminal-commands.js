/** Grok / qbpm terminal command reference for inspector help */

export const TERMINAL_COMMAND_GROUPS = [
  {
    title: "graph",
    cmds: [
      { cmd: "run", desc: "Execute graph (topological run, updates viz log)" },
      { cmd: "save", desc: "Persist graph JSON to server" },
      { cmd: "graph", desc: "Print full graph JSON" },
      { cmd: "agent", desc: "Propose + apply agent diff (add node)" },
      { cmd: "clear", desc: "Clear terminal buffer" },
    ],
  },
  {
    title: "align · view",
    cmds: [
      { cmd: "align node", desc: "Center canvas on selected node" },
      { cmd: "align graph", desc: "Fit all nodes in view" },
    ],
  },
  {
    title: "nodes",
    cmds: [
      { cmd: "set code <id> <python…>", desc: "Set node source code" },
      { cmd: "inject node <id> <json>", desc: "Queue JSON inject on node data" },
    ],
  },
  {
    title: "prompt bar",
    cmds: [
      { cmd: "<watch URL>", desc: "Video ingest (yt-dlp) · opens video dock" },
      { cmd: "Fail-safe · strudel", desc: "Load Strudel project in () pane" },
      { cmd: "imagine <slug>", desc: "Fetch imagine preset prompt" },
      { cmd: "slug <name>", desc: "Alias for imagine slug lookup" },
      { cmd: "<query>", desc: "kbatch analyzer + grok inject" },
    ],
  },
  {
    title: "touchdesigner",
    cmds: [
      { cmd: "TD stream (∿ panel)", desc: "OSC-style viz → /api/td/ws · bloch/scope/eq/peaks" },
      { cmd: "/qbpm/bloch/theta", desc: "OSC address streamed from processing wing" },
      { cmd: "WebSocket DAT", desc: "ws://host/api/td/ws · JSON {type,address,args}" },
    ],
  },
  {
    title: "collab · canvas",
    cmds: [
      { cmd: "◎ peer chip", desc: "Hop to collaborator viewport / user frame" },
      { cmd: "shift+wire", desc: "Link node or frame comp ports" },
      { cmd: "send →", desc: "Music lab · target node / peer / broadcast" },
    ],
  },
  {
    title: "daw · audio tools",
    cmds: [
      { cmd: "DAW chips (music lab)", desc: "Link gridSound · openDAW · Zrythm · butterDAWg · generic-daw · TuneFlow · midimech" },
      { cmd: "click · dbl-click chip", desc: "Toggle link · open DAW repo" },
      { cmd: "send → daw:*", desc: "BroadcastChannel qbpm-daw-{id} · Web MIDI · TD OSC · live ingest" },
      { cmd: "∿ cap", desc: "Capture waveform snapshot JSON from analyser" },
      { cmd: "♪ tune", desc: "Standard autotune · quantize played pitch to nearest semitone" },
      { cmd: "a→midi", desc: "Audio → MIDI · YIN pitch detect · map to step grid" },
    ],
  },
  {
    title: "video pins",
    cmds: [
      { cmd: "top float bar", desc: "Moderator / musician 32×32 pins · drag ⠿ along header" },
      { cmd: "viz strip", desc: "Pinned placeholders when offline · live canvas snapshots when on-air" },
      { cmd: "click pin", desc: "Open video dock · hop to bound peer tile" },
    ],
  },
  {
    title: "shortcuts",
    cmds: [
      { cmd: "Space+drag", desc: "Pan canvas" },
      { cmd: "Ctrl/Cmd+Enter", desc: "Strudel play (in () pane)" },
      { cmd: "Enter", desc: "Prompt / chat send" },
    ],
  },
  {
    title: "API · inject",
    cmds: [
      { cmd: "window.grokTools.inject('run')", desc: "Programmatic terminal inject" },
      { cmd: "window.grokTools.runGraph()", desc: "Inject run" },
      { cmd: "window.grokTools.help()", desc: "Server help text" },
      { cmd: "window.qbpm.onTerminalCommand(line)", desc: "Local UI command hook" },
    ],
  },
];

export function mountInspectorCommandHelp(root = document.getElementById("insp-cmd-help-body")) {
  if (!root || root.dataset.mounted) return;
  root.dataset.mounted = "1";
  root.innerHTML = TERMINAL_COMMAND_GROUPS.map(
    (g) => `
    <div class="insp-cmd-group">
      <div class="insp-cmd-group-hd">${g.title}</div>
      <dl class="insp-cmd-list">
        ${g.cmds
          .map(
            (c) => `
          <dt><code>${c.cmd}</code></dt>
          <dd>${c.desc}</dd>`,
          )
          .join("")}
      </dl>
    </div>`,
  ).join("");
}