import {
  META,
  BRIEFING,
  DOSSIERS,
  MECHANISMS,
  SORT_COLUMNS,
  SORT_ITEMS,
  GLOSSARY,
  BIBLIOGRAPHY,
  CONTROL_MODE,
  EVALUATION
} from "./content.js";
import { CATEGORIES, initMap, setMapData, buildFromSort, toSVG, toSVGFromData, undo, redo, zoomIn, zoomOut, fitView, addNode, startLink } from "./map.js";
import { saveState, loadState, clearState } from "./storage.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const STEP_LABELS = ["Briefing", "Enquête", "Mécanismes", "Comparer", "Carte", "Vérifier", "Correction"];
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

function emptyMember() {
  return { firstName: "", lastName: "" };
}

function defaultState() {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    studentName: "",
    group: {
      className: "",
      members: [emptyMember(), emptyMember()]
    },
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
  merged.step = clamp(Number(merged.step) || 0, 0, 6);
  merged.studentName = String(merged.studentName || "");
  merged.conclusion = String(merged.conclusion || "");
  if (raw.group && Array.isArray(raw.group.members)) {
    const members = raw.group.members
      .slice(0, 2)
      .map((member) => ({
        firstName: String(member.firstName || ""),
        lastName: String(member.lastName || "")
      }));
    while (members.length < 2) members.push(emptyMember());
    merged.group = { className: String(raw.group.className || ""), members };
  } else {
    const legacy = String(raw.studentName || "").trim();
    const parts = legacy.split(/\s+/).filter(Boolean);
    const members = [emptyMember(), emptyMember()];
    if (legacy) {
      members[0] = {
        firstName: parts[0] || "",
        lastName: parts.slice(1).join(" ")
      };
    }
    merged.group = { className: "", members };
  }
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
      (raw.group && (raw.group.className || (raw.group.members || []).some((m) => m.firstName || m.lastName))) ||
      raw.conclusion ||
      (raw.map && Array.isArray(raw.map.nodes) && raw.map.nodes.length)
  );
}

function memberFullName(member) {
  return `${String(member.firstName || "").trim()} ${String(member.lastName || "").trim()}`.trim();
}

function identityComplete() {
  const group = state.group || { className: "", members: [] };
  const members = group.members || [];
  return (
    String(group.className || "").trim().length > 0 &&
    members.length === 2 &&
    members.every((member) => member.firstName.trim() && member.lastName.trim())
  );
}

function groupNames(group = state.group) {
  return (group?.members || [])
    .map(memberFullName)
    .filter(Boolean)
    .join(", ");
}

function groupSummary() {
  const group = state.group || { className: "", members: [] };
  const count = (group.members || []).length;
  const className = String(group.className || "").trim();
  if (!className && !groupNames()) return "Identité à compléter";
  return `${className || "Classe ?"} · ${count} élève${count > 1 ? "s" : ""}`;
}

function answeredQuestionCount() {
  let total = 0;
  let answered = 0;
  for (const dossier of DOSSIERS) {
    const answers = state.dossiers[dossier.id]?.answers || {};
    for (const question of dossier.questions) {
      total += 1;
      if (String(answers[question.id] || "").trim()) answered += 1;
    }
  }
  return { total, answered };
}

function allDossierQuestionsAnswered() {
  const { total, answered } = answeredQuestionCount();
  return total > 0 && answered === total;
}

function allMechanismsChosen() {
  return MECHANISMS.every((m) => Boolean(state.mechanisms[m.id]?.choice));
}

function allSortPlaced() {
  return SORT_ITEMS.every((item) => Boolean(state.sort[item.id]));
}

function mapCreated() {
  const nodes = state.map?.nodes || [];
  const links = state.map?.links || [];
  return nodes.some((n) => n.category === "central") && nodes.length >= 5 && links.length >= 4;
}

function conclusionComplete() {
  return countSentences(state.conclusion) >= 3 && String(state.conclusion || "").trim().length >= 120;
}

function exportStatus() {
  const identity = identityComplete();
  const questions = allDossierQuestionsAnswered();
  const mechanisms = allMechanismsChosen();
  const sort = allSortPlaced();
  const map = mapCreated();
  const conclusion = conclusionComplete();
  const { total, answered } = answeredQuestionCount();
  const nodes = state.map?.nodes || [];
  const count = (cat) => nodes.filter((n) => n.category === cat).length;
  const sources = nodes.filter((n) => String(n.source || "").trim()).length;

  const missing = [];
  if (!identity) missing.push("Renseigne la classe et les prénoms/noms des deux élèves du binôme.");
  if (!questions) missing.push(`Réponds aux questions des dossiers (${answered}/${total}).`);
  if (!mechanisms) missing.push(`Classe les ${MECHANISMS.length} mécanismes dans la boîte à outils.`);
  if (!sort) missing.push(`Place les ${SORT_ITEMS.length} éléments du tri.`);
  if (!map) missing.push("Crée la carte mentale à partir de ton tri.");
  if (!conclusion) missing.push("Rédige une conclusion de 3 phrases minimum.");

  const warnings = [];
  if (map) {
    if (count("commun") < 3) warnings.push("Ajoute au moins 3 points communs.");
    if (count("urss") < 3) warnings.push("Ajoute au moins 3 éléments propres à l'URSS.");
    if (count("allemagne") < 3) warnings.push("Ajoute au moins 3 éléments propres à l'Allemagne nazie.");
    if (sources < 5) warnings.push("Indique une source sur au moins 5 nœuds.");
  }

  return {
    identity,
    questions,
    mechanisms,
    sort,
    map,
    conclusion,
    blocking: identity && questions && mechanisms && sort && map && conclusion,
    missing,
    warnings
  };
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
  $("#briefingIntro").innerHTML = BRIEFING.intro.map((paragraph) => `<p>${esc(paragraph)}</p>`).join("");
  $("#briefingSteps").innerHTML = BRIEFING.steps.map((step) => `<li>${esc(step)}</li>`).join("");
  $("#briefingRules").textContent = BRIEFING.rules;
  $("#briefingWarning").textContent = BRIEFING.warning;
  $("#briefingMethod").textContent = BRIEFING.method;
  $("#objectivesList").innerHTML = BRIEFING.objectives.map((o) => `<li>${esc(o)}</li>`).join("");
}

function renderMemberList() {
  const list = $("#memberList");
  if (!list) return;
  const members = state.group.members;
  list.innerHTML = members
    .map(
      (member, index) => `<div class="member-row">
        <span class="member-number" aria-hidden="true">${index + 1}</span>
        <label class="member-field">
          <span class="sr-only">Prénom de l'élève ${index + 1}</span>
          <input type="text" data-member-index="${index}" data-member-field="firstName" value="${esc(member.firstName)}" maxlength="30" placeholder="Prénom" autocomplete="off" />
        </label>
        <label class="member-field">
          <span class="sr-only">Nom de l'élève ${index + 1}</span>
          <input type="text" data-member-index="${index}" data-member-field="lastName" value="${esc(member.lastName)}" maxlength="30" placeholder="Nom" autocomplete="off" />
        </label>
        ${
          members.length > 3
            ? `<button type="button" class="member-remove" data-remove-member="${index}" aria-label="Retirer l'élève ${index + 1}">×</button>`
            : ""
        }
      </div>`
    )
    .join("");
}

function renderIdentitySummary() {
  const summary = $("#identitySummary");
  const warning = $("#identityWarning");
  const hint = $("#memberHint");
  const add = $("#addMember");
  const panel = $("#identityPanel");
  const complete = identityComplete();
  if (summary) summary.textContent = groupSummary();
  if (warning) warning.hidden = complete;
  if (hint) hint.textContent = "Binôme · 2 élèves";
  if (add) add.disabled = true;
  if (panel) panel.classList.toggle("is-incomplete", !complete);
  const classInput = $("#className");
  if (classInput && document.activeElement !== classInput) classInput.value = state.group.className || "";
}

function renderIdentity() {
  renderMemberList();
  renderIdentitySummary();
}

function bindIdentity() {
  const classInput = $("#className");
  if (classInput) {
    classInput.addEventListener("input", () => {
      state.group.className = classInput.value;
      renderIdentitySummary();
      updateChecklist();
      renderExportGate();
      scheduleSave();
    });
  }

  const list = $("#memberList");
  if (list) {
    list.addEventListener("input", (event) => {
      const index = Number(event.target.dataset.memberIndex);
      const field = event.target.dataset.memberField;
      if (!Number.isInteger(index) || !field || !state.group.members[index]) return;
      state.group.members[index][field] = event.target.value;
      renderIdentitySummary();
      updateChecklist();
      renderExportGate();
      scheduleSave();
    });
    list.addEventListener("click", (event) => {
      const remove = event.target.closest("[data-remove-member]");
      if (!remove) return;
      const index = Number(remove.dataset.removeMember);
      if (state.group.members.length <= 3) return;
      state.group.members.splice(index, 1);
      renderIdentity();
      updateChecklist();
      renderExportGate();
      scheduleSave();
    });
  }

  const add = $("#addMember");
  if (add) {
    add.addEventListener("click", () => {
      if (state.group.members.length >= 6) return;
      state.group.members.push(emptyMember());
      renderIdentity();
      const last = $("#memberList").lastElementChild;
      const firstInput = last ? last.querySelector("input") : null;
      if (firstInput) firstInput.focus();
      updateChecklist();
      renderExportGate();
      scheduleSave();
    });
  }
}

function renderDossiers() {
  const grid = $("#dossierGrid");
  if (!grid) return;
  grid.innerHTML = DOSSIERS.map((d) => {
    const progress = state.dossiers[d.id] || {};
    const answers = progress.answers || {};
    const answered = Object.values(answers).filter((v) => String(v || "").trim().length > 0).length;
    const done = Boolean(progress.done);
    return `<article class="dossier-card dossier-pocket regime-${esc(d.regimeClass)}">
      <span class="paperclip" aria-hidden="true"></span>
      <span class="dossier-stamp" aria-hidden="true">TOP SECRET</span>
      <span class="dossier-tab">Dossier ${String(d.number).padStart(2, "0")}</span>
      <span class="dossier-sticker">${esc(d.regime)}</span>
      <div class="dossier-label">
        <p class="dossier-hand">Pièce n° ${String(d.number).padStart(2, "0")} — à examiner</p>
        <h3>${esc(d.title)}</h3>
        <p class="dossier-type">${esc(d.type)}</p>
        <p class="dossier-date">${esc(d.date)}</p>
      </div>
      <div class="dossier-foot">
        <span class="dossier-count">${d.texts.length} extraits</span>
        <span class="dossier-count">${answered}/${d.questions.length} réponses</span>
        <span class="dossier-count ${done ? "is-done" : ""}">${done ? "Terminé" : "À ouvrir"}</span>
      </div>
      <button type="button" class="dossier-open" data-dossier="${esc(d.id)}" aria-label="Ouvrir la pochette ${esc(d.title)}">${done ? "Rouvrir la pochette" : "Ouvrir la pochette"}</button>
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
      (q, index) => `<div class="question" data-question="${esc(q.id)}">
        <label for="answer-${esc(q.id)}"><span class="question-number">Question ${index + 1}</span> ${esc(q.prompt)}</label>
        <textarea id="answer-${esc(q.id)}" data-qid="${esc(q.id)}" rows="3" maxlength="700" placeholder="${esc(q.placeholder || "Note ce que tu observes...")}">${esc(answers[q.id] || "")}</textarea>
        ${
          CONTROL_MODE
            ? ""
            : `<button type="button" class="text-button" data-hint="${esc(q.id)}" aria-expanded="false" aria-controls="hint-${esc(q.id)}">Voir une piste</button>
               <p class="hint" id="hint-${esc(q.id)}" hidden>${esc(q.hint)}</p>`
        }
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
    ${
      CONTROL_MODE
        ? ""
        : `<div class="takeaway-block">
            <button type="button" class="button secondary small" data-takeaway aria-expanded="false" aria-controls="takeaway-${esc(dossier.id)}">Afficher la synthèse du dossier</button>
            <div id="takeaway-${esc(dossier.id)}" class="takeaway" hidden>
              <p>${esc(dossier.takeaway)}</p>
            </div>
          </div>`
    }
    <h3 class="questions-title">Réponds aux questions</h3>
    <p class="muted">${CONTROL_MODE ? "Réponds avec tes mots, sans aide." : "Réponds avec tes mots. Une piste n'est pas la réponse : elle indique où chercher."}</p>
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
    updateChecklist();
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
  const icons = ["◉", "⚑", "⌘", "▣", "✉", "⚒", "☍", "◈", "✶"];
  const chosenCount = MECHANISMS.filter((m) => Boolean(state.mechanisms[m.id]?.choice)).length;
  list.innerHTML = `
    <div class="toolbox-head">
      <div>
        <p class="kicker">Boîte à outils</p>
        <h3>Les mécanismes du pouvoir</h3>
        <p>Classe chaque outil dans le ou les régimes concernés. Tu peux revenir sur tes choix.</p>
      </div>
      <div class="toolbox-progress">
        <strong id="toolboxProgress">${chosenCount}/${MECHANISMS.length}</strong>
        <span>outils classés</span>
      </div>
    </div>
    <div class="toolbox-grid">
      ${MECHANISMS.map((m, index) => {
        const saved = state.mechanisms[m.id] || {};
        const choice = saved.choice || "";
        const checked = Boolean(saved.checked && choice);
        const correct = checked && choice === m.answer;
        return `<article class="mechanism tool-card" data-mechanism="${esc(m.id)}">
          <div class="tool-card-top">
            <span class="tool-number">Outil ${String(index + 1).padStart(2, "0")}</span>
            <span class="tool-icon" aria-hidden="true">${icons[index] || "◆"}</span>
          </div>
          <p class="mechanism-label">${esc(m.label)}</p>
          <div class="segmented stamp-choices" role="radiogroup" aria-label="${esc(m.label)}">
            ${choices
              .map(
                (c) =>
                  `<button type="button" role="radio" aria-checked="${choice === c.id}" class="${choice === c.id ? "is-chosen" : ""}" data-choice="${c.id}">${esc(c.label)}</button>`
              )
              .join("")}
          </div>
          ${
            CONTROL_MODE
              ? ""
              : `<div class="mechanism-footer">
                  <button type="button" class="button secondary small" data-check="${esc(m.id)}">Vérifier</button>
                  <div class="feedback ${checked ? (correct ? "is-correct" : "is-wrong") : ""}" ${checked ? "" : "hidden"}>
                    <p><strong>${correct ? "Cela correspond." : "À revoir."}</strong> ${esc(m.feedback)}</p>
                    <p class="muted">Réponse attendue : ${esc(
                      m.answer === "both" ? "les deux régimes" : m.answer === "urss" ? "l'URSS de Staline" : "l'Allemagne nazie"
                    )}</p>
                  </div>
                </div>`
          }
        </article>`;
      }).join("")}
    </div>`;
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
      const chosen = MECHANISMS.filter((m) => Boolean(state.mechanisms[m.id]?.choice)).length;
      const progress = $("#toolboxProgress");
      if (progress) progress.textContent = `${chosen}/${MECHANISMS.length}`;
      scheduleSave();
      updateChecklist();
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
        ${col.stamp ? `<span class="column-stamp" aria-hidden="true">${esc(col.stamp)}</span>` : ""}
        <p>${esc(col.hint)}</p>
      </div>
      <div class="sort-items">
        ${
          items.length
            ? items
                .map((item) => {
                  const checked = !CONTROL_MODE && state.sortChecked;
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
      instruction.textContent = `Élément sélectionné : « ${item ? item.text : ""} ». Choisis une colonne.`;
    } else {
      instruction.textContent = "Aucun élément sélectionné. Touche un élément, puis une colonne.";
    }
  }
  updateMapEmpty();
  renderSortFeedback();
}

function renderSortFeedback() {
  const panel = $("#sortFeedback");
  if (!panel) return;
  if (CONTROL_MODE) {
    panel.innerHTML = "";
    return;
  }
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
  updateChecklist();
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
      updateChecklist();
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
    if (CONTROL_MODE) return;
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
    updateChecklist();
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
  const { total, answered } = answeredQuestionCount();
  return [
    {
      id: "identity",
      ok: identityComplete(),
      label: "L'identité du binôme est complète (classe + 2 noms).",
      tip: "Ouvre « Identité du groupe » en haut à droite."
    },
    {
      id: "questions",
      ok: allDossierQuestionsAnswered(),
      label: `Toutes les questions sont répondues (${answered}/${total}).`,
      tip: "Ouvre chaque dossier et complète les réponses."
    },
    {
      id: "mechanisms",
      ok: allMechanismsChosen(),
      label: `Les ${MECHANISMS.length} mécanismes sont classés.`,
      tip: "Utilise la boîte à outils de l'étape 3."
    },
    {
      id: "sort",
      ok: allSortPlaced(),
      label: `Les ${SORT_ITEMS.length} éléments du tri sont placés.`,
      tip: "Termine le tri de l'étape 4."
    },
    {
      id: "map",
      ok: mapCreated(),
      label: "La carte a été créée à partir du tri.",
      tip: "Utilise le bouton « Créer la carte à partir de mon tri »."
    },
    { id: "central", ok: nodes.some((n) => n.category === "central"), label: "Un sujet central est présent.", tip: "La carte doit partir du sujet central." },
    { id: "commun", ok: count("commun") >= 3, label: "Au moins 3 points communs.", tip: "Pense au parti unique, à la propagande, à la police politique." },
    { id: "urss", ok: count("urss") >= 3, label: "Au moins 3 éléments propres à l'URSS.", tip: "Collectivisation, plans, Goulag, Grande Terreur..." },
    { id: "allemagne", ok: count("allemagne") >= 3, label: "Au moins 3 éléments propres à l'Allemagne nazie.", tip: "Lois de Nuremberg, autarcie, réarmement, Führer..." },
    { id: "sources", ok: sources >= 5, label: "Au moins 5 nœuds ont une source.", tip: "Indique le dossier ou le document dans le champ « Source »." },
    { id: "links", ok: links.length >= 4, label: "Au moins 4 liens relient les idées.", tip: "Relie les branches au sujet central, puis les exemples aux branches." },
    { id: "conclusion", ok: conclusionOk, label: "La conclusion fait au moins 3 phrases.", tip: "Rédige 3 à 5 phrases dans l'étape Vérifier." },
    {
      id: "nuance",
      ok: Boolean(state.checklistManual.nuance),
      label: "J'ai relu les éléments « à vérifier / à nuancer ».",
      tip: "Vérifie que tu peux expliquer pourquoi une affirmation est fausse, imprécise ou de la propagande."
    }
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
      .map((item) => {
        const tip = CONTROL_MODE ? "" : item.tip;
        return `<li class="${item.ok ? "is-ok" : "is-todo"}" data-check-id="${esc(item.id)}">
            <span class="check-icon" aria-hidden="true">${item.ok ? "✓" : "○"}</span>
            <span class="check-body"><strong>${esc(item.label)}</strong>${tip && !item.ok ? `<span class="check-tip">${esc(tip)}</span>` : ""}</span>
            ${
              item.id === "nuance"
                ? `<input type="checkbox" id="manualNuance" ${manual ? "checked" : ""} aria-label="J'ai relu les éléments à vérifier ou à nuancer" />`
                : ""
            }
          </li>`;
      })
      .join("") +
    `<li class="check-summary">${
      okCount === items.length
        ? "Tous les critères sont remplis. Relis une dernière fois avant l'export."
        : `${okCount} critère(s) sur ${items.length} rempli(s).`
    }</li>`;
}

function updateChecklist() {
  const list = $("#checklist");
  if (!list) return;
  renderChecklist();
  renderExportGate();
}

function renderExportGate() {
  const status = exportStatus();
  const button = $("#previewButton");
  if (button) {
    button.disabled = !status.blocking;
    button.setAttribute("aria-disabled", String(!status.blocking));
    button.title = status.blocking
      ? "Exporter le dossier en PDF"
      : "Complète les éléments manquants avant d'exporter.";
  }
  const gate = $("#exportGate");
  const sendButton = $("#sendTeacherButton");
  if (sendButton) {
    sendButton.disabled = !status.blocking;
    sendButton.title = status.blocking
      ? "Envoyer le travail au professeur"
      : "Complète les éléments manquants avant l'envoi.";
  }
  if (!gate) return;
  const missing = status.missing.length
    ? `<div class="gate-block"><p class="gate-title">Pour débloquer l'export</p><ul>${status.missing
        .map((item) => `<li>${esc(item)}</li>`)
        .join("")}</ul></div>`
    : `<p class="gate-ok">Le dossier est complet : tu peux exporter.</p>`;
  const warnings = status.warnings.length
    ? `<div class="gate-block gate-warn"><p class="gate-title">Pour améliorer la carte</p><ul>${status.warnings
        .map((item) => `<li>${esc(item)}</li>`)
        .join("")}</ul></div>`
    : "";
  gate.innerHTML = missing + warnings;
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
  if (state.step === 6) renderCorrectionPage();
}

function goToStep(step, focus = true) {
  const next = clamp(Number(step) || 0, 0, 6);
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
  const total = SORT_ITEMS.length;
  const placed = SORT_ITEMS.filter((item) => Boolean(state.sort[item.id])).length;
  const button = $("#mapFromSort");
  const progress = $("#mapSortProgress");
  if (button) button.disabled = placed < total;
  if (progress) progress.textContent = `${placed} / ${total} éléments triés`;
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

  $("#mapFromSort").addEventListener("click", () => buildFromSort(state.sort, SORT_ITEMS));

  const outlinePanel = $("#mapOutlinePanel");
  const outlineButton = $("#mapOutlineToggle");
  outlineButton.addEventListener("click", () => {
    outlinePanel.open = !outlinePanel.open;
    outlineButton.setAttribute("aria-pressed", String(outlinePanel.open));
    if (outlinePanel.open) outlinePanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
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

function answerText(value) {
  const text = String(value || "").trim();
  return text ? esc(text).replace(/\n/g, "<br>") : '<span class="print-empty">Non répondu.</span>';
}

function buildAnswersHTML() {
  return DOSSIERS.map((d) => {
    const answers = (state.dossiers[d.id] && state.dossiers[d.id].answers) || {};
    return `<section class="print-answers-group">
      <h3>Dossier ${d.number} — ${esc(d.title)} <span>· ${esc(d.regime)}</span></h3>
      <ol>
        ${d.questions
          .map(
            (q) => `<li>
              <p class="print-question">${esc(q.prompt)}</p>
              <p class="print-answer">${answerText(answers[q.id])}</p>
            </li>`
          )
          .join("")}
      </ol>
    </section>`;
  }).join("");
}

function buildMechanismsHTML() {
  const labels = { urss: "URSS de Staline", allemagne: "Allemagne nazie", both: "Les deux" };
  return `<ol class="print-choice-list">
    ${MECHANISMS.map((m) => {
      const choice = (state.mechanisms[m.id] && state.mechanisms[m.id].choice) || "";
      return `<li><span class="print-choice-q">${esc(m.label)}</span><span class="print-choice-a">${esc(labels[choice] || "Non répondu")}</span></li>`;
    }).join("")}
  </ol>`;
}

function buildSortHTML() {
  return `<ol class="print-choice-list">
    ${SORT_ITEMS.map((item) => {
      const column = state.sort[item.id];
      const label = column ? SORT_COLUMNS.find((c) => c.id === column)?.label || column : "Non placé";
      return `<li><span class="print-choice-q">${esc(item.text)}</span><span class="print-choice-a">${esc(label)}</span></li>`;
    }).join("")}
  </ol>`;
}

function buildPrintDoc() {
  const nodes = (state.map && state.map.nodes) || [];
  const names = groupNames() || "Groupe";
  const className = String(state.group.className || "").trim() || "Classe non renseignée";
  const date = new Date().toLocaleDateString("fr-FR");
  const svg = nodes.length ? toSVG() : "";
  const answersHtml = buildAnswersHTML();
  const mechanismsHtml = buildMechanismsHTML();
  const sortHtml = buildSortHTML();
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
      <p class="print-kicker">Contrôle d'histoire · ${esc(META.level)}</p>
      <h1>Dossier de contrôle : l'URSS de Staline et l'Allemagne nazie</h1>
      <p class="print-meta">Groupe : <strong>${esc(names)}</strong></p>
      <p class="print-meta">Classe : <strong>${esc(className)}</strong> · Date : ${esc(date)}</p>
    </header>

    <section class="print-section print-answers-section">
      <h2>Réponses de l'élève</h2>
      <p class="print-note">Réponses saisies dans l'application, reproduites sans correction automatique.</p>
      <h3 class="print-subtitle">Questions d'enquête</h3>
      ${answersHtml}
      <h3 class="print-subtitle">Mécanismes</h3>
      ${mechanismsHtml}
      <h3 class="print-subtitle">Tri comparatif</h3>
      ${sortHtml}
    </section>

    <section class="print-map-page">
      <header class="print-map-head">
        <p class="print-kicker">Carte mentale du groupe</p>
        <h1>URSS de Staline / Allemagne nazie</h1>
        <p class="print-meta">Groupe : <strong>${esc(names)}</strong> · Classe : <strong>${esc(className)}</strong></p>
        <div class="print-legend">${legend}</div>
      </header>
      ${svg ? `<div class="print-map-landscape">${svg}</div>` : `<p class="print-empty">La carte n'est pas encore commencée.</p>`}
      <p class="print-note">Carte réalisée par le groupe, dans la disposition qu'il a choisie. Les sources de chaque nœud sont détaillées page suivante.</p>
    </section>

    <section class="print-section print-detail-section">
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
      <p>Dossier de contrôle réalisé le ${esc(date)}. Les réponses de l'élève sont reproduites telles quelles ; les sources sont citées.</p>
    </footer>
  </div>`;
}

function openPreview() {
  const status = exportStatus();
  if (!status.blocking) {
    toast("Complète d'abord l'identité, les questions et les étapes du dossier.");
    return;
  }
  const html = buildPrintDoc();
  const printDoc = $("#printDoc");
  const previewBody = $("#previewBody");
  if (printDoc) printDoc.innerHTML = html;
  if (previewBody) previewBody.innerHTML = html;
  const dialog = $("#previewDialog");
  if (dialog) dialog.showModal();
}

function printCurrent() {
  if (!exportStatus().blocking) {
    toast("Le dossier doit être complet avant l'impression.");
    return;
  }
  const previousTitle = document.title;
  const className = String(state.group.className || "").trim() || "groupe";
  const date = new Date().toISOString().slice(0, 10);
  const dialog = $("#previewDialog");
  const wasOpen = Boolean(dialog && dialog.open);
  if (wasOpen) dialog.close();
  document.title = `Dossier de controle ${className} — ${date}`;
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
  const className = String(state.group.className || "").trim() || "groupe";
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sauvegarde-enquete-${slugify(className)}-${date}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("Sauvegarde téléchargée. Garde ce fichier pour pouvoir reprendre ailleurs.");
}

const CORRECTIONS_KEY = "enquete-corrections-v1";
let currentCorrectionId = null;
let pendingSubmission = null;

function formatPoints(value) {
  return Number(value).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    return false;
  }
}

function bytesToBase64Url(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value) {
  const clean = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = clean + "===".slice((clean.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const QUESTION_IDS = DOSSIERS.flatMap((dossier) => dossier.questions.map((question) => question.id));
const MECHANISM_IDS = MECHANISMS.map((mechanism) => mechanism.id);
const SORT_IDS = SORT_ITEMS.map((item) => item.id);
const MECHANISM_CODES = { urss: "u", allemagne: "a", both: "b" };
const MECHANISM_FROM_CODE = { u: "urss", a: "allemagne", b: "both" };
const COLUMN_CODES = { commun: "c", urss: "u", allemagne: "a", nuance: "n" };
const COLUMN_FROM_CODE = { c: "commun", u: "urss", a: "allemagne", n: "nuance" };

/** Forme compacte : réduit le lien de correction sans rien perdre du contenu. */
function compactSubmission(submission) {
  const answers = QUESTION_IDS.map((questionId) => {
    const dossier = DOSSIERS.find((d) => d.questions.some((q) => q.id === questionId));
    return String(submission.dossiers?.[dossier.id]?.answers?.[questionId] || "");
  });
  const mechanisms = MECHANISM_IDS.map((id) => MECHANISM_CODES[submission.mechanisms?.[id]?.choice] || "").join("");
  const sort = SORT_IDS.map((id) => COLUMN_CODES[submission.sort?.[id]] || "").join("");
  const nodes = (submission.map?.nodes || []).map((node) => [
    node.id,
    node.category,
    Math.round(Number(node.x) || 0),
    Math.round(Number(node.y) || 0),
    Math.round(Number(node.w) || 0),
    Math.round(Number(node.h) || 0),
    node.shape || "rounded",
    node.title || "",
    node.note || "",
    node.source || "",
    node.sourceUrl || ""
  ]);
  const links = (submission.map?.links || []).map((link) => [link.from, link.to, link.label || ""]);
  return {
    v: 2,
    id: submission.id,
    at: submission.submittedAt,
    g: [
      submission.group?.className || "",
      (submission.group?.members || []).map((member) => [member.firstName || "", member.lastName || ""])
    ],
    a: answers,
    m: mechanisms,
    s: sort,
    n: nodes,
    l: links,
    c: submission.conclusion || ""
  };
}

function expandSubmission(payload) {
  if (payload && payload.version === 1) return payload;
  if (!payload || payload.v !== 2) throw new Error("Format de copie inconnu");
  const dossiers = {};
  DOSSIERS.forEach((dossier) => {
    const answers = {};
    dossier.questions.forEach((question) => {
      const index = QUESTION_IDS.indexOf(question.id);
      answers[question.id] = payload.a?.[index] || "";
    });
    dossiers[dossier.id] = { answers };
  });
  const mechanisms = {};
  MECHANISM_IDS.forEach((id, index) => {
    const choice = MECHANISM_FROM_CODE[payload.m?.[index]] || "";
    mechanisms[id] = { choice };
  });
  const sort = {};
  SORT_IDS.forEach((id, index) => {
    const column = COLUMN_FROM_CODE[payload.s?.[index]] || "";
    if (column) sort[id] = column;
  });
  const nodes = (payload.n || []).map((row, index) => ({
    id: row[0] || `n-${index}`,
    category: row[1] || "commun",
    x: Number(row[2]) || 0,
    y: Number(row[3]) || 0,
    w: Number(row[4]) || undefined,
    h: Number(row[5]) || undefined,
    shape: row[6] || "rounded",
    title: row[7] || "Idée",
    note: row[8] || "",
    source: row[9] || "",
    sourceUrl: row[10] || ""
  }));
  const links = (payload.l || [])
    .filter((row) => row && row[0] && row[1])
    .map((row, index) => ({ id: `l-${index}`, from: row[0], to: row[1], label: row[2] || "" }));
  return {
    version: 1,
    id: payload.id,
    submittedAt: payload.at,
    group: {
      className: payload.g?.[0] || "",
      members: (payload.g?.[1] || []).map(([firstName, lastName]) => ({ firstName: firstName || "", lastName: lastName || "" }))
    },
    dossiers,
    mechanisms,
    sort,
    map: { nodes, links },
    conclusion: payload.c || ""
  };
}

async function encodeCopy(submission) {
  const json = JSON.stringify(compactSubmission(submission));
  if (typeof CompressionStream !== "undefined") {
    try {
      const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("deflate-raw"));
      const buffer = await new Response(stream).arrayBuffer();
      return "z" + bytesToBase64Url(new Uint8Array(buffer));
    } catch (_) {
      /* repli sans compression */
    }
  }
  return "j" + bytesToBase64Url(new TextEncoder().encode(json));
}

async function decodeCopy(input) {
  const clean = String(input || "").trim();
  if (!clean) throw new Error("Copie vide");
  const prefix = clean[0];
  const payload = clean.slice(1);
  let json = "";
  if (prefix === "z" && typeof DecompressionStream !== "undefined") {
    try {
      const bytes = base64UrlToBytes(payload);
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      json = await new Response(stream).text();
    } catch (_) {
      throw new Error("Compression illisible");
    }
  } else if (prefix === "j") {
    json = new TextDecoder().decode(base64UrlToBytes(payload));
  } else {
    try {
      JSON.parse(clean);
      json = clean;
    } catch (_) {
      json = new TextDecoder().decode(base64UrlToBytes(clean));
    }
  }
  const parsed = JSON.parse(json);
  const submission = expandSubmission(parsed);
  if (!submission || !submission.group || !submission.map) {
    throw new Error("Format de copie invalide");
  }
  return submission;
}

function extractCopyCode(input) {
  const value = String(input || "").trim();
  if (!value) return "";
  try {
    const url = new URL(value, window.location.href);
    const code = url.searchParams.get("copie");
    if (code) return code;
  } catch (_) {
    /* ce n'est pas une URL */
  }
  return value.replace(/\s+/g, "");
}

function buildSubmission() {
  return {
    version: 1,
    id: `copie-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    group: JSON.parse(JSON.stringify(state.group)),
    dossiers: JSON.parse(JSON.stringify(state.dossiers)),
    mechanisms: JSON.parse(JSON.stringify(state.mechanisms)),
    sort: { ...state.sort },
    map: JSON.parse(JSON.stringify(state.map)),
    conclusion: state.conclusion,
    submittedAt: new Date().toISOString()
  };
}

function loadCorrections() {
  try {
    return JSON.parse(localStorage.getItem(CORRECTIONS_KEY) || "{}");
  } catch (_) {
    return {};
  }
}

function saveCorrections(corrections) {
  try {
    localStorage.setItem(CORRECTIONS_KEY, JSON.stringify(corrections));
    return true;
  } catch (_) {
    toast("Mémoire locale pleine : exporte les notes et supprime d'anciennes copies.");
    return false;
  }
}

function totalForEntry(entry) {
  return Object.values(entry?.grades || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

function gradeInput(key, max, value) {
  const current = value === undefined || value === null || value === "" ? "" : Number(value);
  return `<label class="grade-field">Points
    <input type="number" class="grade-input" data-grade-key="${esc(key)}" data-max="${max}" min="0" max="${max}" step="0.25" value="${current}" />
    <span class="bareme">/ ${formatPoints(max)}</span>
  </label>`;
}

function renderCorrectionList() {
  const list = $("#correctionList");
  if (!list) return;
  const corrections = loadCorrections();
  const entries = Object.values(corrections).sort(
    (a, b) => new Date(b.submission.submittedAt).getTime() - new Date(a.submission.submittedAt).getTime()
  );
  if (!entries.length) {
    list.innerHTML = `<p class="muted">Aucune copie pour l'instant. Ouvre un lien reçu pour commencer.</p>`;
    return;
  }
  list.innerHTML = entries
    .map((entry, index) => {
      const sub = entry.submission;
      const names = groupNames(sub.group) || `Binôme ${index + 1}`;
      const className = String(sub.group.className || "").trim() || "Classe ?";
      const date = new Date(sub.submittedAt).toLocaleDateString("fr-FR");
      return `<div class="correction-list-item ${sub.id === currentCorrectionId ? "is-current" : ""}">
        <button type="button" class="correction-open" data-copy-id="${esc(sub.id)}">
          <strong>${esc(names)}</strong>
          <span>${esc(className)} · ${esc(date)}</span>
          <span class="correction-list-score">${formatPoints(totalForEntry(entry))} / 20</span>
        </button>
        <button type="button" class="correction-delete" data-delete-copy="${esc(sub.id)}" aria-label="Supprimer cette copie">×</button>
      </div>`;
    })
    .join("");
}

function renderCorrectionView() {
  const view = $("#correctionView");
  if (!view) return;
  const corrections = loadCorrections();
  const entry = currentCorrectionId ? corrections[currentCorrectionId] : null;
  if (!entry) {
    view.innerHTML = `<div class="correction-empty">
      <h3>Comment corriger ?</h3>
      <p>Le binôme t'envoie un lien. Ouvre-le ou colle-le dans le champ ci-dessus. La copie apparaît ici avec les réponses, le barème, ta case de points et la correction.</p>
      <p class="muted">Les copies et les notes sont enregistrées dans ce navigateur, sur cet appareil uniquement.</p>
    </div>`;
    return;
  }

  const sub = entry.submission;
  const grades = entry.grades || {};
  const names = groupNames(sub.group) || "Binôme";
  const className = String(sub.group.className || "").trim() || "Classe non renseignée";
  const date = new Date(sub.submittedAt).toLocaleString("fr-FR");
  let mapSvg = "";
  try {
    mapSvg = sub.map && sub.map.nodes && sub.map.nodes.length ? toSVGFromData(sub.map) : "";
  } catch (_) {
    mapSvg = "";
  }

  const questionsHtml = DOSSIERS.map((dossier) => {
    const answers = sub.dossiers?.[dossier.id]?.answers || {};
    return `<div class="correction-dossier">
      <h4>Dossier ${dossier.number} — ${esc(dossier.title)}</h4>
      ${dossier.questions
        .map((question) => {
          const answer = String(answers[question.id] || "").trim();
          const key = `q:${question.id}`;
          return `<article class="correction-item">
            <div class="correction-item-head">
              <span class="correction-label">Question</span>
              <span class="bareme">Barème : ${formatPoints(question.points)} pt</span>
            </div>
            <p class="correction-question">${esc(question.prompt)}</p>
            <div class="correction-answer"><span>Réponse du binôme</span><p>${answer ? esc(answer).replace(/\n/g, "<br>") : "Non répondu."}</p></div>
            <div class="correction-grade">${gradeInput(key, question.points, grades[key])}</div>
            <div class="correction-key"><span>Correction</span><p>${esc(question.correction || "Correction non renseignée.")}</p></div>
          </article>`;
        })
        .join("")}
    </div>`;
  }).join("");

  const mechanismLabels = { urss: "URSS de Staline", allemagne: "Allemagne nazie", both: "Les deux" };
  const mechanismsHtml = MECHANISMS.map((mechanism) => {
    const choice = sub.mechanisms?.[mechanism.id]?.choice;
    const key = `m:${mechanism.id}`;
    return `<article class="correction-item">
      <div class="correction-item-head"><span class="correction-label">Mécanisme</span><span class="bareme">Barème : ${formatPoints(mechanism.points)} pt</span></div>
      <p class="correction-question">${esc(mechanism.label)}</p>
      <div class="correction-answer"><span>Réponse du binôme</span><p>${esc(mechanismLabels[choice] || "Non répondu.")}</p></div>
      <div class="correction-grade">${gradeInput(key, mechanism.points, grades[key])}</div>
      <div class="correction-key"><span>Correction</span><p>${esc(mechanism.feedback)}</p></div>
    </article>`;
  }).join("");

  const sortHtml = SORT_ITEMS.map((item) => {
    const column = sub.sort?.[item.id];
    const columnLabel = SORT_COLUMNS.find((c) => c.id === column)?.label || "Non placé";
    const key = `s:${item.id}`;
    return `<article class="correction-item">
      <div class="correction-item-head"><span class="correction-label">Tri</span><span class="bareme">Barème : ${formatPoints(item.points)} pt</span></div>
      <p class="correction-question">${esc(item.text)}</p>
      <div class="correction-answer"><span>Placement du binôme</span><p>${esc(columnLabel)}</p></div>
      <div class="correction-grade">${gradeInput(key, item.points, grades[key])}</div>
      <div class="correction-key"><span>Correction</span><p>${esc(item.feedback)}</p></div>
    </article>`;
  }).join("");

  view.innerHTML = `<div class="correction-document">
    <header class="correction-head">
      <div>
        <p class="kicker">Copie reçue</p>
        <h3>${esc(names)}</h3>
        <p class="muted">${esc(className)} · ${esc(date)} · ${esc(sub.id)}</p>
      </div>
      <div class="correction-total"><strong id="correctionTotal">${formatPoints(totalForEntry(entry))}</strong><span>/ 20</span></div>
    </header>

    <section class="correction-block">
      <div class="correction-block-head"><h3>Carte mentale</h3><span class="bareme">Barème : ${formatPoints(EVALUATION.map.points)} pts</span></div>
      <div class="correction-map" role="button" tabindex="0" aria-label="Agrandir la carte mentale">${mapSvg || '<p class="muted">Carte non fournie.</p>'}</div>
      <p class="hint">Clique sur la carte pour l'agrandir (Échap pour fermer).</p>
      <div class="correction-grade">${gradeInput("map", EVALUATION.map.points, grades.map)}</div>
      <div class="correction-key"><span>Correction</span><p>${esc(EVALUATION.map.correction)}</p></div>
    </section>

    <section class="correction-block">
      <h3>Questions d'enquête</h3>
      ${questionsHtml}
    </section>

    <section class="correction-block">
      <h3>Boîte à outils — mécanismes</h3>
      ${mechanismsHtml}
    </section>

    <section class="correction-block">
      <h3>Tri comparatif</h3>
      ${sortHtml}
    </section>

    <section class="correction-block">
      <h3>Conclusion comparative</h3>
      <article class="correction-item">
        <div class="correction-item-head"><span class="correction-label">Conclusion</span><span class="bareme">Barème : ${formatPoints(EVALUATION.conclusion.points)} pts</span></div>
        <div class="correction-answer"><span>Réponse du binôme</span><p>${sub.conclusion ? esc(sub.conclusion).replace(/\n/g, "<br>") : "Non rédigée."}</p></div>
        <div class="correction-grade">${gradeInput("conclusion", EVALUATION.conclusion.points, grades.conclusion)}</div>
        <div class="correction-key"><span>Correction</span><p>${esc(EVALUATION.conclusion.correction)}</p></div>
      </article>
    </section>

    <div class="correction-total-line">
      <strong>Total : <span id="correctionTotalBottom">${formatPoints(totalForEntry(entry))}</span> / 20</strong>
      <button type="button" class="button secondary small" id="saveCorrectionButton">Enregistrer la correction</button>
    </div>
  </div>`;
}

function renderCorrectionPage() {
  renderCorrectionList();
  renderCorrectionView();
}

function openMapZoom(source) {
  const dialog = $("#mapZoomDialog");
  const body = $("#mapZoomBody");
  if (!dialog || !body) return;
  const svg = source.querySelector("svg");
  body.innerHTML = svg ? svg.outerHTML : "";
  if (!body.innerHTML) return;
  dialog.showModal();
}

function ingestSubmission(submission) {
  const corrections = loadCorrections();
  if (!submission.id) submission.id = `copie-${Date.now()}`;
  const existing = corrections[submission.id];
  corrections[submission.id] = {
    submission,
    grades: existing?.grades || {},
    updatedAt: Date.now()
  };
  saveCorrections(corrections);
  currentCorrectionId = submission.id;
  goToStep(6, false);
  renderCorrectionPage();
  const url = new URL(window.location.href);
  url.search = "";
  window.history.replaceState({}, "", url.toString());
}

async function openCorrectionFromCode(input) {
  const message = $("#correctionMessage");
  try {
    const code = extractCopyCode(input);
    const submission = await decodeCopy(code);
    ingestSubmission(submission);
    if (message) message.textContent = "Copie ouverte. Tu peux saisir les points.";
    const codeInput = $("#correctionCodeInput");
    if (codeInput) codeInput.value = "";
    toast("Copie ouverte.");
  } catch (_) {
    goToStep(6, false);
    renderCorrectionPage();
    if (message) message.textContent = "Lien ou code illisible. Vérifie qu'il a été copié en entier.";
    toast("Copie illisible.");
  }
}

async function openCorrectionFromFile(file) {
  const message = $("#correctionMessage");
  try {
    const text = await file.text();
    const submission = expandSubmission(JSON.parse(text));
    if (!submission || !submission.group || !submission.map) {
      throw new Error("format");
    }
    ingestSubmission(submission);
    if (message) message.textContent = "Copie ouverte. Tu peux saisir les points.";
    toast("Copie ouverte.");
  } catch (_) {
    if (message) message.textContent = "Fichier illisible : ce n'est pas une copie téléchargée depuis l'application.";
    toast("Fichier illisible.");
  }
}

async function openSendDialog() {
  const status = exportStatus();
  if (!status.blocking) {
    toast("Complète d'abord le dossier avant de l'envoyer.");
    return;
  }
  try {
    const submission = buildSubmission();
    const code = await encodeCopy(submission);
    const link = new URL(window.location.href);
    link.search = "?copie=" + encodeURIComponent(code);
    link.hash = "";
    pendingSubmission = submission;
    $("#sendLink").value = link.toString();
    $("#sendCode").value = code;
    $("#sendDialog").showModal();
  } catch (_) {
    toast("Impossible de préparer le lien de correction.");
  }
}

function exportGrades() {
  const corrections = loadCorrections();
  const entries = Object.values(corrections);
  if (!entries.length) {
    toast("Aucune copie à exporter.");
    return;
  }
  const questionKeys = DOSSIERS.flatMap((d) => d.questions.map((q) => `q:${q.id}`));
  const mechanismKeys = MECHANISMS.map((m) => `m:${m.id}`);
  const sortKeys = SORT_ITEMS.map((item) => `s:${item.id}`);
  const header = [
    "Classe",
    "Binôme",
    "Date",
    ...questionKeys.map((_, i) => `Q${i + 1}`),
    ...mechanismKeys.map((_, i) => `M${i + 1}`),
    ...sortKeys.map((_, i) => `S${i + 1}`),
    "Carte",
    "Conclusion",
    "Total",
    "Barème"
  ];
  const rows = entries
    .sort((a, b) => new Date(a.submission.submittedAt) - new Date(b.submission.submittedAt))
    .map((entry) => {
      const sub = entry.submission;
      const grades = entry.grades || {};
      return [
        String(sub.group.className || ""),
        groupNames(sub.group),
        new Date(sub.submittedAt).toLocaleString("fr-FR"),
        ...questionKeys.map((key) => grades[key] ?? ""),
        ...mechanismKeys.map((key) => grades[key] ?? ""),
        ...sortKeys.map((key) => grades[key] ?? ""),
        grades.map ?? "",
        grades.conclusion ?? "",
        formatPoints(totalForEntry(entry)),
        "20"
      ];
    });
  const csv = "\uFEFF" + [header, ...rows]
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(";"))
    .join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `notes-corrections-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("Notes exportées en CSV.");
}

function bindCorrection() {
  const sendButton = $("#sendTeacherButton");
  if (sendButton) sendButton.addEventListener("click", () => void openSendDialog());

  const openButton = $("#openCorrectionButton");
  if (openButton) {
    openButton.addEventListener("click", () => {
      const input = $("#correctionCodeInput");
      if (input) void openCorrectionFromCode(input.value);
    });
  }

  const exportButton = $("#exportGradesButton");
  if (exportButton) exportButton.addEventListener("click", exportGrades);

  const fileInput = $("#correctionFileInput");
  if (fileInput) {
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      if (file) void openCorrectionFromFile(file);
      fileInput.value = "";
    });
  }

  const list = $("#correctionList");
  if (list) {
    list.addEventListener("click", (event) => {
      const open = event.target.closest("[data-copy-id]");
      if (open) {
        currentCorrectionId = open.dataset.copyId;
        renderCorrectionList();
        renderCorrectionView();
        return;
      }
      const remove = event.target.closest("[data-delete-copy]");
      if (remove) {
        if (!window.confirm("Supprimer cette copie et ses notes de cet appareil ?")) return;
        const corrections = loadCorrections();
        delete corrections[remove.dataset.deleteCopy];
        saveCorrections(corrections);
        if (currentCorrectionId === remove.dataset.deleteCopy) currentCorrectionId = null;
        renderCorrectionPage();
      }
    });
  }

  const view = $("#correctionView");
  if (view) {
    view.addEventListener("input", (event) => {
      const input = event.target.closest("[data-grade-key]");
      if (!input || !currentCorrectionId) return;
      const max = Number(input.dataset.max) || 0;
      let value = Number(input.value);
      if (!Number.isFinite(value)) value = 0;
      value = clamp(value, 0, max);
      input.value = value;
      const corrections = loadCorrections();
      const entry = corrections[currentCorrectionId];
      if (!entry) return;
      entry.grades = { ...(entry.grades || {}), [input.dataset.gradeKey]: value };
      entry.updatedAt = Date.now();
      saveCorrections(corrections);
      const total = formatPoints(totalForEntry(entry));
      const top = $("#correctionTotal");
      const bottom = $("#correctionTotalBottom");
      if (top) top.textContent = total;
      if (bottom) bottom.textContent = total;
      renderCorrectionList();
    });
    view.addEventListener("click", (event) => {
      if (event.target.closest("#saveCorrectionButton")) {
        toast("Correction enregistrée sur cet appareil.");
        return;
      }
      const map = event.target.closest(".correction-map");
      if (map) openMapZoom(map);
    });
  }

  const copyLink = $("#copySendLink");
  if (copyLink) {
    copyLink.addEventListener("click", async () => {
      const text = $("#sendLink").value;
      const ok = await copyTextToClipboard(text);
      toast(ok ? "Lien copié. Envoie-le au professeur." : "Copie impossible : sélectionne le lien et copie-le à la main.");
    });
  }
  const copyCode = $("#copySendCode");
  if (copyCode) {
    copyCode.addEventListener("click", async () => {
      const text = $("#sendCode").value;
      const ok = await copyTextToClipboard(text);
      toast(ok ? "Code copié." : "Copie impossible : sélectionne le code et copie-le à la main.");
    });
  }
  const download = $("#downloadCopy");
  if (download) {
    download.addEventListener("click", () => {
      if (!pendingSubmission) return;
      const classSlug = slugify(pendingSubmission.group.className || "binome");
      const blob = new Blob([JSON.stringify(pendingSubmission, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `copie-${classSlug}-${pendingSubmission.id}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("Copie téléchargée.");
    });
  }
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
  renderIdentity();
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
  renderExportGate();
}

function bindStatic() {
  bindIdentity();

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
  bindCorrection();

  if (CONTROL_MODE) {
    const sortCheck = $("#sortCheck");
    if (sortCheck) sortCheck.hidden = true;
    const conclusionHint = $("#conclusionHint");
    if (conclusionHint) conclusionHint.hidden = true;
  }

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

  const copyParam = new URLSearchParams(window.location.search).get("copie");
  const saved = await loadState();
  if (saved && hasActivity(saved)) {
    state = normalizeState(saved);
    renderAll();
    if (copyParam) {
      await openCorrectionFromCode(copyParam);
      return;
    }
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
    if (copyParam) await openCorrectionFromCode(copyParam);
  }
}

init();
