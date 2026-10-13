// Hangar de montagem: peças em cartas, pilha do foguete em SVG, tabela por estágio.
import { MISSION } from '../data/mission.js';
import { PROBE_PARTS, ROCKET_PARTS, probePart, rocketPart } from '../data/parts.js';
import { canLaunch, designStats, launch, validateDesign } from '../game/mission.js';
import { el, fmt } from './dom.js';

const CATEGORY = { core: 'Núcleo', power: 'Energia', comms: 'Comunicação', instrument: 'Instrumento', protection: 'Proteção' };
const SVG = 'http://www.w3.org/2000/svg';

function partCard(name, tag, lines, flavor, onClick, active) {
  return el('button', { class: `card${active ? ' active' : ''}`, type: 'button', onclick: onClick },
    el('span', { class: 'card-tag' }, tag),
    el('strong', {}, name),
    el('ul', {}, lines.map((l) => el('li', {}, l))),
    el('small', {}, flavor));
}

function rocketLines(p) {
  const lines = [`US$ ${p.cost} M · ${fmt(p.wet, 1)} t`];
  if (p.kind === 'tank') lines.push(`${fmt(p.wet - p.dry, 1)} t de propelente`);
  if (p.kind === 'engine') lines.push(`Isp ${p.isp} s · empuxo ${fmt(p.thrust)} kN`);
  return lines;
}

function probeLines(p) {
  const lines = [`US$ ${p.cost} M · ${p.mass} kg`];
  if (p.power > 0) lines.push(p.solar ? `+${p.power} W na Terra, +${fmt(p.power / 1.52371 ** 2)} W em Marte` : `+${p.power} W constantes`);
  if (p.power < 0) lines.push(`${p.power} W`);
  if (p.battery) lines.push(`Cobre ${p.battery} W de déficit`);
  if (p.rate) lines.push(`${p.rate} Gbit/turno a 1 UA da Terra`);
  if (p.science) lines.push(`+${p.science} ciência · ${fmt(p.data, 1)} Gbit por turno`);
  return lines;
}

function stackSvg(design) {
  const svg = document.createElementNS(SVG, 'svg');
  const blocks = [];
  design.probe.length && blocks.push({ h: 26, w: 40, color: '#facc15', label: 'Sonda' });
  for (let i = design.stages.length - 1; i >= 0; i--) {
    const parts = design.stages[i].map(rocketPart);
    if (!parts.length) continue;
    for (const p of parts.filter((x) => x.kind === 'tank')) {
      const size = { 'tank-s': [18, 34], 'tank-m': [30, 50], 'tank-l': [48, 66] }[p.id];
      blocks.push({ h: size[0], w: size[1], color: '#cbd5e1', label: '' });
    }
    const engines = parts.filter((x) => x.kind === 'engine').length;
    if (engines) blocks.push({ h: 16, w: 20 + engines * 14, color: '#f97316', label: `E${i + 1}` });
    if (i > 0) blocks.push({ h: 4, w: 60, color: '#64748b', label: '' });
  }
  const height = Math.max(120, blocks.reduce((s, b) => s + b.h, 0) + 10);
  svg.setAttribute('viewBox', `0 0 120 ${height}`);
  svg.setAttribute('class', 'stack');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Desenho do foguete montado');
  let y = 5;
  for (const b of blocks) {
    const rect = document.createElementNS(SVG, 'rect');
    Object.entries({ x: 60 - b.w / 2, y, width: b.w, height: b.h - 1, rx: 3, fill: b.color }).forEach(([k, v]) => rect.setAttribute(k, v));
    svg.append(rect);
    if (b.label) {
      const text = document.createElementNS(SVG, 'text');
      Object.entries({ x: 60, y: y + b.h / 2 + 4, 'text-anchor': 'middle', 'font-size': 9, fill: '#0f172a' }).forEach(([k, v]) => text.setAttribute(k, v));
      text.textContent = b.label;
      svg.append(text);
    }
    y += b.h;
  }
  return svg;
}

function bar(label, value, max, text, ok) {
  return el('div', { class: 'bar' },
    el('div', { class: 'bar-head' }, el('span', {}, label), el('span', { class: ok ? '' : 'bad' }, text)),
    el('div', { class: 'bar-track' }, el('div', { class: `bar-fill ${ok ? 'ok' : 'bad'}`, style: `width:${Math.min(100, (value / max) * 100)}%` })));
}

export function renderHangar(state, ui, act) {
  const { design } = state;
  const stats = designStats(design);
  const issues = validateDesign(design);
  const stageIndex = ui.stage;

  const usedStages = stats.rocket.stages.length;
  const table = el('table', { class: 'table' },
    el('thead', {}, el('tr', {}, ['Estágio', 'Massa total', 'Δv', 'TWR'].map((h) => el('th', {}, h)))),
    el('tbody', {}, stats.stages.map((s, i) => el('tr', {},
      el('td', {}, `${i + 1}${i === 0 ? ' (base)' : i === usedStages - 1 ? ' (topo)' : ''}`),
      el('td', {}, `${fmt(s.m0, 1)} t`),
      el('td', {}, `${fmt(s.deltaV)} m/s`),
      el('td', { class: i === 0 && s.twr < MISSION.minLiftoffTWR ? 'bad' : '' }, fmt(s.twr, 2))))));

  const stageTabs = el('div', { class: 'tabs', role: 'tablist' },
    [2, 1, 0].map((i) => el('button', { type: 'button', role: 'tab', 'aria-selected': String(i === stageIndex), class: i === stageIndex ? 'tab on' : 'tab', onclick: () => act((s, u) => (u.stage = i)) },
      `Estágio ${i + 1}${i === 0 ? ' (base)' : i === 2 ? ' (topo)' : ''} · ${design.stages[i].length} peças`)));

  const stageParts = el('div', { class: 'chips' },
    design.stages[stageIndex].length === 0 ? el('span', { class: 'muted' }, 'Estágio vazio: clique em tanques e motores abaixo.') : null,
    design.stages[stageIndex].map((id, k) => el('button', { type: 'button', class: 'chip', title: 'Remover', onclick: () => act((s) => s.design.stages[stageIndex].splice(k, 1)) }, `${rocketPart(id).name} ✕`)));

  const probeChips = el('div', { class: 'chips' },
    design.probe.map((id, k) => el('button', { type: 'button', class: 'chip gold', title: 'Remover', onclick: () => act((s) => s.design.probe.splice(k, 1)) }, `${probePart(id).name} ✕`)));

  return el('div', { class: 'hangar' },
    el('section', { class: 'catalog' },
      el('h2', {}, 'Foguete'),
      el('p', { class: 'muted' }, 'Escolha o estágio e clique nas peças. O estágio 1 decola; os de cima só funcionam no vácuo. Desacopladores são incluídos sozinhos.'),
      stageTabs,
      stageParts,
      el('div', { class: 'grid' }, ROCKET_PARTS.map((p) => partCard(p.name, p.kind === 'tank' ? 'Tanque' : 'Motor', rocketLines(p), p.flavor, () => act((s) => s.design.stages[stageIndex].push(p.id))))),
      el('h2', {}, 'Sonda'),
      probeChips,
      el('div', { class: 'grid' }, PROBE_PARTS.map((p) => {
        const has = design.probe.includes(p.id);
        return partCard(p.name, CATEGORY[p.category], probeLines(p), p.flavor, () => act((s) => {
          const n = s.design.probe.filter((id) => id === p.id).length;
          if (n >= (p.max ?? 1)) s.design.probe.splice(s.design.probe.lastIndexOf(p.id), 1);
          else s.design.probe.push(p.id);
        }), has);
      })),
      el('p', { class: 'muted' }, 'Números das peças são de balanceamento do jogo, inspirados em ordens de grandeza reais.')),
    el('aside', { class: 'summary' },
      stackSvg(design),
      bar('Δv total', stats.totalDeltaV, stats.requiredDeltaV, `${fmt(stats.totalDeltaV)} / ${fmt(stats.requiredDeltaV)} m/s`, stats.totalDeltaV >= stats.requiredDeltaV),
      bar('Orçamento', stats.cost, stats.budget, `US$ ${fmt(stats.cost)} / ${fmt(stats.budget)} M`, stats.cost <= stats.budget),
      bar('TWR na decolagem', stats.liftoffTWR, MISSION.minLiftoffTWR, fmt(stats.liftoffTWR, 2), stats.liftoffTWR >= MISSION.minLiftoffTWR),
      el('p', { class: 'muted' }, `Massa na plataforma: ${fmt(stats.totalMass, 1)} t · sonda: ${fmt(stats.probe.mass)} kg`),
      stats.stages.length ? table : null,
      el('h3', {}, 'Checklist'),
      issues.length
        ? el('ul', { class: 'issues' }, issues.map((i) => el('li', { class: i.severity }, `${i.severity === 'error' ? '✕' : '!'} ${i.message}`)))
        : el('p', { class: 'good' }, 'Tudo certo para lançar.'),
      el('div', { class: 'row' },
        el('button', { type: 'button', class: 'btn ghost', onclick: () => act((s) => (s.phase = 'briefing')) }, 'Voltar'),
        el('button', { type: 'button', class: 'btn primary', disabled: !canLaunch(issues), onclick: () => act((s) => launch(s)) }, 'Lançar'))));
}
