export const CATEGORIES = {
  central: {
    label: "Sujet central",
    short: "Central",
    icon: "★",
    color: "#1f2933",
    fill: "#1f2933",
    text: "#ffffff",
    border: "#1f2933"
  },
  commun: {
    label: "Point commun",
    short: "Commun",
    icon: "◆",
    color: "#2f6f6a",
    fill: "#e6f0ee",
    text: "#173b38",
    border: "#2f6f6a"
  },
  urss: {
    label: "URSS de Staline",
    short: "URSS",
    icon: "●",
    color: "#9b3d3d",
    fill: "#f6e7e5",
    text: "#4a1f1f",
    border: "#9b3d3d"
  },
  allemagne: {
    label: "Allemagne nazie",
    short: "Allemagne",
    icon: "■",
    color: "#3d4f6b",
    fill: "#e8ecf3",
    text: "#1f2a3a",
    border: "#3d4f6b"
  },
  preuve: {
    label: "Preuve / source",
    short: "Preuve",
    icon: "▲",
    color: "#8a6a2f",
    fill: "#f5eeda",
    text: "#3f2f12",
    border: "#8a6a2f"
  },
  nuance: {
    label: "À vérifier / à nuancer (propagande)",
    short: "À nuancer",
    icon: "?",
    color: "#6b5b7a",
    fill: "#efeaf3",
    text: "#352d3d",
    border: "#6b5b7a"
  }
};

export const SHAPES = [
  { id: "rounded", label: "Arrondi" },
  { id: "rect", label: "Rectangle" },
  { id: "ellipse", label: "Ellipse" }
];

const WORLD_W = 8000;
const WORLD_H = 6000;
const MAX_HISTORY = 60;

let els = null;
let state = { nodes: [], links: [], view: { x: 0, y: 0, s: 1 } };
let onChange = () => {};
let isActive = () => true;
let selectedNodeId = null;
let selectedLinkId = null;
let linkFrom = null;
let undoStack = [];
let redoStack = [];
let pan = null;
let drag = null;
let statusTimer = null;

function uid(prefix) {
  return prefix + "-" + Math.random().toString(36).slice(2, 9) + "-" + Date.now().toString(36).slice(-4);
}

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escXml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isTyping() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function defaultSize(category, shape) {
  if (category === "central") return { w: 270, h: 124 };
  if (shape === "ellipse") return { w: 224, h: 112 };
  return { w: 214, h: 98 };
}

function normalize(data) {
  const nodes = Array.isArray(data && data.nodes)
    ? data.nodes
        .filter((n) => n && n.id)
        .map((n) => {
          const category = CATEGORIES[n.category] ? n.category : "commun";
          const shape = SHAPES.some((s) => s.id === n.shape) ? n.shape : "rounded";
          const size = defaultSize(category, shape);
          return {
            id: String(n.id),
            title: String(n.title || "Idée"),
            category,
            shape,
            x: Number.isFinite(n.x) ? n.x : 3600,
            y: Number.isFinite(n.y) ? n.y : 2800,
            w: Number.isFinite(n.w) ? n.w : size.w,
            h: Number.isFinite(n.h) ? n.h : size.h,
            note: String(n.note || ""),
            source: String(n.source || ""),
            sourceUrl: String(n.sourceUrl || "")
          };
        })
    : [];
  const ids = new Set(nodes.map((n) => n.id));
  const links = Array.isArray(data && data.links)
    ? data.links
        .filter((l) => l && l.from && l.to && l.from !== l.to && ids.has(l.from) && ids.has(l.to))
        .map((l) => ({
          id: String(l.id || uid("l")),
          from: String(l.from),
          to: String(l.to),
          label: String(l.label || "")
        }))
    : [];
  const view =
    data && data.view && Number.isFinite(data.view.x) && Number.isFinite(data.view.y) && Number.isFinite(data.view.s)
      ? { x: data.view.x, y: data.view.y, s: clamp(data.view.s, 0.2, 2.6) }
      : { x: 0, y: 0, s: 1 };
  return { nodes, links, view };
}

function nodeById(id) {
  return state.nodes.find((n) => n.id === id) || null;
}

function serializeMap() {
  return {
    nodes: state.nodes.map((n) => ({ ...n })),
    links: state.links.map((l) => ({ ...l }))
  };
}

function pushHistory() {
  const snapshot = JSON.stringify(serializeMap());
  if (undoStack.length && undoStack[undoStack.length - 1] === snapshot) return;
  undoStack.push(snapshot);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack = [];
}

function restoreSnapshot(snapshot) {
  const parsed = JSON.parse(snapshot);
  state.nodes = parsed.nodes;
  state.links = parsed.links;
  selectedNodeId = null;
  selectedLinkId = null;
  linkFrom = null;
  render();
  notify();
}

export function undo() {
  if (!undoStack.length) {
    setStatus("Rien à annuler.");
    return;
  }
  redoStack.push(JSON.stringify(serializeMap()));
  restoreSnapshot(undoStack.pop());
  setStatus("Action annulée.");
}

export function redo() {
  if (!redoStack.length) {
    setStatus("Rien à rétablir.");
    return;
  }
  undoStack.push(JSON.stringify(serializeMap()));
  restoreSnapshot(redoStack.pop());
  setStatus("Action rétablie.");
}

function notify() {
  onChange(getMapData());
}

function setStatus(message) {
  if (!els || !els.status) return;
  els.status.textContent = message;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    if (els && els.status) els.status.textContent = "";
  }, 5000);
}

function centerOfViewport() {
  const rect = els.viewport.getBoundingClientRect();
  return {
    vx: rect.width / 2,
    vy: rect.height / 2,
    wx: (rect.width / 2 - state.view.x) / state.view.s,
    wy: (rect.height / 2 - state.view.y) / state.view.s
  };
}

function applyTransform() {
  els.world.style.transform = `translate(${state.view.x}px, ${state.view.y}px) scale(${state.view.s})`;
}

function bounds() {
  if (!state.nodes.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of state.nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.w);
    maxY = Math.max(maxY, n.y + n.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function fitView() {
  const b = bounds();
  const vw = els.viewport.clientWidth || 900;
  const vh = els.viewport.clientHeight || 560;
  if (!b) {
    state.view = { x: 0, y: 0, s: 1 };
    applyTransform();
    return;
  }
  const pad = 44;
  const s = clamp(Math.min((vw - pad * 2) / b.w, (vh - pad * 2) / b.h), 0.22, 1.15);
  state.view = {
    x: (vw - b.w * s) / 2 - b.x * s,
    y: (vh - b.h * s) / 2 - b.y * s,
    s
  };
  applyTransform();
  notify();
}

function zoomAt(px, py, factor) {
  const old = state.view.s;
  const next = clamp(old * factor, 0.2, 2.6);
  if (next === old) return;
  state.view.x = px - ((px - state.view.x) * next) / old;
  state.view.y = py - ((py - state.view.y) * next) / old;
  state.view.s = next;
  applyTransform();
  notify();
}

export function zoomIn() {
  const c = centerOfViewport();
  zoomAt(c.vx, c.vy, 1.18);
}

export function zoomOut() {
  const c = centerOfViewport();
  zoomAt(c.vx, c.vy, 0.85);
}

export function centerOnCentral(scale = 0.85) {
  const central = state.nodes.find((n) => n.category === "central") || state.nodes[0];
  if (!central || !els) return;
  const rect = els.viewport.getBoundingClientRect();
  state.view.s = clamp(scale, 0.2, 2.6);
  state.view.x = rect.width / 2 - (central.x + central.w / 2) * state.view.s;
  state.view.y = rect.height / 2 - (central.y + central.h / 2) * state.view.s;
  applyTransform();
  notify();
}

export function resetView() {
  fitView();
  setStatus("Vue ajustée à la carte.");
}

function render() {
  applyTransform();
  renderLinks();
  renderNodes();
  renderInspector();
  renderOutline();
}

function renderNodes() {
  els.nodes.innerHTML = "";
  for (const node of state.nodes) {
    const cat = CATEGORIES[node.category] || CATEGORIES.commun;
    const el = document.createElement("div");
    el.className = `map-node cat-${node.category} shape-${node.shape}`;
    if (node.category === "central") el.classList.add("is-central");
    if (node.id === selectedNodeId) el.classList.add("is-selected");
    if (node.id === linkFrom) el.classList.add("is-link-from");
    el.style.left = node.x + "px";
    el.style.top = node.y + "px";
    el.style.width = node.w + "px";
    el.style.height = node.h + "px";
    el.dataset.id = node.id;
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.setAttribute(
      "aria-label",
      `${cat.label} : ${node.title}${node.source ? ". Source indiquée." : ""}${node.note ? ". Note présente." : ""}`
    );
    el.innerHTML = `<span class="map-node-badge">${esc(cat.icon)} ${esc(cat.short)}</span><span class="map-node-title">${esc(node.title)}</span>${node.source ? '<span class="map-node-source">source</span>' : ""}`;

    el.addEventListener("pointerdown", (event) => startNodeDrag(event, node, el));
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      if (el.dataset.dragged === "1") {
        el.dataset.dragged = "0";
        return;
      }
      if (linkFrom) {
        finishLink(node.id);
      } else {
        selectNode(node.id);
      }
    });
    el.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      selectNode(node.id);
      const input = els.inspector.querySelector('[data-field="title"]');
      if (input) input.focus();
    });
    el.addEventListener("keydown", (event) => handleNodeKeydown(event, node));
    els.nodes.appendChild(el);
  }
}

function handleNodeKeydown(event, node) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    if (linkFrom) finishLink(node.id);
    else selectNode(node.id, true);
    return;
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    deleteNode(node.id);
    return;
  }
  if (event.key.toLowerCase() === "l") {
    event.preventDefault();
    startLink();
    return;
  }
  if (event.key === "Escape") {
    linkFrom = null;
    render();
    return;
  }
  const step = event.shiftKey ? 1 : 12;
  const moves = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step]
  };
  if (moves[event.key]) {
    event.preventDefault();
    pushHistory();
    node.x = clamp(node.x + moves[event.key][0], 0, WORLD_W - node.w);
    node.y = clamp(node.y + moves[event.key][1], 0, WORLD_H - node.h);
    renderNodes();
    renderLinks();
    notify();
    setStatus("Nœud déplacé au clavier.");
  }
}

function startNodeDrag(event, node, el) {
  if (event.button !== 0) return;
  if (event.target.closest("button")) return;
  event.stopPropagation();
  const start = { x: event.clientX, y: event.clientY, nx: node.x, ny: node.y };
  const before = JSON.stringify(serializeMap());
  let moved = false;
  el.dataset.dragged = "0";

  function move(ev) {
    const dx = (ev.clientX - start.x) / state.view.s;
    const dy = (ev.clientY - start.y) / state.view.s;
    if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
    node.x = clamp(Math.round(start.nx + dx), 0, WORLD_W - node.w);
    node.y = clamp(Math.round(start.ny + dy), 0, WORLD_H - node.h);
    el.style.left = node.x + "px";
    el.style.top = node.y + "px";
    renderLinks();
  }

  function up() {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    if (moved) {
      el.dataset.dragged = "1";
      setTimeout(() => {
        if (el.isConnected) el.dataset.dragged = "0";
      }, 300);
      const after = JSON.stringify(serializeMap());
      if (after !== before) {
        undoStack.push(before);
        if (undoStack.length > MAX_HISTORY) undoStack.shift();
        redoStack = [];
        selectedNodeId = node.id;
        selectedLinkId = null;
        renderNodes();
        renderInspector();
        notify();
        setStatus("Nœud déplacé.");
      }
    }
  }

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function renderLinks() {
  const parts = [];
  for (const link of state.links) {
    const a = nodeById(link.from);
    const b = nodeById(link.to);
    if (!a || !b) continue;
    const x1 = a.x + a.w / 2;
    const y1 = a.y + a.h / 2;
    const x2 = b.x + b.w / 2;
    const y2 = b.y + b.h / 2;
    const dx = Math.max(55, Math.abs(x2 - x1) * 0.45);
    const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
    const label = link.label
      ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 8}" class="link-label" text-anchor="middle">${escXml(link.label)}</text>`
      : "";
    parts.push(
      `<g class="link-group ${link.id === selectedLinkId ? "is-selected" : ""}">` +
        `<path class="link-hit" d="${d}" data-link-id="${esc(link.id)}" tabindex="0" role="button" aria-label="Lien de ${esc(a.title)} vers ${esc(b.title)}${link.label ? " : " + esc(link.label) : ""}"></path>` +
        `<path class="link-line" d="${d}"></path>` +
        label +
        `</g>`
    );
  }
  els.links.innerHTML = parts.join("");
}

function selectNode(id, focusInspector) {
  selectedNodeId = id;
  selectedLinkId = null;
  linkFrom = null;
  render();
  if (focusInspector) {
    const input = els.inspector.querySelector('[data-field="title"]');
    if (input) input.focus();
  }
}

function selectLink(id) {
  selectedLinkId = id;
  selectedNodeId = null;
  linkFrom = null;
  renderLinks();
  renderInspector();
  renderNodes();
}

export function clearSelection() {
  selectedNodeId = null;
  selectedLinkId = null;
  linkFrom = null;
  render();
}

export function startLink() {
  if (!selectedNodeId) {
    setStatus("Sélectionne d'abord un nœud de départ.");
    return;
  }
  linkFrom = selectedNodeId;
  renderNodes();
  renderInspector();
  setStatus("Choisis maintenant le nœud d'arrivée.");
}

function finishLink(toId) {
  if (!linkFrom || linkFrom === toId) {
    linkFrom = null;
    render();
    return;
  }
  const exists = state.links.some(
    (l) => (l.from === linkFrom && l.to === toId) || (l.from === toId && l.to === linkFrom)
  );
  if (exists) {
    setStatus("Ces deux nœuds sont déjà reliés.");
    linkFrom = null;
    render();
    return;
  }
  pushHistory();
  const link = { id: uid("l"), from: linkFrom, to: toId, label: "" };
  state.links.push(link);
  linkFrom = null;
  selectedLinkId = link.id;
  selectedNodeId = null;
  render();
  notify();
  setStatus("Lien créé. Tu peux ajouter un libellé dans le panneau de droite.");
}

function renderInspector() {
  const node = selectedNodeId ? nodeById(selectedNodeId) : null;
  if (node) {
    const catOptions = Object.entries(CATEGORIES)
      .map(
        ([id, cat]) =>
          `<option value="${esc(id)}" ${node.category === id ? "selected" : ""}>${esc(cat.icon)} ${esc(cat.label)}</option>`
      )
      .join("");
    const shapeOptions = SHAPES.map(
      (s) => `<option value="${esc(s.id)}" ${node.shape === s.id ? "selected" : ""}>${esc(s.label)}</option>`
    ).join("");
    els.inspector.innerHTML = `
      <div class="inspector-head">
        <h3>Modifier le nœud</h3>
        <button type="button" class="icon-button" data-action="close-inspector" aria-label="Fermer le panneau">×</button>
      </div>
      <label class="field">
        <span>Idée principale</span>
        <input type="text" data-field="title" value="${esc(node.title)}" maxlength="90" />
      </label>
      <div class="field-row">
        <label class="field">
          <span>Catégorie</span>
          <select data-field="category">${catOptions}</select>
        </label>
        <label class="field">
          <span>Forme</span>
          <select data-field="shape">${shapeOptions}</select>
        </label>
      </div>
      <label class="field">
        <span>Note (facultative)</span>
        <textarea data-field="note" rows="3" maxlength="500" placeholder="Un exemple, une explication...">${esc(node.note)}</textarea>
      </label>
      <label class="field">
        <span>Source (dossier, page, document)</span>
        <input type="text" data-field="source" value="${esc(node.source)}" maxlength="160" placeholder="Ex. : Dossier 2, Le Reichstag" />
      </label>
      <label class="field">
        <span>Lien vers la source (facultatif)</span>
        <input type="url" data-field="sourceUrl" value="${esc(node.sourceUrl)}" maxlength="500" placeholder="https://..." />
      </label>
      <div class="inspector-actions">
        <button type="button" class="button secondary" data-action="start-link">Relier ce nœud</button>
        <button type="button" class="button danger" data-action="delete-node">Supprimer</button>
      </div>
      <p class="hint">Glisse un nœud pour le déplacer. Utilise « Relier ce nœud » pour créer un lien.</p>
    `;
    return;
  }

  const link = selectedLinkId ? state.links.find((l) => l.id === selectedLinkId) : null;
  if (link) {
    const a = nodeById(link.from);
    const b = nodeById(link.to);
    els.inspector.innerHTML = `
      <div class="inspector-head">
        <h3>Modifier le lien</h3>
        <button type="button" class="icon-button" data-action="close-inspector" aria-label="Fermer le panneau">×</button>
      </div>
      <p class="muted">${esc(a ? a.title : "?")} → ${esc(b ? b.title : "?")}</p>
      <label class="field">
        <span>Libellé (facultatif)</span>
        <input type="text" data-link-field="label" value="${esc(link.label)}" maxlength="60" placeholder="Ex. : même méthode" />
      </label>
      <div class="inspector-actions">
        <button type="button" class="button danger" data-action="delete-link">Supprimer le lien</button>
      </div>
    `;
    return;
  }

  const legend = Object.entries(CATEGORIES)
    .map(
      ([id, cat]) =>
        `<li><span class="legend-swatch cat-${id}" aria-hidden="true">${esc(cat.icon)}</span><span>${esc(cat.label)}</span></li>`
    )
    .join("");
  els.inspector.innerHTML = `
    <div class="inspector-head"><h3>Repères</h3></div>
    <p class="muted">Sélectionne un nœud pour le modifier, ou un lien pour changer son libellé.</p>
    <ul class="legend-list">${legend}</ul>
    <div class="inspector-actions">
      <button type="button" class="button secondary" data-action="add-node">Ajouter un nœud</button>
      <button type="button" class="button ghost" data-action="fit">Ajuster la vue</button>
    </div>
    <p class="hint">Glisse le fond pour déplacer. Utilise les boutons + / − pour zoomer.</p>
  `;
}

function renderOutline() {
  if (!els.outline) return;
  if (!state.nodes.length) {
    els.outline.innerHTML = `<p class="muted">La carte est vide. Ajoute un nœud ou choisis un modèle.</p>`;
    return;
  }
  const groups = ["central", "commun", "urss", "allemagne", "preuve", "nuance"];
  const blocks = groups
    .map((catId) => {
      const nodes = state.nodes.filter((n) => n.category === catId);
      if (!nodes.length) return "";
      const items = nodes
        .map((n) => {
          const src = n.source ? `<span class="outline-source">source</span>` : "";
          return `<li>
            <button type="button" class="outline-node" data-outline-action="select" data-id="${esc(n.id)}">${esc(n.title)}</button>
            ${src}
            <button type="button" class="outline-mini" data-outline-action="link" data-id="${esc(n.id)}" aria-label="Relier ${esc(n.title)}">Relier</button>
            <button type="button" class="outline-mini danger-text" data-outline-action="delete" data-id="${esc(n.id)}" aria-label="Supprimer ${esc(n.title)}">Suppr.</button>
          </li>`;
        })
        .join("");
      return `<div class="outline-group"><h4>${esc(CATEGORIES[catId].icon)} ${esc(CATEGORIES[catId].label)} <span>${nodes.length}</span></h4><ul>${items}</ul></div>`;
    })
    .join("");
  const links = state.links.length
    ? `<div class="outline-group"><h4>Liens <span>${state.links.length}</span></h4><ul>${state.links
        .map((l) => {
          const a = nodeById(l.from);
          const b = nodeById(l.to);
          return `<li><span class="outline-link">${esc(a ? a.title : "?")} → ${esc(b ? b.title : "?")}${l.label ? " (" + esc(l.label) + ")" : ""}</span><button type="button" class="outline-mini danger-text" data-outline-action="delete-link" data-id="${esc(l.id)}">Suppr.</button></li>`;
        })
        .join("")}</ul></div>`
    : "";
  els.outline.innerHTML = blocks + links;
}

function updateNodeField(field, value) {
  const node = nodeById(selectedNodeId);
  if (!node) return;
  if (field === "category") {
    pushHistory();
    if (value === "central") {
      state.nodes.forEach((n) => {
        if (n.category === "central" && n.id !== node.id) n.category = "commun";
      });
    }
    node.category = CATEGORIES[value] ? value : "commun";
    const size = defaultSize(node.category, node.shape);
    node.w = size.w;
    node.h = size.h;
    render();
    notify();
    return;
  }
  if (field === "shape") {
    pushHistory();
    node.shape = SHAPES.some((s) => s.id === value) ? value : "rounded";
    const size = defaultSize(node.category, node.shape);
    node.w = size.w;
    node.h = size.h;
    render();
    notify();
    return;
  }
  node[field] = value;
  if (field === "title" || field === "source") {
    renderNodes();
    renderLinks();
    renderOutline();
  }
  notify();
}

function findFreeSpot(w, h) {
  const c = centerOfViewport();
  const baseX = c.wx - w / 2;
  const baseY = c.wy - h / 2;
  const offsets = [
    [0, 0],
    [280, 0],
    [-280, 0],
    [0, 170],
    [0, -170],
    [280, 170],
    [280, -170],
    [-280, 170],
    [-280, -170],
    [420, 0],
    [-420, 0],
    [0, 260],
    [0, -260]
  ];
  for (const [dx, dy] of offsets) {
    const x = clamp(Math.round(baseX + dx), 0, WORLD_W - w);
    const y = clamp(Math.round(baseY + dy), 0, WORLD_H - h);
    const overlaps = state.nodes.some(
      (n) => x < n.x + n.w + 18 && x + w + 18 > n.x && y < n.y + n.h + 18 && y + h + 18 > n.y
    );
    if (!overlaps) return { x, y };
  }
  return {
    x: clamp(Math.round(baseX + 520), 0, WORLD_W - w),
    y: clamp(Math.round(baseY + 260), 0, WORLD_H - h)
  };
}

export function addNode() {
  pushHistory();
  const size = defaultSize("commun", "rounded");
  const spot = findFreeSpot(size.w, size.h);
  const node = {
    id: uid("n"),
    title: "Nouvelle idée",
    category: "commun",
    shape: "rounded",
    x: spot.x,
    y: spot.y,
    w: size.w,
    h: size.h,
    note: "",
    source: "",
    sourceUrl: ""
  };
  state.nodes.push(node);
  selectNode(node.id, true);
  notify();
  setStatus("Nœud ajouté. Modifie son titre dans le panneau de droite.");
}

function deleteNode(id) {
  const node = nodeById(id);
  if (!node) return;
  const isCentral = node.category === "central";
  const message = isCentral
    ? "Supprimer le sujet central ? La carte perdra son point de départ."
    : `Supprimer « ${node.title} » ?`;
  if (!window.confirm(message)) return;
  pushHistory();
  state.nodes = state.nodes.filter((n) => n.id !== id);
  state.links = state.links.filter((l) => l.from !== id && l.to !== id);
  if (selectedNodeId === id) selectedNodeId = null;
  if (linkFrom === id) linkFrom = null;
  render();
  notify();
  setStatus("Nœud supprimé.");
}

function deleteLink(id) {
  if (!window.confirm("Supprimer ce lien ?")) return;
  pushHistory();
  state.links = state.links.filter((l) => l.id !== id);
  if (selectedLinkId === id) selectedLinkId = null;
  render();
  notify();
  setStatus("Lien supprimé.");
}

export function initMap(options) {
  els = options;
  onChange = options.onChange || (() => {});
  isActive = options.isActive || (() => true);
  state = normalize(options.data || { nodes: [], links: [], view: { x: 0, y: 0, s: 1 } });
  undoStack = [];
  redoStack = [];
  selectedNodeId = null;
  selectedLinkId = null;
  linkFrom = null;

  els.links.setAttribute("width", WORLD_W);
  els.links.setAttribute("height", WORLD_H);
  els.links.setAttribute("viewBox", `0 0 ${WORLD_W} ${WORLD_H}`);
  els.world.style.width = WORLD_W + "px";
  els.world.style.height = WORLD_H + "px";

  els.viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (event.target.closest(".map-node") || event.target.closest("button") || event.target.closest("a")) return;
    pan = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      vx: state.view.x,
      vy: state.view.y,
      moved: false
    };
    els.viewport.setPointerCapture(event.pointerId);
    els.viewport.classList.add("is-panning");
  });

  els.viewport.addEventListener("pointermove", (event) => {
    if (!pan || event.pointerId !== pan.id) return;
    const dx = event.clientX - pan.x;
    const dy = event.clientY - pan.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) pan.moved = true;
    state.view.x = pan.vx + dx;
    state.view.y = pan.vy + dy;
    applyTransform();
  });

  function endPan(event) {
    if (!pan || event.pointerId !== pan.id) return;
    const moved = pan.moved;
    pan = null;
    els.viewport.classList.remove("is-panning");
    if (!moved) {
      selectedNodeId = null;
      selectedLinkId = null;
      linkFrom = null;
      render();
    }
    notify();
  }
  els.viewport.addEventListener("pointerup", endPan);
  els.viewport.addEventListener("pointercancel", endPan);

  els.viewport.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const rect = els.viewport.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const factor = event.deltaY < 0 ? 1.12 : 0.89;
      zoomAt(px, py, factor);
    },
    { passive: false }
  );

  els.viewport.addEventListener("keydown", (event) => {
    if (isTyping()) return;
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomIn();
    } else if (event.key === "-") {
      event.preventDefault();
      zoomOut();
    } else if (event.key === "0") {
      event.preventDefault();
      fitView();
    } else if (event.key === "Escape") {
      linkFrom = null;
      selectedNodeId = null;
      selectedLinkId = null;
      render();
    }
  });

  els.links.addEventListener("click", (event) => {
    const hit = event.target.closest("[data-link-id]");
    if (hit) selectLink(hit.dataset.linkId);
  });
  els.links.addEventListener("keydown", (event) => {
    const hit = event.target.closest("[data-link-id]");
    if (hit && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      selectLink(hit.dataset.linkId);
    }
  });

  els.inspector.addEventListener("input", (event) => {
    const field = event.target.dataset.field;
    if (field) {
      updateNodeField(field, event.target.value);
      return;
    }
    const linkField = event.target.dataset.linkField;
    if (linkField === "label") {
      const link = state.links.find((l) => l.id === selectedLinkId);
      if (link) {
        link.label = event.target.value;
        renderLinks();
        renderOutline();
        notify();
      }
    }
  });

  els.inspector.addEventListener("change", (event) => {
    const field = event.target.dataset.field;
    if (field) updateNodeField(field, event.target.value);
  });

  els.inspector.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "start-link") startLink();
    if (action === "delete-node") deleteNode(selectedNodeId);
    if (action === "delete-link") deleteLink(selectedLinkId);
    if (action === "close-inspector") clearSelection();
    if (action === "add-node") addNode();
    if (action === "fit") fitView();
  });

  els.outline.addEventListener("click", (event) => {
    const button = event.target.closest("[data-outline-action]");
    if (!button) return;
    const action = button.dataset.outlineAction;
    const id = button.dataset.id;
    if (action === "select") selectNode(id);
    if (action === "delete") deleteNode(id);
    if (action === "delete-link") deleteLink(id);
    if (action === "link") {
      selectNode(id);
      startLink();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (!isActive() || isTyping()) return;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    } else if (mod && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
    }
  });

  render();
  requestAnimationFrame(() => fitView());
}

export function setMapData(data) {
  state = normalize(data);
  undoStack = [];
  redoStack = [];
  selectedNodeId = null;
  selectedLinkId = null;
  linkFrom = null;
  render();
  requestAnimationFrame(() => fitView());
}

export function getMapData() {
  return {
    nodes: state.nodes.map((n) => ({ ...n })),
    links: state.links.map((l) => ({ ...l })),
    view: { ...state.view }
  };
}

export function applyTemplate(name) {
  if (state.nodes.length && !window.confirm("Remplacer la carte actuelle par ce modèle ?")) return;
  const templates = {
    compare: () => ({
      nodes: [
        { id: uid("n"), title: "URSS de Staline / Allemagne nazie", category: "central", shape: "rounded", x: 3765, y: 2938, w: 270, h: 124, note: "", source: "", sourceUrl: "" },
        { id: uid("n"), title: "Points communs", category: "commun", shape: "rounded", x: 3430, y: 2620, w: 214, h: 98, note: "", source: "", sourceUrl: "" },
        { id: uid("n"), title: "URSS de Staline", category: "urss", shape: "rounded", x: 3430, y: 3230, w: 214, h: 98, note: "", source: "", sourceUrl: "" },
        { id: uid("n"), title: "Allemagne nazie", category: "allemagne", shape: "rounded", x: 4270, y: 2620, w: 214, h: 98, note: "", source: "", sourceUrl: "" },
        { id: uid("n"), title: "À vérifier / à nuancer", category: "nuance", shape: "rounded", x: 4270, y: 3230, w: 214, h: 98, note: "", source: "", sourceUrl: "" }
      ],
      links: []
    }),
    enquete: () => ({
      nodes: [
        { id: uid("n"), title: "Dossiers d'enquête", category: "central", shape: "rounded", x: 3765, y: 2938, w: 270, h: 124, note: "", source: "", sourceUrl: "" },
        { id: uid("n"), title: "URSS : le stalinisme en actes", category: "urss", shape: "rounded", x: 3400, y: 2500, w: 230, h: 112, note: "", source: "Dossier 1 — EHNE", sourceUrl: "" },
        { id: uid("n"), title: "Allemagne : la fin de la République", category: "allemagne", shape: "rounded", x: 3400, y: 3330, w: 230, h: 112, note: "", source: "Dossier 2 — Histoire par l'image / GHDI", sourceUrl: "" },
        { id: uid("n"), title: "Allemagne : la race dans la loi", category: "allemagne", shape: "rounded", x: 4300, y: 2500, w: 230, h: 112, note: "", source: "Dossier 3 — USHMM", sourceUrl: "" },
        { id: uid("n"), title: "Comparer : deux propagandes", category: "commun", shape: "rounded", x: 4300, y: 3330, w: 230, h: 112, note: "", source: "Dossier 4 — Histoire par l'image", sourceUrl: "" }
      ],
      links: []
    }),
    vide: () => ({
      nodes: [
        { id: uid("n"), title: "URSS de Staline / Allemagne nazie", category: "central", shape: "rounded", x: 3765, y: 2938, w: 270, h: 124, note: "", source: "", sourceUrl: "" }
      ],
      links: []
    })
  };
  const factory = templates[name] || templates.vide;
  const result = factory();
  if (result.nodes.length > 1) {
    const central = result.nodes[0];
    result.links = result.nodes.slice(1).map((n) => ({ id: uid("l"), from: central.id, to: n.id, label: "" }));
  }
  pushHistory();
  state.nodes = result.nodes;
  state.links = result.links;
  selectedNodeId = null;
  selectedLinkId = null;
  linkFrom = null;
  render();
  requestAnimationFrame(() => fitView());
  notify();
  setStatus("Modèle appliqué. Tu peux maintenant ajouter tes idées.");
}

export function buildFromSort(placements, items) {
  const placed = items.filter((item) => placements[item.id]);
  if (placed.length < items.length) {
    setStatus(`Termine le tri : ${placed.length}/${items.length} éléments placés.`);
    return;
  }
  if (state.nodes.length && !window.confirm("Remplacer la carte actuelle par une carte construite à partir de ton tri ?")) return;
  pushHistory();
  const central = {
    id: uid("n"),
    title: "URSS de Staline / Allemagne nazie",
    category: "central",
    shape: "rounded",
    x: 3765,
    y: 2938,
    w: 270,
    h: 124,
    note: "",
    source: "",
    sourceUrl: ""
  };
  const branches = [
    { column: "commun", title: "Points communs", category: "commun", x: 3450, y: 2600 },
    { column: "urss", title: "URSS de Staline", category: "urss", x: 3450, y: 3200 },
    { column: "allemagne", title: "Allemagne nazie", category: "allemagne", x: 4300, y: 2600 },
    { column: "nuance", title: "À vérifier / à nuancer", category: "nuance", x: 4300, y: 3200 }
  ].map((b) => ({
    ...b,
    id: uid("n"),
    shape: "rounded",
    w: 214,
    h: 98,
    note: "",
    source: "",
    sourceUrl: ""
  }));
  const nodes = [central, ...branches];
  const links = branches.map((b) => ({ id: uid("l"), from: central.id, to: b.id, label: "" }));
  branches.forEach((branch) => {
    const leaves = placed.filter((item) => placements[item.id] === branch.column);
    const leftSide = branch.column === "commun" || branch.column === "urss";
    leaves.forEach((item, index) => {
      const leaf = {
        id: uid("n"),
        title: item.nodeTitle || item.text,
        category: branch.column,
        shape: "rounded",
        x: leftSide ? (index % 2 === 0 ? 3200 : 3450) : index % 2 === 0 ? 4300 : 4550,
        y: branch.y + 140 + Math.floor(index / 2) * 105,
        w: 214,
        h: 98,
        note: item.text,
        source: "",
        sourceUrl: ""
      };
      nodes.push(leaf);
      links.push({ id: uid("l"), from: branch.id, to: leaf.id, label: "" });
    });
  });
  state.nodes = nodes;
  state.links = links;
  selectedNodeId = null;
  selectedLinkId = null;
  linkFrom = null;
  render();
  requestAnimationFrame(() => centerOnCentral(0.75));
  notify();
  setStatus("Carte construite à partir de ton tri. Déplace-toi pour voir les branches, ou touche Ajuster pour tout afficher.");
}

function wrapText(text, maxChars) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (!line) {
      line = word;
    } else if ((line + " " + word).length <= maxChars) {
      line += " " + word;
    } else {
      lines.push(line);
      line = word;
    }
    if (line.length > maxChars) {
      lines.push(line.slice(0, maxChars - 1) + "…");
      line = "";
    }
  }
  if (line) lines.push(line);
  if (!lines.length) lines.push("");
  if (lines.length > 4) {
    lines.length = 4;
    lines[3] = lines[3].replace(/\s+\S*$/, "") + "…";
  }
  return lines;
}

export function toSVG() {
  if (!state.nodes.length) return "";
  const b = bounds();
  if (!b) return "";
  const pad = 110;
  const vbX = b.x - pad;
  const vbY = b.y - pad;
  const vbW = b.w + pad * 2;
  const vbH = b.h + pad * 2;
  const parts = [];
  parts.push(
    `<svg class="map-svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" role="img" aria-label="Carte mentale comparant l'URSS de Staline et l'Allemagne nazie">`
  );
  for (const link of state.links) {
    const a = nodeById(link.from);
    const c = nodeById(link.to);
    if (!a || !c) continue;
    const x1 = a.x + a.w / 2;
    const y1 = a.y + a.h / 2;
    const x2 = c.x + c.w / 2;
    const y2 = c.y + c.h / 2;
    const dx = Math.max(55, Math.abs(x2 - x1) * 0.45);
    const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
    parts.push(`<path d="${d}" fill="none" stroke="#8a8074" stroke-width="2.4"/>`);
    if (link.label) {
      parts.push(
        `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 7}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" fill="#4b4238" paint-order="stroke" stroke="#fbf8f1" stroke-width="4">${escXml(link.label)}</text>`
      );
    }
  }
  for (const node of state.nodes) {
    const cat = CATEGORIES[node.category] || CATEGORIES.commun;
    const isCentral = node.category === "central";
    const titleSize = isCentral ? 20 : 15.5;
    const maxChars = isCentral ? 26 : 23;
    const wrapped = wrapText(node.title, maxChars);
    const lines = wrapped.slice(0, 3);
    if (wrapped.length > 3) lines[2] = lines[2].replace(/\s+\S*$/, "") + "…";
    const lineHeight = isCentral ? 23 : 18;
    const badgeY = isCentral ? 27 : 20;
    const titleStart = isCentral ? 56 : 44;
    const fill = isCentral ? cat.fill : cat.fill;
    const textFill = isCentral ? cat.text : cat.text;
    const stroke = cat.border;
    let shape = "";
    if (node.shape === "ellipse") {
      shape = `<ellipse cx="${node.w / 2}" cy="${node.h / 2}" rx="${node.w / 2}" ry="${node.h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
    } else {
      const rx = node.shape === "rect" ? 4 : 16;
      shape = `<rect x="0" y="0" width="${node.w}" height="${node.h}" rx="${rx}" ry="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
    }
    const centered = node.shape === "ellipse";
    const textX = centered ? node.w / 2 : 14;
    const anchor = centered ? "middle" : "start";
    const badge = `<text x="${textX}" y="${badgeY}" text-anchor="${anchor}" font-family="system-ui, sans-serif" font-size="9.5" font-weight="700" letter-spacing="1.1" fill="${textFill}" opacity="0.85">${escXml(cat.icon + " " + cat.short.toUpperCase())}</text>`;
    const title = lines
      .map(
        (line, i) =>
          `<text x="${textX}" y="${titleStart + i * lineHeight}" text-anchor="${anchor}" font-family="Georgia, 'Times New Roman', serif" font-size="${titleSize}" font-weight="600" fill="${textFill}">${escXml(line)}</text>`
      )
      .join("");
    const sourceMark = node.source
      ? `<text x="${textX}" y="${node.h - 12}" text-anchor="${anchor}" font-family="system-ui, sans-serif" font-size="9" fill="${textFill}" opacity="0.8">▲ source</text>`
      : "";
    parts.push(`<g transform="translate(${node.x}, ${node.y})">${shape}${badge}${title}${sourceMark}</g>`);
  }
  parts.push("</svg>");
  return parts.join("");
}

export function toSVGFromData(data) {
  const previousNodes = state.nodes;
  const previousLinks = state.links;
  const normalized = normalize(data);
  state.nodes = normalized.nodes;
  state.links = normalized.links;
  const svg = toSVG();
  state.nodes = previousNodes;
  state.links = previousLinks;
  return svg;
}

/**
 * Version imprimable : une mise en page compacte et lisible, organisée par
 * catégories, plutôt que la disposition spatiale libre du canevas.
 */
export function toPrintSVG() {
  if (!state.nodes.length) return "";
  const cols = ["commun", "urss", "allemagne", "preuve", "nuance"];
  const colW = 184;
  const gap = 12;
  const startX = 16;
  const nodeH = 68;
  const nodeGap = 10;
  const nodeStartY = 222;
  const centralW = 420;
  const centralH = 76;
  const centralX = 500 - centralW / 2;
  const centralY = 40;
  const groups = {};
  cols.forEach((c) => {
    groups[c] = state.nodes.filter((n) => n.category === c);
  });
  const maxRows = Math.max(1, ...cols.map((c) => groups[c].length));
  const H = nodeStartY + maxRows * (nodeH + nodeGap) + 34;
  const positions = {};
  positions["central"] = { x: 500, y: centralY + centralH, cx: 500 };
  const parts = [];
  parts.push(
    `<svg class="map-svg" viewBox="0 0 1000 ${H}" role="img" aria-label="Carte mentale imprimée, organisée par catégories">`
  );

  // Liens
  const nodePos = {};
  state.nodes.forEach((n) => {
    if (n.category === "central") {
      nodePos[n.id] = { x: 500, y: centralY + centralH, cx: 500 };
      return;
    }
    const colIndex = cols.indexOf(n.category);
    const rowIndex = groups[n.category].findIndex((x) => x.id === n.id);
    const x = startX + Math.max(0, colIndex) * (colW + gap);
    const y = nodeStartY + rowIndex * (nodeH + nodeGap);
    nodePos[n.id] = { x: x + colW / 2, y, cx: x + colW / 2, top: y, bottom: y + nodeH };
  });
  for (const link of state.links) {
    const a = nodePos[link.from];
    const b = nodePos[link.to];
    if (!a || !b) continue;
    const x1 = a.cx;
    const y1 = a.bottom != null ? a.bottom : a.y;
    const x2 = b.cx;
    const y2 = b.top != null ? b.top : b.y;
    const midY = (y1 + y2) / 2;
    const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
    parts.push(`<path d="${d}" fill="none" stroke="#a89c8b" stroke-width="1.6"/>`);
    if (link.label) {
      parts.push(
        `<text x="${(x1 + x2) / 2}" y="${midY - 4}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="9" fill="#5b5248" paint-order="stroke" stroke="#ffffff" stroke-width="4">${escXml(link.label)}</text>`
      );
    }
  }

  // Colonnes
  cols.forEach((catId, i) => {
    const cat = CATEGORIES[catId];
    const x = startX + i * (colW + gap);
    parts.push(
      `<rect x="${x}" y="150" width="${colW}" height="${H - 190}" rx="12" fill="${cat.fill}" stroke="${cat.border}" stroke-width="0.8" opacity="0.55"/>`
    );
    parts.push(
      `<text x="${x + 12}" y="176" font-family="system-ui, sans-serif" font-size="11.5" font-weight="700" fill="${cat.text}">${escXml(cat.icon + " " + cat.label.toUpperCase())}</text>`
    );
    parts.push(
      `<text x="${x + colW - 12}" y="176" text-anchor="end" font-family="system-ui, sans-serif" font-size="11" fill="${cat.text}">${groups[catId].length}</text>`
    );
    groups[catId].forEach((node, row) => {
      const y = nodeStartY + row * (nodeH + nodeGap);
      const lines = wrapText(node.title, 23).slice(0, 2);
      const hasMore = wrapText(node.title, 23).length > 2;
      const title = lines
        .map(
          (line, index) =>
            `<text x="10" y="${34 + index * 15}" font-family="Georgia, 'Times New Roman', serif" font-size="15" font-weight="600" fill="${cat.text}">${escXml(
              index === 1 && hasMore ? line.replace(/\s+\S*$/, "") + "…" : line
            )}</text>`
        )
        .join("");
      const source = node.source
        ? `<text x="${colW - 10}" y="${nodeH - 8}" text-anchor="end" font-family="system-ui, sans-serif" font-size="8.5" fill="${cat.text}" opacity="0.8">▲ source</text>`
        : "";
      parts.push(
        `<g transform="translate(${x}, ${y})"><rect width="${colW}" height="${nodeH}" rx="10" fill="${cat.fill}" stroke="${cat.border}" stroke-width="1.4"/><text x="10" y="16" font-family="system-ui, sans-serif" font-size="8.5" font-weight="700" letter-spacing="0.8" fill="${cat.text}" opacity="0.85">${escXml(cat.icon + " " + cat.short.toUpperCase())}</text>${title}${source}</g>`
      );
    });
  });

  // Nœud central
  const central = state.nodes.find((n) => n.category === "central");
  if (central) {
    const centralLines = wrapText(central.title, 38).slice(0, 2);
    const centralTitle = centralLines
      .map(
        (line, index) =>
          `<text x="500" y="${centralY + 48 + index * 20}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="18" font-weight="600" fill="#ffffff">${escXml(line)}</text>`
      )
      .join("");
    parts.push(
      `<g><rect x="${centralX}" y="${centralY}" width="${centralW}" height="${centralH}" rx="16" fill="#1f2933" stroke="#1f2933"/><text x="500" y="${centralY + 22}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="9.5" font-weight="700" letter-spacing="1.2" fill="#ffffff" opacity="0.8">★ SUJET CENTRAL</text>${centralTitle}</g>`
    );
  }

  parts.push("</svg>");
  return parts.join("");
}

