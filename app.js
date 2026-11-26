import {
  META,
  BRIEFING,
  DOSSIERS,
  MECHANISMS,
  SORT_COLUMNS,
  SORT_ITEMS,
  GLOSSARY,
  BIBLIOGRAPHY
} from "./content.js";
import { CATEGORIES, initMap, setMapData, getMapData, applyTemplate, buildFromSort, toPrintSVG, undo, redo, zoomIn, zoomOut, fitView, addNode, startLink } from "./map.js";
import { saveState, loadState, clearState } from "./storage.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const STEP_LABELS = ["Briefing", "Enquête", "Mécanismes", "Comparer", "Carte", "Vérifier"];
const SORT_COLUMN_IDS = SORT_COLUMNS.map((c) => c.id);

let state = null;
let saveTimer = null;
let mapReady = false;
let mapFittedVisible = false;
let conclusionBound = false;
let selectedSortItem = null;
let currentDossierId = null;
let toastTimer = null;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugify(value) {
  return String(value || "eleve")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "eleve";
}

function defaultState() {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    studentName: "",
    step: 0,
    dossiers: {},
    mechanisms: {},
    sort: {},
    sortChecked: false,
    map: { nodes: [], links: [], view: { x: 0, y: 0, s: 1 } },
    checklistManual: { nuance: false },
    conclusion: "",
    exportedAt: null
  };
}

function normalizeState(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== "object") return base;
  const merged = { ...base, ...raw };
  merged.version = 1;
  merged.step = clamp(Number(merged.step) || 0, 0, 5);
  merged.studentName = String(merged.studentName || "");
  merged.conclusion = String(merged.conclusion || "");
  merged.dossiers = { ...(raw.dossiers || {}) };
  merged.mechanisms = { ...(raw.mechanisms || {}) };
  merged.sort = { ...(raw.sort || {}) };
  merged.sortChecked = Boolean(raw.sortChecked);
  merged.checklistManual = { ...base.checklistManual, ...(raw.checklistManual || {}) };
  merged.map =
    raw.map && Array.isArray(raw.map.nodes) && Array.isArray(raw.map.links)
      ? raw.map
      : { nodes: [], links: [], view: { x: 0, y: 0, s: 1 } };
  return merged;
}

function hasActivity(raw) {
  if (!raw) return false;
  return Boolean(
    raw.updatedAt ||
      raw.studentName ||
      raw.conclusion ||
      (raw.map && Array.isArray(raw.map.nodes) && raw.map.nodes.length)
  );
}

function isTyping() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

function toast(message) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 4200);
}

function setSaveStatus(message, tone) {
  const el = $("#saveStatus");
  if (!el) return;
  el.textContent = message;
  el.dataset.tone = tone || "";
}

async function saveNow() {
  if (!state) return;
  clearTimeout(saveTimer);
  state.updatedAt = new Date().toISOString();
  const ok = await saveState(state);
  if (ok) {
    const time = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    setSaveStatus("Enregistré à " + time, "ok");
  } else {
    setSaveStatus("Sauvegarde impossible — télécharge une sauvegarde.", "error");
  }
}

function scheduleSave() {
  if (!state) return;
  setSaveStatus("Enregistrement…", "pending");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 380);
}

function renderBriefing() {
  $("#briefingMission").textContent = BRIEFING.mission;
  $("#briefingWarning").textContent = BRIEFING.warning;
  $("#briefingMethod").textContent = BRIEFING.method;
  $("#objectivesList").innerHTML = BRIEFING.objectives.map((o) => `<li>${esc(o)}</li>`).join("");
}

function renderDossiers() {
  const grid = $("#dossierGrid");
  if (!grid) return;
  grid.innerHTML = DOSSIERS.map((d) => {
    const progress = state.dossiers[d.id] || {};
    const answers = progress.answers || {};
    const answered = Object.values(answers).filter((v) => String(v || "").trim().length > 0).length;
    const done = Boolean(progress.done);
    return `<article class="dossier-card regime-${esc(d.regimeClass)}">
      <div class="dossier-top">
        <span class="badge">Dossier ${d.number}</span>
        <span class="regime-tag">${esc(d.regime)}</span>
      </div>
      <h3>${esc(d.title)}</h3>
      <p class="dossier-type">${esc(d.type)}</p>
      <p class="dossier-date">${esc(d.date)}</p>
      <p class="dossier-source">Source : ${esc(d.source)}</p>
      <div class="dossier-progress">
        <span>${d.texts.length} extraits</span>
        <span>${answered}/${d.questions.length} réponses</span>
        <span class="${done ? "is-done" : ""}">${done ? "Terminé" : "À ouvrir"}</span>
      </div>
      <button type="button" class="button secondary" data-dossier="${esc(d.id)}">${done ? "Rouvrir le dossier" : "Ouvrir le dossier"}</button>
    </article>`;
  }).join("");
  $$("[data-dossier]", grid).forEach((button) => {
    button.addEventListener("click", () => openDossier(button.dataset.dossier));
  });
}

function openDossier(id) {
  const dossier = DOSSIERS.find((d) => d.id === id);
  if (!dossier) return;
  currentDossierId = id;
  const progress = state.dossiers[id] || {};
  const answers = progress.answers || {};
  const done = Boolean(progress.done);

  $("#dossierDialogKicker").textContent = `Dossier ${dossier.number} · ${dossier.regime} · ${dossier.date}`;
  $("#dossierDialogTitle").textContent = dossier.title;

  const sourceLinks = [
    `<a href="${esc(dossier.url)}" target="_blank" rel="noopener">${esc(dossier.urlLabel)}</a>`,
    ...(dossier.extraSources || []).map(
      (s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>`
    )
  ].join("");

  const texts = dossier.texts
    .map(
      (t) => `<section class="doc-text">
        <h3>${esc(t.title)}</h3>
        ${t.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}
      </section>`
    )
    .join("");

  const questions = dossier.questions
    .map(
      (q) => `<div class="question" data-question="${esc(q.id)}">
        <label for="answer-${esc(q.id)}">${esc(q.prompt)}</label>
        <textarea id="answer-${esc(q.id)}" data-qid="${esc(q.id)}" rows="3" maxlength="700" placeholder="${esc(q.placeholder || "Note ce que tu observes...")}">${esc(answers[q.id] || "")}</textarea>
        <button type="button" class="text-button" data-hint="${esc(q.id)}" aria-expanded="false" aria-controls="hint-${esc(q.id)}">Voir une piste</button>
        <p class="hint" id="hint-${esc(q.id)}" hidden>${esc(q.hint)}</p>
      </div>`
    )
    .join("");

  $("#dossierContent").innerHTML = `
    <div class="dossier-meta">
      <p><strong>Nature :</strong> ${esc(dossier.type)}</p>
      <p><strong>Source :</strong> ${esc(dossier.source)}</p>
      <p class="source-links">${sourceLinks}</p>
    </div>
    ${
      dossier.caution
        ? `<p class="caution-note"><strong>Précaution :</strong> ${esc(dossier.caution)}</p>`
        : ""
    }
    <div class="doc-texts">${texts}</div>
    <div class="takeaway-block">
      <button type="button" class="button secondary small" data-takeaway aria-expanded="false" aria-controls="takeaway-${esc(dossier.id)}">Afficher la synthèse du dossier</button>
      <div id="takeaway-${esc(dossier.id)}" class="takeaway" hidden>
        <p>${esc(dossier.takeaway)}</p>
      </div>
    </div>
    <h3 class="questions-title">Observe et note</h3>
    <p class="muted">Réponds avec tes mots. Une piste n'est pas la réponse : elle indique où chercher.</p>
    <div class="questions">${questions}</div>
    <label class="done-check">
      <input type="checkbox" id="dossierDone" ${done ? "checked" : ""} />
      <span>J'ai terminé ce dossier</span>
    </label>
  `;

  const dialog = $("#dossierDialog");
  dialog.showModal();
  requestAnimationFrame(() => {
    const title = $("#dossierDialogTitle");
    if (title) title.focus();
  });
}

function bindDossierDialog() {
  const dialog = $("#dossierDialog");
  const content = $("#dossierContent");

  content.addEventListener("input", (event) => {
    const qid = event.target.dataset.qid;
    if (!qid || !currentDossierId) return;
    const prev = state.dossiers[currentDossierId] || { answers: {}, done: false };
    const answers = { ...(prev.answers || {}), [qid]: event.target.value };
    state.dossiers[currentDossierId] = { ...prev, answers };
    scheduleSave();
  });

  content.addEventListener("change", (event) => {
    if (event.target.id === "dossierDone" && currentDossierId) {
      const prev = state.dossiers[currentDossierId] || { answers: {} };
      state.dossiers[currentDossierId] = { ...prev, done: event.target.checked };
      scheduleSave();
    }
  });

  content.addEventListener("click", (event) => {
    const hintButton = event.target.closest("[data-hint]");
    if (hintButton) {
      const qid = hintButton.dataset.hint;
      const hint = $("#hint-" + qid);
      if (hint) {
        hint.hidden = !hint.hidden;
        hintButton.setAttribute("aria-expanded", String(!hint.hidden));
        hintButton.textContent = hint.hidden ? "Voir une piste" : "Masquer la piste";
      }
      return;
    }
    const takeawayButton = event.target.closest("[data-takeaway]");
    if (takeawayButton) {
      const block = takeawayButton.parentElement.querySelector(".takeaway");
      if (block) {
        block.hidden = !block.hidden;
        takeawayButton.setAttribute("aria-expanded", String(!block.hidden));
        takeawayButton.textContent = block.hidden ? "Afficher la synthèse du dossier" : "Masquer la synthèse";
      }
    }
  });

  $("#dossierClose").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    currentDossierId = null;
    renderDossiers();
    saveNow();
  });
}

function renderMechanisms() {
  const list = $("#mechanismList");
  if (!list) return;
  const choices = [
    { id: "urss", label: "URSS de Staline" },
    { id: "allemagne", label: "Allemagne nazie" },
    { id: "both", label: "Les deux" }
  ];
  list.innerHTML = MECHANISMS.map((m) => {
    const saved = state.mechanisms[m.id] || {};
    const choice = saved.choice || "";
    const checked = Boolean(saved.checked && choice);
    const correct = checked && choice === m.answer;
    return `<article class="mechanism" data-mechanism="${esc(m.id)}">
      <p class="mechanism-label">${esc(m.label)}</p>
      <div class="segmented" role="radiogroup" aria-label="${esc(m.label)}">
        ${choices
          .map(
            (c) =>
              `<button type="button" role="radio" aria-checked="${choice === c.id}" class="${choice === c.id ? "is-chosen" : ""}" data-choice="${c.id}">${esc(c.label)}</button>`
          )
          .join("")}
      </div>
      <div class="mechanism-footer">
        <button type="button" class="button secondary small" data-check="${esc(m.id)}">Vérifier</button>
        <div class="feedback ${checked ? (correct ? "is-correct" : "is-wrong") : ""}" ${checked ? "" : "hidden"}>
          <p><strong>${correct ? "Cela correspond." : "À revoir."}</strong> ${esc(m.feedback)}</p>
          <p class="muted">Réponse attendue : ${esc(
            m.answer === "both" ? "les deux régimes" : m.answer === "urss" ? "l'URSS de Staline" : "l'Allemagne nazie"
          )}</p>
        </div>
      </div>
    </article>`;
  }).join("");
}

function bindMechanisms() {
  const list = $("#mechanismList");
  if (!list) return;
  list.addEventListener("click", (event) => {
    const choiceButton = event.target.closest("[data-choice]");
    if (choiceButton) {
      const card = choiceButton.closest("[data-mechanism]");
      const id = card.dataset.mechanism;
      const choice = choiceButton.dataset.choice;
      const prev = state.mechanisms[id] || {};
      state.mechanisms[id] = { ...prev, choice, checked: false };
      $$("[data-choice]", card).forEach((b) => {
        const active = b.dataset.choice === choice;
        b.classList.toggle("is-chosen", active);
        b.setAttribute("aria-checked", String(active));
      });
      const feedback = $(".feedback", card);
      if (feedback) {
        feedback.hidden = true;
        feedback.classList.remove("is-correct", "is-wrong");
      }
      scheduleSave();
      return;
    }
    const checkButton = event.target.closest("[data-check]");
    if (checkButton) {
      const id = checkButton.dataset.check;
      const saved = state.mechanisms[id] || {};
      if (!saved.choice) {
        toast("Choisis d'abord un régime.");
        return;
      }
      state.mechanisms[id] = { ...saved, checked: true };
      const mechanism = MECHANISMS.find((m) => m.id === id);
      const card = checkButton.closest("[data-mechanism]");
      const feedback = $(".feedback", card);
      const correct = saved.choice === mechanism.answer;
      if (feedback) {
        feedback.hidden = false;
        feedback.classList.toggle("is-correct", correct);
        feedback.classList.toggle("is-wrong", !correct);
        const title = $("strong", feedback);
        if (title) title.textContent = correct ? "Cela correspond." : "À revoir.";
      }
      scheduleSave();
    }
  });
}

function renderSort() {
  const pool = $("#sortPool");
  const board = $("#sortBoard");
  if (!pool || !board) return;

  const unplaced = SORT_ITEMS.filter((item) => !state.sort[item.id]);
  pool.innerHTML = unplaced.length
    ? unplaced
        .map(
          (item) => `<div class="sort-item ${selectedSortItem === item.id ? "is-selected" : ""}" draggable="true" data-sort-id="${esc(item.id)}">
            <button type="button" class="sort-item-main" data-sort-id="${esc(item.id)}">${esc(item.text)}</button>
          </div>`
        )
        .join("")
    : `<p class="muted">Tous les éléments sont placés. Tu peux encore les déplacer.</p>`;

  board.innerHTML = SORT_COLUMNS.map((col) => {
    const items = SORT_ITEMS.filter((item) => state.sort[item.id] === col.id);
    return `<section class="sort-column column-${esc(col.id)}" data-column="${esc(col.id)}" aria-labelledby="col-${esc(col.id)}">
      <div class="sort-column-head">
        <h3 id="col-${esc(col.id)}"><span class="col-icon" aria-hidden="true">${esc(CATEGORIES[col.id] ? CATEGORIES[col.id].icon : "•")}</span> ${esc(col.label)} <span class="col-count">${items.length}</span></h3>
        <p>${esc(col.hint)}</p>
      </div>
      <div class="sort-items">
        ${
          items.length
            ? items
                .map((item) => {
                  const checked = state.sortChecked;
                  const correct = checked && state.sort[item.id] === item.answer;
                  const wrong = checked && state.sort[item.id] !== item.answer;
                  return `<div class="sort-item is-placed ${selectedSortItem === item.id ? "is-selected" : ""} ${correct ? "is-correct" : ""} ${wrong ? "is-wrong" : ""}" draggable="true" data-sort-id="${esc(item.id)}">
                    <button type="button" class="sort-item-main" data-sort-id="${esc(item.id)}">${esc(item.text)}</button>
                    <button type="button" class="sort-remove" data-remove="${esc(item.id)}" aria-label="Retirer ${esc(item.text)}">×</button>
                  </div>`;
                })
                .join("")
            : `<p class="empty-column">Dépose ici un élément.</p>`
        }
      </div>
      <button type="button" class="sort-place" data-place="${esc(col.id)}">Placer l'élément sélectionné ici</button>
    </section>`;
  }).join("");

  const instruction = $("#sortInstruction");
  if (instruction) {
    if (selectedSortItem) {
      const item = SORT_ITEMS.find((i) => i.id === selectedSortItem);
      instruction.textContent = `Élément sélectionné : « ${item ? item.text : ""} ». Choisis une colonne (ou touche 1 à 4).`;
    } else {
      instruction.textContent = "Aucun élément sélectionné. Clique sur un élément, puis sur une colonne.";
    }
  }
  renderSortFeedback();
}

function renderSortFeedback() {
  const panel = $("#sortFeedback");
  if (!panel) return;
  if (!state.sortChecked) {
    panel.innerHTML = "";
    return;
  }
  const placed = SORT_ITEMS.filter((item) => state.sort[item.id]);
  if (!placed.length) {
    panel.innerHTML = `<p class="muted">Place d'abord quelques éléments pour vérifier ton tri.</p>`;
    return;
  }
  const correct = placed.filter((item) => state.sort[item.id] === item.answer).length;
  const details = SORT_ITEMS.map((item) => {
    const col = state.sort[item.id];
    if (!col) {
      return `<li class="pending"><strong>${esc(item.text)}</strong> — à placer.</li>`;
    }
    const ok = col === item.answer;
    return `<li class="${ok ? "ok" : "wrong"}">
      <strong>${esc(item.text)}</strong>
      <span class="tag">${esc(SORT_COLUMNS.find((c) => c.id === col)?.label || col)}</span>
      <span>${ok ? "Bien placé." : "À revoir."} ${esc(item.feedback)}</span>
    </li>`;
  }).join("");
  panel.innerHTML = `<div class="feedback-head"><h3>Tri vérifié</h3><p>${correct} élément(s) bien placé(s) sur ${placed.length} placé(s).</p></div><ul class="sort-feedback-list">${details}</ul>`;
}

function placeSortItem(id, column) {
  if (!SORT_ITEMS.some((item) => item.id === id) || !SORT_COLUMN_IDS.includes(column)) return;
  state.sort[id] = column;
  state.sortChecked = false;
  selectedSortItem = null;
  scheduleSave();
  renderSort();
  requestAnimationFrame(() => {
    const el = document.querySelector(`.sort-item[data-sort-id="${id}"] .sort-item-main`);
    if (el) el.focus();
  });
  toast("Élément placé. Tu peux le déplacer ou vérifier ton tri.");
}

function bindSort() {
  const board = $("#sortBoard");
  const pool = $("#sortPool");
  if (!board || !pool) return;

  function selectItem(id) {
    selectedSortItem = selectedSortItem === id ? null : id;
    renderSort();
    requestAnimationFrame(() => {
      const el = document.querySelector(`.sort-item[data-sort-id="${id}"] .sort-item-main`);
      if (el) el.focus();
    });
  }

  function handleClick(event) {
    const remove = event.target.closest("[data-remove]");
    if (remove) {
      event.stopPropagation();
      delete state.sort[remove.dataset.remove];
      state.sortChecked = false;
      scheduleSave();
      renderSort();
      return;
    }
    const item = event.target.closest("[data-sort-id]");
    if (item) {
      const id = item.closest(".sort-item")?.dataset.sortId || item.dataset.sortId;
      if (id) selectItem(id);
      return;
    }
    const place = event.target.closest("[data-place]");
    if (place) {
      if (!selectedSortItem) {
        toast("Sélectionne d'abord un élément.");
        return;
      }
      placeSortItem(selectedSortItem, place.dataset.place);
      return;
    }
    const column = event.target.closest(".sort-column");
    if (column) {
      if (!selectedSortItem) {
        toast("Sélectionne d'abord un élément.");
        return;
      }
      placeSortItem(selectedSortItem, column.dataset.column);
    }
  }

  board.addEventListener("click", handleClick);
  pool.addEventListener("click", handleClick);

  function dragStart(event) {
    const item = event.target.closest(".sort-item");
    if (!item) return;
    event.dataTransfer.setData("text/plain", item.dataset.sortId);
    event.dataTransfer.effectAllowed = "move";
    item.classList.add("is-dragging");
  }
  function dragEnd(event) {
    const item = event.target.closest(".sort-item");
    if (item) item.classList.remove("is-dragging");
  }
  function dragOver(event) {
    const column = event.target.closest(".sort-column");
    if (!column) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    column.classList.add("is-over");
  }
  function dragLeave(event) {
    const column = event.target.closest(".sort-column");
    if (column) column.classList.remove("is-over");
  }
  function drop(event) {
    const column = event.target.closest(".sort-column");
    if (!column) return;
    event.preventDefault();
    column.classList.remove("is-over");
    const id = event.dataTransfer.getData("text/plain");
    if (id) placeSortItem(id, column.dataset.column);
  }

  [board, pool].forEach((zone) => {
    zone.addEventListener("dragstart", dragStart);
    zone.addEventListener("dragend", dragEnd);
    zone.addEventListener("dragover", dragOver);
    zone.addEventListener("dragleave", dragLeave);
    zone.addEventListener("drop", drop);
  });

  $("#sortCheck").addEventListener("click", () => {
    state.sortChecked = true;
    scheduleSave();
    renderSort();
    const panel = $("#sortFeedback");
    if (panel) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  $("#sortReset").addEventListener("click", () => {
    if (!Object.keys(state.sort).length) return;
    if (!window.confirm("Effacer tous les placements du tri ?")) return;
    state.sort = {};
    state.sortChecked = false;
    selectedSortItem = null;
    scheduleSave();
    renderSort();
  });
}

function countSentences(text) {
  const clean = String(text || "").trim();
  if (!clean) return 0;
  const matches = clean.match(/[.!?…]+/g);
  return matches ? matches.length : clean.length > 30 ? 1 : 0;
}

function checklistItems() {
  const nodes = (state.map && state.map.nodes) || [];
  const links = (state.map && state.map.links) || [];
  const count = (cat) => nodes.filter((n) => n.category === cat).length;
  const sources = nodes.filter((n) => String(n.source || "").trim().length > 0).length;
  const sentences = countSentences(state.conclusion);
  const conclusionOk = sentences >= 3 && state.conclusion.trim().length >= 120;
  return [
    { id: "central", ok: nodes.some((n) => n.category === "central"), label: "Un sujet central est présent.", tip: "Ajoute un nœud central ou choisis le modèle comparaison." },
    { id: "commun", ok: count("commun") >= 3, label: "Au moins 3 points communs.", tip: "Pense au parti unique, à la propagande, à la police politique." },
    { id: "urss", ok: count("urss") >= 3, label: "Au moins 3 éléments propres à l'URSS.", tip: "Collectivisation, plans, Goulag, Grande Terreur..." },
    { id: "allemagne", ok: count("allemagne") >= 3, label: "Au moins 3 éléments propres à l'Allemagne nazie.", tip: "Lois de Nuremberg, autarcie, réarmement, Führer..." },
    { id: "sources", ok: sources >= 5, label: "Au moins 5 nœuds ont une source.", tip: "Indique le dossier ou le document dans le champ « Source »." },
    { id: "links", ok: links.length >= 4, label: "Au moins 4 liens relient les idées.", tip: "Relie les branches au sujet central, puis les exemples aux branches." },
    { id: "conclusion", ok: conclusionOk, label: "La conclusion fait au moins 3 phrases.", tip: "Rédige 3 à 5 phrases dans l'étape Vérifier." },
    { id: "nuance", ok: Boolean(state.checklistManual.nuance), label: "J'ai relu les éléments « à vérifier / à nuancer ».", tip: "Vérifie que tu peux expliquer pourquoi une affirmation est fausse ou imprécise." }
  ];
}

function renderChecklist() {
  const list = $("#checklist");
  if (!list) return;
  const items = checklistItems();
  const okCount = items.filter((i) => i.ok).length;
  const manual = state.checklistManual.nuance;
  list.innerHTML =
    items
      .map(
        (item) =>
          `<li class="${item.ok ? "is-ok" : "is-todo"}" data-check-id="${esc(item.id)}">
            <span class="check-icon" aria-hidden="true">${item.ok ? "✓" : "○"}</span>
            <span class="check-body"><strong>${esc(item.label)}</strong><span class="check-tip">${item.ok ? "" : esc(item.tip)}</span></span>
            ${
              item.id === "nuance"
                ? `<input type="checkbox" id="manualNuance" ${manual ? "checked" : ""} aria-label="J'ai relu les éléments à vérifier ou à nuancer" />`
                : ""
            }
          </li>`
      )
      .join("") +
    `<li class="check-summary">${okCount === items.length ? "Tous les points sont réunis. Relis une dernière fois avant l'export." : `${okCount} point(s) sur ${items.length} réuni(s). Continue, puis reviens vérifier.`}</li>`;
}

function updateChecklist() {
  const list = $("#checklist");
  if (!list) return;
  renderChecklist();
}

function bindChecklist() {
  const list = $("#checklist");
  if (!list) return;
  list.addEventListener("change", (event) => {
    if (event.target.id === "manualNuance") {
      state.checklistManual.nuance = event.target.checked;
      scheduleSave();
      updateChecklist();
    }
  });
  $("#checkRefresh").addEventListener("click", () => {
    updateChecklist();
    toast("Vérification mise à jour.");
  });
}

function updateConclusionCount() {
  const el = $("#conclusionCount");
  if (!el) return;
  const text = state.conclusion || "";
  const sentences = countSentences(text);
  el.textContent = `${text.length} caractère(s) · ${sentences} phrase(s)`;
}

function bindConclusion() {
  const input = $("#conclusionInput");
  if (!input) return;
  if (document.activeElement !== input) input.value = state.conclusion || "";
  updateConclusionCount();
  if (conclusionBound) return;
  conclusionBound = true;
  input.addEventListener("input", () => {
    state.conclusion = input.value;
    updateConclusionCount();
    updateChecklist();
    scheduleSave();
  });
}

function renderStep() {
  $$(".step").forEach((section) => {
    const n = Number(section.dataset.step);
    const active = n === state.step;
    section.hidden = !active;
    section.classList.toggle("is-active", active);
  });
  $$("#stepperList .step-button").forEach((button) => {
    const n = Number(button.dataset.stepTarget);
    button.classList.toggle("is-current", n === state.step);
    button.setAttribute("aria-current", n === state.step ? "step" : "false");
  });
  const bar = $("#progressBar");
  if (bar) bar.style.width = `${((state.step + 1) / STEP_LABELS.length) * 100}%`;
  updateMapEmpty();
  if (state.step === 5) updateChecklist();
}

function goToStep(step, focus = true) {
  const next = clamp(Number(step) || 0, 0, 5);
  state.step = next;
  const toastEl = $("#toast");
  if (toastEl) toastEl.hidden = true;
  clearTimeout(toastTimer);
  scheduleSave();
  renderStep();
  if (next === 4 && !mapFittedVisible) {
    requestAnimationFrame(() => {
      fitView();
      mapFittedVisible = true;
    });
  }
  if (focus) {
    const section = document.querySelector(`.step[data-step="${next}"]`);
    const heading = section ? section.querySelector("h2") : null;
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: false });
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function updateMapEmpty() {
  const empty = $("#mapEmpty");
  if (!empty) return;
  const nodes = (state.map && state.map.nodes) || [];
  empty.hidden = nodes.length > 0;
}

function initMapOnce() {
  if (mapReady) return;
  initMap({
    viewport: $("#mapViewport"),
    world: $("#mapWorld"),
    nodes: $("#mapNodes"),
    links: $("#mapLinks"),
    inspector: $("#mapInspector"),
    outline: $("#mapOutline"),
    status: $("#mapStatus"),
    data: state.map,
    isActive: () => state.step === 4,
    onChange: (data) => {
      state.map = data;
      updateMapEmpty();
      updateChecklist();
      scheduleSave();
    }
  });
  mapReady = true;
  updateMapEmpty();
  setTimeout(() => {
    if (state.step === 4 && !mapFittedVisible) {
      fitView();
      mapFittedVisible = true;
    }
  }, 80);
}

function bindMapToolbar() {
  $("#mapAddNode").addEventListener("click", () => addNode());
  $("#mapStartLink").addEventListener("click", () => startLink());
  $("#mapUndo").addEventListener("click", () => undo());
  $("#mapRedo").addEventListener("click", () => redo());
  $("#mapZoomIn").addEventListener("click", () => zoomIn());
  $("#mapZoomOut").addEventListener("click", () => zoomOut());
  $("#mapFit").addEventListener("click", () => fitView());

  $("#mapTemplate").addEventListener("change", (event) => {
    const value = event.target.value;
    event.target.value = "";
    if (value) applyTemplate(value);
  });

  $("#mapFromSort").addEventListener("click", () => buildFromSort(state.sort, SORT_ITEMS));

  const outlinePanel = $("#mapOutlinePanel");
  const outlineButton = $("#mapOutlineToggle");
  outlineButton.addEventListener("click", () => {
    outlinePanel.open = !outlinePanel.open;
    outlineButton.setAttribute("aria-pressed", String(outlinePanel.open));
    if (outlinePanel.open) outlinePanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  $$("[data-template]").forEach((button) => {
    button.addEventListener("click", () => applyTemplate(button.dataset.template));
  });
}

function renderGlossary() {
  const list = $("#glossaryList");
  if (!list) return;
  list.innerHTML = GLOSSARY.map((item) => `<div><dt>${esc(item.term)}</dt><dd>${esc(item.def)}</dd></div>`).join("");
}

function renderSources() {
  const list = $("#sourcesList");
  if (!list) return;
  const docs = BIBLIOGRAPHY.filter((b) => b.url);
  list.innerHTML = docs
    .map(
      (b) =>
        `<li>${esc(b.label)}${b.consulted ? ` <span class="muted">(consulté le ${esc(b.consulted)})</span>` : ""}<br><a href="${esc(b.url)}" target="_blank" rel="noopener">${esc(b.url)}</a></li>`
    )
    .join("");
}

function buildPrintDoc() {
  const nodes = (state.map && state.map.nodes) || [];
  const name = state.studentName.trim() || "Élève";
  const date = new Date().toLocaleDateString("fr-FR");
  const svg = nodes.length ? toPrintSVG() : "";
  const groups = ["central", "commun", "urss", "allemagne", "preuve", "nuance"]
    .map((catId) => {
      const list = nodes.filter((n) => n.category === catId);
      if (!list.length) return "";
      return `<section class="print-group">
        <h3>${esc(CATEGORIES[catId].icon)} ${esc(CATEGORIES[catId].label)} <span>${list.length}</span></h3>
        <ul>
          ${list
            .map(
              (n) => `<li>
                <p class="print-node-title">${esc(n.title)}</p>
                ${n.note ? `<p>${esc(n.note)}</p>` : ""}
                <p class="print-source">Source : ${n.source ? esc(n.source) : "non renseignée"}${
                  n.sourceUrl ? ` — ${esc(n.sourceUrl)}` : ""
                }</p>
              </li>`
            )
            .join("")}
        </ul>
      </section>`;
    })
    .join("");

  const bibliography = BIBLIOGRAPHY.map((b) => {
    const url = b.url ? `<span class="print-url">${esc(b.url)}</span>` : "";
    const consulted = b.consulted ? ` (consulté le ${esc(b.consulted)})` : "";
    return `<li>${esc(b.label)}${consulted}${url ? `<br>${url}` : ""}</li>`;
  }).join("");

  const legend = Object.entries(CATEGORIES)
    .map(
      ([id, cat]) =>
        `<span class="print-legend-item"><span class="print-swatch cat-${esc(id)}">${esc(cat.icon)}</span> ${esc(cat.label)}</span>`
    )
    .join("");

  const conclusion = state.conclusion.trim()
    ? `<p>${esc(state.conclusion).replace(/\n/g, "<br>")}</p>`
    : `<p class="print-empty">Conclusion non rédigée.</p>`;

  return `<div class="print-doc">
    <header class="print-head">
      <p class="print-kicker">Enquête historique · ${esc(META.level)}</p>
      <h1>Carte mentale : l'URSS de Staline et l'Allemagne nazie</h1>
      <p class="print-meta">Élève : <strong>${esc(name)}</strong> · Date : ${esc(date)}</p>
    </header>

    <section class="print-section">
      <div class="print-section-head">
        <h2>La carte</h2>
        <div class="print-legend">${legend}</div>
      </div>
      ${svg ? `<div class="print-map">${svg}</div>` : `<p class="print-empty">La carte n'est pas encore commencée.</p>`}
      <p class="print-note">Les sources de chaque nœud sont détaillées ci-dessous. La couleur est doublée d'un symbole et d'un libellé.</p>
    </section>

    <section class="print-section">
      <h2>Détail des nœuds et des sources</h2>
      ${groups || `<p class="print-empty">Aucun nœud renseigné.</p>`}
    </section>

    <section class="print-section">
      <h2>Conclusion comparative</h2>
      ${conclusion}
    </section>

    <section class="print-section print-biblio">
      <h2>Sources et bibliographie</h2>
      <ul>${bibliography}</ul>
      <p class="print-note">Les notices EHNE, Histoire par l'image et USHMM sont des analyses secondaires ; les décrets, lois et la Constitution sont des textes primaires. Les faits et les chiffres sont cités d'après ces sources.</p>
    </section>

    <footer class="print-footer">
      <p>Travail réalisé dans le cadre d'une enquête historique — ${esc(date)}. Les sources sont citées.</p>
    </footer>
  </div>`;
}

function openPreview() {
  const html = buildPrintDoc();
  const printDoc = $("#printDoc");
  const previewBody = $("#previewBody");
  if (printDoc) printDoc.innerHTML = html;
  if (previewBody) previewBody.innerHTML = html;
  const dialog = $("#previewDialog");
  if (dialog) dialog.showModal();
}

function printCurrent() {
  const previousTitle = document.title;
  const name = state.studentName.trim() || "eleve";
  const date = new Date().toISOString().slice(0, 10);
  const dialog = $("#previewDialog");
  const wasOpen = Boolean(dialog && dialog.open);
  if (wasOpen) dialog.close();
  document.title = `Carte mentale URSS-Allemagne — ${name} — ${date}`;
  state.exportedAt = new Date().toISOString();
  saveNow();
  window.print();
  window.addEventListener(
    "afterprint",
    () => {
      document.title = previousTitle;
      if (wasOpen) dialog.showModal();
    },
    { once: true }
  );
}

function backup() {
  const name = state.studentName.trim() || "eleve";
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sauvegarde-enquete-regimes-${slugify(name)}-${date}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("Sauvegarde téléchargée. Garde ce fichier pour pouvoir reprendre ailleurs.");
}

async function importBackup(file) {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed || !parsed.map || !Array.isArray(parsed.map.nodes)) {
      throw new Error("format");
    }
    if (!window.confirm("Remplacer la progression actuelle par cette sauvegarde ?")) return;
    state = normalizeState(parsed);
    if (mapReady) setMapData(state.map);
    renderAll();
    saveNow();
    toast("Sauvegarde importée.");
  } catch (_) {
    toast("Fichier illisible : ce n'est pas une sauvegarde de cette activité.");
  }
}

async function resetActivity(confirmFirst = true) {
  if (confirmFirst && !window.confirm("Effacer la progression enregistrée et recommencer ?")) return;
  await clearState();
  state = defaultState();
  if (mapReady) setMapData(state.map);
  mapFittedVisible = false;
  selectedSortItem = null;
  renderAll();
  goToStep(0, false);
  saveNow();
  toast("Nouvelle activité commencée.");
}

function renderAll() {
  const nameInput = $("#studentName");
  if (nameInput && document.activeElement !== nameInput) nameInput.value = state.studentName || "";
  renderBriefing();
  renderDossiers();
  renderMechanisms();
  renderSort();
  bindConclusion();
  renderChecklist();
  renderStep();
  renderGlossary();
  renderSources();
  initMapOnce();
  updateMapEmpty();
  const conclusion = $("#conclusionInput");
  if (conclusion && document.activeElement !== conclusion) conclusion.value = state.conclusion || "";
  updateConclusionCount();
}

function bindStatic() {
  const nameInput = $("#studentName");
  nameInput.addEventListener("input", () => {
    state.studentName = nameInput.value;
    scheduleSave();
  });

  $$("[data-step-target]").forEach((button) => {
    button.addEventListener("click", () => goToStep(button.dataset.stepTarget));
  });

  $$("[data-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const dialog = document.getElementById(button.dataset.open);
      if (dialog) dialog.showModal();
    });
  });

  $$("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => {
      const dialog = document.getElementById(button.dataset.closeDialog);
      if (dialog) dialog.close();
    });
  });

  $$(".modal").forEach((dialog) => {
    if (dialog.id === "resumeDialog") return;
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  $("#backupButton").addEventListener("click", backup);
  $("#backupButton2").addEventListener("click", backup);
  $("#importButton").addEventListener("click", () => $("#importInput").click());
  $("#importInput").addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) await importBackup(file);
    event.target.value = "";
  });

  $("#newActivity").addEventListener("click", () => resetActivity(true));
  $("#previewButton").addEventListener("click", openPreview);
  $("#printButton").addEventListener("click", printCurrent);

  bindDossierDialog();
  bindMechanisms();
  bindSort();
  bindChecklist();
  bindMapToolbar();

  document.addEventListener("keydown", (event) => {
    if (state.step === 3 && selectedSortItem && !isTyping()) {
      const index = ["1", "2", "3", "4"].indexOf(event.key);
      if (index >= 0) {
        event.preventDefault();
        placeSortItem(selectedSortItem, SORT_COLUMN_IDS[index]);
        return;
      }
      if (event.key === "Escape") {
        selectedSortItem = null;
        renderSort();
      }
    }
  });

  window.addEventListener("pagehide", () => {
    if (state) saveState(state);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && state) saveState(state);
  });
}

async function init() {
  bindStatic();
  renderGlossary();

  const saved = await loadState();
  if (saved && hasActivity(saved)) {
    state = normalizeState(saved);
    renderAll();
    const meta = $("#resumeMeta");
    if (meta) {
      const date = saved.updatedAt ? new Date(saved.updatedAt).toLocaleString("fr-FR") : "date inconnue";
      const nodes = (saved.map && saved.map.nodes && saved.map.nodes.length) || 0;
      meta.textContent = `Dernière sauvegarde : ${date} · ${nodes} nœud(s) dans la carte.`;
    }
    $("#resumeButton").addEventListener("click", () => {
      $("#resumeDialog").close();
      toast("Travail repris.");
    });
    $("#restartButton").addEventListener("click", async () => {
      $("#resumeDialog").close();
      await resetActivity(false);
    });
    $("#resumeDialog").addEventListener("cancel", (event) => event.preventDefault());
    $("#resumeDialog").showModal();
  } else {
    state = defaultState();
    renderAll();
    setSaveStatus("Prêt.", "");
  }
}

init();
