import {
  META,
  BRIEFING,
  DOSSIERS,
  MECHANISMS,
  SORT_COLUMNS,
  SORT_ITEMS,
  GLOSSARY,
  BIBLIOGRAPHY,
  CONTROL_MODE
} from "./content.js";
import { CATEGORIES, initMap, setMapData, buildFromSort, toSVG, undo, redo, zoomIn, zoomOut, fitView, addNode, startLink } from "./map.js";
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
      members: [emptyMember(), emptyMember(), emptyMember()]
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
  merged.step = clamp(Number(merged.step) || 0, 0, 5);
  merged.studentName = String(merged.studentName || "");
  merged.conclusion = String(merged.conclusion || "");
  if (raw.group && Array.isArray(raw.group.members)) {
    const members = raw.group.members
      .slice(0, 6)
      .map((member) => ({
        firstName: String(member.firstName || ""),
        lastName: String(member.lastName || "")
      }));
    while (members.length < 3) members.push(emptyMember());
    merged.group = { className: String(raw.group.className || ""), members };
  } else {
    const legacy = String(raw.studentName || "").trim();
    const parts = legacy.split(/\s+/).filter(Boolean);
    const members = [emptyMember(), emptyMember(), emptyMember()];
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
    members.length >= 3 &&
    members.length <= 6 &&
    members.every((member) => member.firstName.trim() && member.lastName.trim())
  );
}

function groupNames() {
  return (state.group?.members || [])
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
  if (!identity) missing.push("Renseigne la classe et les prénoms/noms des 3 à 6 élèves.");
  if (!questions) missing.push(`Réponds aux questions des dossiers (${answered}/${total}).`);
  if (!mechanisms) missing.push("Classe les 9 mécanismes dans la boîte à outils.");
  if (!sort) missing.push("Place les 16 éléments du tri.");
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
  if (hint) hint.textContent = `3 à 6 élèves · ${state.group.members.length}`;
  if (add) add.disabled = state.group.members.length >= 6;
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
      label: "L'identité du groupe est complète (classe + 3 à 6 noms).",
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
      label: "Les 9 mécanismes sont classés.",
      tip: "Utilise la boîte à outils de l'étape 3."
    },
    {
      id: "sort",
      ok: allSortPlaced(),
      label: "Les 16 éléments du tri sont placés.",
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
