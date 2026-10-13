# ARQUITETURA — MISSION ARCHITECT (RPG DE CARTAS)

## 1. FLUXO
Entrada: `Contexto.md`. Saída: arquitetura e regras do jogo. Depois: `Desenvolvimento_guiado.md`.
Este arquivo é a **especificação das regras**. Se o código divergir dele, corrija o código ou atualize este arquivo com justificativa.

## 2. REQUISITOS DERIVADOS
**Funcionais:**
- F1. Escolher missão (MVP: só Vigia Vermelho) e 3 personagens de equipe.
- F2. Montar a nave com cartas: 1 lançador + componentes; barras de recursos atualizam ao vivo.
- F3. Validar a nave antes do lançamento, com mensagens que explicam cada violação.
- F4. Simular fases: lançamento → cruzeiro → chegada → operações, turno a turno.
- F5. A cada turno de voo: comprar evento, resolver teste d20, permitir jogar ações e habilidades.
- F6. Relatório final: resultado, estrelas, score, gráfico por turno e explicações causais.
- F7 (P2). Modo "E se?": trocar uma carta e re-simular com a mesma seed.
**Técnicos:** roda 100% no navegador; engine puro TypeScript sem dependência de React; determinístico por seed.
**Dados NASA:** opcionais (P2), sempre com fallback local.
**Critérios que afetam arquitetura:** demo estável → engine determinístico e sem rede no MVP.
**Restrições:** ~48 h; sem backend obrigatório.

## 3. STACK
Next.js (App Router), React, TypeScript (strict), Tailwind CSS, Vitest. Ícones em SVG inline.
Sem bibliotecas de estado (usar `useReducer`). Framer Motion só em P3, se justificado.

## 4. ARQUITETURA
```text
UI (app/, components/)
 ↓
Application (hooks/useGame.ts: useReducer + máquina de fases)
 ↓
Game Engine puro (game/)
 ↓
Data (data/*.json) + Providers (services/, P2)
```
`game/` não importa nada de React, Next ou `services/`.

## 5. DOMÍNIO (types/game.ts)
```ts
type Category = 'power' | 'comms' | 'propulsion' | 'protection' | 'avionics' | 'instrument';
type TestKind = 'launch' | 'radiation' | 'micrometeoroid' | 'avionics' | 'power' | 'thermal' | 'propulsion';
type Phase = 'briefing' | 'design' | 'launch' | 'cruise' | 'arrival' | 'operations' | 'report';

interface Mission {
  id: string; name: string; briefing: string;
  distanceAU: number;          // distância média ao Sol
  budget: number;              // US$ M
  launcherKey: 'leo' | 'moon' | 'mars';
  requiredDeltaV: number;      // m/s exigidos na validação
  insertionDeltaV: number;     // m/s gastos na chegada
  cruiseTurns: number; operationsTurns: number;
  scienceTarget: number;
  requires: { minInstruments: number; categories: Category[] };
  difficultyMultiplier: number;
}

interface Launcher { id: string; name: string; cost: number; capacity: Record<'leo'|'moon'|'mars', number>; reliability: number; flavor: string; }

interface ComponentCard {
  id: string; name: string; category: Category;
  cost: number; mass: number;
  power: number;                 // W; >0 gera, <0 consome
  solar?: boolean;               // se true, power é a 1 UA e escala com 1/d²
  batteryW?: number;             // cobre déficit até X W por turno
  propellant?: number; isp?: number; extraCruiseTurns?: number; cruiseOnlyPower?: number;
  downlinkAt1AU?: number;        // Gbit/turno a 1 UA
  science?: number; data?: number; // por turno de operação
  testBonus?: Partial<Record<TestKind | 'all', number>>;
  tags: string[]; flavor: string;
}

interface CrewCard { id: string; name: string; passive: string; active: string; }
interface EventCard { id: string; name: string; phases: ('cruise'|'operations')[]; test?: TestKind; difficulty?: number; copies: number; text: string; }
interface ActionCard { id: string; name: string; copies: number; text: string; }

interface Design { launcherId?: string; componentIds: string[]; crewIds: string[]; }

interface ShipState {
  components: { id: string; active: boolean; damaged: boolean; offUntilTurn?: number }[];
  deltaV: number; buffer: { data: number; science: number };
  scienceDelivered: number; safeModeStreak: number; alive: boolean;
  modifiers: { id: string; untilTurn: number; effect: string }[];
}

interface MissionEvent { turn: number; phase: Phase; title: string; roll?: number; total?: number; difficulty?: number; success?: boolean; explanation: string; }

interface TurnSnapshot { turn: number; phase: Phase; generation: number; consumption: number; downlink: number; scienceDelivered: number; deltaV: number; }

interface MissionResult {
  outcome: 'success' | 'partial' | 'failure';
  stars: 0 | 1 | 2 | 3; score: number;
  scienceDelivered: number; budgetLeft: number;
  timeline: TurnSnapshot[]; log: MissionEvent[];
  lessons: string[];               // explicações causais em português
}
```

## 6. MISSÕES
Um engine, missões como dados (`data/missions.json`).

**MVP — Vigia Vermelho** (orbitador de Marte):
| Campo | Valor |
|---|---|
| distanceAU | 1,52 |
| budget | 800 |
| launcherKey | mars |
| requiredDeltaV | 2.000 |
| insertionDeltaV | 1.500 |
| cruiseTurns / operationsTurns | 4 / 6 |
| scienceTarget | 100 |
| requires | ≥ 1 instrumento; categorias power, comms, propulsion, avionics |
| difficultyMultiplier | 1,5 |

P2: Olho na Terra (1 UA, budget 300, leo, Δv 300/0, 1/6 turnos, alvo 60, mult 1,0); Sentinela Lunar (1 UA, budget 500, moon, Δv 1.200/800, 2/6, alvo 80, mult 1,2).

## 7. CARTAS DO MVP (data/*.json)
Todos os números são **balanceamento de jogo** (marcar `"gameBalance": true` nos JSON).

**Estrutura base da nave (sempre incluída, não é carta):** massa 300 kg, custo 100, consumo 150 W.

**Lançadores**
| id | Nome | Custo | LEO / Lua / Marte (kg) | reliability |
|---|---|---|---|---|
| launcher-light | Lançador Leve | 60 | 1.200 / 400 / 250 | 0 |
| launcher-medium | Lançador Médio | 150 | 20.000 / 5.000 / 4.000 | +2 |
| launcher-heavy | Lançador Pesado | 300 | 60.000 / 15.000 / 13.000 | +1 |

**Componentes**
| id | Cat. | Custo | Massa | Energia (W) | Outros |
|---|---|---|---|---|---|
| solar-small | power | 20 | 30 | +600 solar | |
| solar-large | power | 50 | 90 | +2.000 solar | |
| rtg | power | 120 | 45 | +110 | constante |
| battery | power | 10 | 25 | 0 | batteryW 300 |
| antenna-low | comms | 10 | 5 | −20 | downlink 4 |
| antenna-high | comms | 60 | 40 | −100 | downlink 30 |
| laser-optical | comms | 140 | 25 | −150 | downlink 80; testBonus all −1 |
| engine-chemical | propulsion | 40 | 100 | 0 | propellant 700, isp 320 |
| engine-ion | propulsion | 110 | 60 | 0 | propellant 150, isp 3.000, cruiseOnlyPower −500, extraCruiseTurns 2 |
| tank-extra | propulsion | 30 | 40 | 0 | propellant 300 (soma ao motor) |
| shield-radiation | protection | 30 | 30 | 0 | radiation +4 |
| shield-micrometeoroid | protection | 20 | 25 | 0 | micrometeoroid +4 |
| thermal-control | protection | 25 | 20 | −20 | thermal +3 |
| computer-basic | avionics | 20 | 10 | −30 | |
| computer-redundant | avionics | 45 | 20 | −40 | avionics +3, all +1 |
| camera-hires | instrument | 60 | 40 | −80 | science 4, data 4 |
| spectrometer | instrument | 70 | 30 | −60 | science 5, data 3 |
| radar-sounder | instrument | 90 | 50 | −200 | science 7, data 5 |
| magnetometer | instrument | 20 | 5 | −10 | science 2, data 0,5 |
| ir-thermometer | instrument | 40 | 15 | −30 | science 3, data 1 |

Cada carta pode aparecer no máximo 1 vez, exceto `solar-small`, `battery` e `tank-extra` (até 2).
Cada carta tem `flavor` de 1 frase educativa (ex.: RTG: "Curiosity usa um gerador de radioisótopo porque não depende do Sol.").

**Equipe (escolher 3)**
| id | Nome | Passiva | Ativa (1x por fase) |
|---|---|---|---|
| crew-systems | Engenheira de Sistemas | −10% massa de componentes | Desliga/religa qualquer componente sem custo de turno |
| crew-science | Cientista-chefe | +1 ciência/turno por instrumento ativo | Dobra a ciência gerada no turno |
| crew-flight | Controlador de Voo | +2 em testes launch e propulsion | Rerola um teste |
| crew-program | Gerente de Programa | +10% orçamento | — (só passiva) |
| crew-comms | Especialista em Comunicação | +20% downlink | Descarrega todo o buffer neste turno |
| crew-radiation | Especialista em Radiação | +3 em radiation | Ignora a falha de um evento de radiação |

**Eventos** (deck único, embaralhado por seed; carta comprada volta ao fundo)
| id | Fases | Teste | Dif. | Falha |
|---|---|---|---|---|
| solar-storm | cruise, operations | radiation | 12 | geração −50% por 2 turnos |
| micrometeoroid | cruise, operations | micrometeoroid | 11 | componente aleatório (não-estrutura) danificado: power 0, science 0, downlink 0 |
| computer-glitch | cruise, operations | avionics | 10 | modo seguro neste turno |
| panel-degradation | cruise, operations | power | 9 | maior painel solar −50% permanente; +4 no teste se houver ≥ 2 cartas power |
| overheating | operations | thermal | 10 | instrumento aleatório desligado por 1 turno |
| unexpected-discovery | operations | — | — | se sobra de energia ≥ 50 W e downlink não usado ≥ 2 Gbit: +8 ciência entregue |
| quiet-sky | cruise, operations | — | — | nada acontece (3 cópias) |

**Ações** (mão de 3, compra 1 por turno de voo, máx. 5 na mão)
| id | Efeito |
|---|---|
| trajectory-correction | +2 em teste propulsion na chegada; gasta 100 m/s |
| safe-mode | cancela o evento do turno; turno sem ciência nem downlink |
| prioritize-downlink | downlink ×1,5 neste turno; instrumentos desligados |
| power-down-instruments | escolha instrumentos para desligar até o próximo turno |

## 8. REGRAS (game/)
**Cálculos de projeto (`calculateDesign`)**
- `custoTotal = 100 + lançador.cost + Σ componentes.cost`; orçamento efetivo = budget × (1,1 se crew-program).
- `massaSeca = 300 + Σ massa` (×0,9 nos componentes se crew-systems); `propelente = Σ propellant`; `massaTotal = massaSeca + propelente` ≤ `lançador.capacity[launcherKey]`.
- `Δv = ispMotor · 9,80665 · ln(massaTotal / massaSeca)`; usa o isp do único motor (máx. 1 carta engine-*).
- `geração(d) = Σ (solar ? power / d² : power)` para power > 0, com d = mission.distanceAU.
- `consumo = 150 + Σ |power|` dos componentes com power < 0 (+ cruiseOnlyPower no cruzeiro).
- `downlink(d) = Σ downlinkAt1AU / d²` (×1,2 se crew-comms).
- `bônus(teste) = Σ testBonus[teste] + Σ testBonus.all + lançador.reliability (só launch)`.

**Validação (`validateDesign`)** — retorna lista de `{ code, message }` em português:
- orçamento estourado; massa acima da capacidade; Δv < requiredDeltaV; falta categoria obrigatória; instrumentos < minInstruments; mais de 1 motor; mais cópias que o permitido; sem lançador; equipe ≠ 3.
- Aviso (não bloqueia): consumo em operação > geração + bateria.

**Teste (`rollTest`)**: `d20 + bônus ≥ dificuldade`. 1 natural sempre falha, 20 natural sempre passa.

**Lançamento**: teste launch dif 8. Falha por ≥ 5 → missão perdida. Outra falha → −150 m/s.

**Turno de voo (cruzeiro ou operações)**, em ordem:
1. Comprar evento da fase e resolver.
2. Jogador joga até 1 ação e/ou habilidades.
3. Energia: déficit = consumo − geração. Se > 0, bateria cobre até batteryW. Se ainda faltar, desligar instrumentos (maior consumo primeiro), depois comunicação. Se nem a estrutura+aviônica for alimentada → modo seguro. 2 modos seguros seguidos → missão perdida.
4. Operações: instrumentos ativos somam `science` e `data` ao buffer.
5. Downlink: `envio = min(buffer.data, downlink)`; `ciênciaEntregue += buffer.science × envio / buffer.data`; buffer reduzido na mesma proporção. Buffer máximo 40 Gbit (excedente é perdido e gera lição).
6. Registrar `TurnSnapshot`.

**Chegada**: se Δv restante < insertionDeltaV → falha ("faltou propelente"). Senão teste propulsion dif 10; falha → −200 m/s e repetir no turno seguinte uma vez; segunda falha → falha. Sucesso gasta insertionDeltaV.

**Resultado e score (`calculateScore`)**
- success: viva e ciênciaEntregue ≥ scienceTarget; partial: ciênciaEntregue > 0; failure: caso contrário.
- `score = round(ciência × (1 + sobraOrçamento/orçamento × 0,5) × difficultyMultiplier − 5 × turnosModoSeguro − 10 × componentesDanificados)`, mínimo 0.
- Estrelas: 0 failure, 1 partial, 2 success, 3 success com sobra de orçamento ≥ 20%.

**Lições (`buildLessons`)**: regras que geram frases, ex.: dados perdidos por buffer cheio → "Seus instrumentos geraram mais dados do que a antena conseguia enviar"; painel solar longe do Sol → "Em Marte o painel rende 43% do que renderia na Terra"; evento de radiação falho sem blindagem.

## 9. DETERMINISMO
- RNG `mulberry32` em `game/rng.ts`.
- Cada sorteio usa uma semente derivada: `hash(seed, phase, turn, 'event' | 'roll' | 'draw')`. Assim, trocar uma carta **não** muda quais eventos saem em cada turno, o que torna o "E se?" justo.
- `simulateMission(mission, design, seed, policy = autoPolicy)` roda a missão inteira sem interação (usado em testes e no "E se?"). `autoPolicy` não joga ações.
- O modo interativo usa as mesmas funções de passo (`startMission`, `resolveLaunch`, `playTurn`, `resolveArrival`, `finishMission`).

## 10. NASA/JPL (P2)
```text
app/api/distance/route.ts → services/horizons.ts → dados normalizados { body, date, sunAU, earthAU } → engine
```
Fallback: `data/distances.json` (Terra/Lua 1,0; Marte 1,52; Júpiter 5,2). O engine recebe só `distanceAU`; não conhece o formato da API. Timeout de 3 s e cache em memória.

## 11. FRONTEND
Componentes: `MissionBriefing`, `CrewPicker`, `CardView`, `CardHand`, `ShipBoard` (slots por categoria), `ResourceBars`, `ValidationPanel`, `FlightView`, `EventModal` (mostra dado, bônus e dificuldade), `Timeline`, `MissionReport`, `WhatIfPanel` (P2).
Regras ficam no engine; componentes só exibem e despacham ações.
Cartas: retângulo 2:3, cor por categoria, ícone SVG, custo/massa/energia no rodapé, flavor em itálico.

## 12. ESTADO
`hooks/useGame.ts` com `useReducer`:
```ts
type GameAction =
  | { type: 'SELECT_MISSION'; missionId: string }
  | { type: 'TOGGLE_CREW'; crewId: string }
  | { type: 'SELECT_LAUNCHER'; launcherId: string }
  | { type: 'ADD_COMPONENT' | 'REMOVE_COMPONENT'; componentId: string }
  | { type: 'LAUNCH' } | { type: 'PLAY_ACTION'; actionId: string; target?: string }
  | { type: 'USE_ABILITY'; crewId: string; target?: string }
  | { type: 'END_TURN' } | { type: 'RESTART' };
```
`LAUNCH` só é aceito se `validateDesign` retornar sem erros.

## 13. PERSISTÊNCIA
**Necessária:** não no MVP. **Motivo:** partida curta. P3: campanha em `localStorage`.

## 14. ESTRUTURA
```text
app/            page.tsx (fluxo inteiro em uma rota), layout.tsx, api/ (P2)
components/
hooks/          useGame.ts
game/           rng.ts, design.ts, validation.ts, tests.ts, events.ts, turn.ts, simulation.ts, scoring.ts, lessons.ts
data/           missions.json, launchers.json, components.json, crew.json, events.json, actions.json, distances.json
services/       horizons.ts (P2)
types/          game.ts
tests/          *.test.ts
```

## 15. SEGURANÇA
Sem secrets no MVP. Validar parâmetros da rota de API (P2). Não usar `dangerouslySetInnerHTML`. Respostas externas validadas antes de usar.

## 16. TESTABILIDADE
Prioridade: cálculos de design, validação, energia por distância, Δv, downlink/buffer, eventos, chegada, score, determinismo (mesma seed ⇒ mesmo resultado), e os cenários de balanceamento da seção 17.

## 17. BALANCEAMENTO (testes obrigatórios)
- **Nave de referência** (Médio, chemical, solar-large, battery, antenna-high, camera, spectrometer, radar, magnetometer, shield-radiation, shield-micrometeoroid, computer-redundant, crew science/comms/flight): válida, custo ≤ 800, Δv ≥ 2.000, e com `autoPolicy` atinge **success** em ≥ 60% de 200 seeds.
- Trocar antenna-high por antenna-low na nave de referência: **partial** na maioria das seeds.
- Trocar solar-large por solar-small: aviso de energia e ciência menor.
- Adicionar todas as cartas: validação falha por orçamento e massa/Δv.
Se algum cenário falhar, ajustar números em `data/` e registrar a mudança na seção 7.

## 18. YAGNI GATE
Antes de adicionar: é requisito? é MVP? há solução menor? pode esperar? aumenta risco? Sem justificativa: não implementar.

## 19. PLANO
**P0:** tipos + dados + engine + testes de balanceamento
**P1:** UI + fluxo completo jogável
**P2:** "E se?", mais 2 missões, Horizons + fallback, "Sabia que?"
**P3:** arte, animações, campanha, acessibilidade

**Próximo: `Desenvolvimento_guiado.md`.**
