// Ponto de entrada: guarda o estado, desenha a tela da fase atual e roda o relógio do jogo.
import { DAY } from './data/constants.js';
import { advance, createState, currentPrediction, previewCorrection, previewDeparture } from './game/mission.js';
import { renderHangar } from './ui/hangar.js';
import { drawMap } from './ui/map.js';
import { formatDate, renderBriefing, renderFlight, renderPhysics, updateFlightText, updatePhysicsText } from './ui/panels.js';
import { renderReport } from './ui/report.js';

const PHASE_NAMES = {
  briefing: 'Briefing',
  hangar: 'Hangar',
  leo: 'Órbita baixa da Terra',
  cruise: 'Cruzeiro',
  encounter: 'Encontro com Marte',
  operations: 'Operações em Marte',
  report: 'Relatório',
};
const FLIGHT = ['leo', 'cruise', 'encounter', 'operations'];

const state = createState();
const ui = { stage: 0, dv: 3600, pg: 0, rad: 0, preview: null, prediction: null, previewT: null };
const main = document.getElementById('main');
const physics = document.getElementById('physics');

/** Toda ação do jogador passa por aqui: muda o estado e redesenha a tela. */
function act(change, rerender = true) {
  change(state, ui);
  refreshPredictions(true);
  if (rerender) render();
  else updateFlightText(state, ui);
}

function render() {
  document.getElementById('phase').textContent = PHASE_NAMES[state.phase];
  document.getElementById('clock').textContent = formatDate(state.t);
  main.replaceChildren(
    state.phase === 'briefing' ? renderBriefing(act)
      : state.phase === 'hangar' ? renderHangar(state, ui, act)
        : state.phase === 'report' ? renderReport(state, act)
          : renderFlight(state, ui, act));
  physics.replaceChildren(renderPhysics(state));
  updateFlightText(state, ui);
  main.focus({ preventScroll: true });
}

/** Recalcula as trajetórias previstas quando o tempo ou a manobra mudam. */
function refreshPredictions(force) {
  if (!force && ui.previewT === state.t) return;
  ui.previewT = state.t;
  ui.prediction = currentPrediction(state);
  if (state.phase === 'leo') ui.preview = previewDeparture(state, ui.dv);
  else if (state.phase === 'cruise' && (ui.pg !== 0 || ui.rad !== 0)) ui.preview = previewCorrection(state, ui.pg, ui.rad);
  else ui.preview = null;
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state.warp > 0 && (state.phase === 'leo' || state.phase === 'cruise')) {
    const phase = state.phase;
    const event = advance(state, state.warp * DAY * dt);
    refreshPredictions(false);
    if (event || state.phase !== phase) render();
    else {
      updateFlightText(state, ui);
      updatePhysicsText(state);
      document.getElementById('clock').textContent = formatDate(state.t);
    }
  }
  const canvas = document.getElementById('map');
  if (canvas && FLIGHT.includes(state.phase)) drawMap(canvas, state, state.view, ui.preview, ui.prediction);
  requestAnimationFrame(frame);
}

render();
requestAnimationFrame(frame);
