# Guia de desenvolvimento

Como rodar, testar e mudar o Mission Architect. A organização do código está em [ARCHITECTURE.md](ARCHITECTURE.md); o visual, em [DESIGN.md](../DESIGN.md); o propósito do produto, em [PRODUCT.md](../PRODUCT.md). Física, dados e regras do jogo estão em [PHYSICS.md](PHYSICS.md), [DATA.md](DATA.md) e [GAMEPLAY.md](GAMEPLAY.md). O que manter e cortar nas 48 h está em [HACKATHON.md](HACKATHON.md).

## Pré-requisitos

- Node.js 22.12 ou mais novo (`"engines": { "node": ">=22.12" }` no `package.json`).
- npm (o repositório tem `package-lock.json`).
- Para ver as cenas 3D, um navegador com WebGL 2. Sem ele o jogo funciona com os desenhos 2D.

## Comandos

```bash
npm install          # ou npm ci, para instalar exatamente o lockfile
npm run dev          # servidor Vite em http://localhost:5173
npm test             # vitest run: todos os testes, uma vez
npm run typecheck    # tsc -b --noEmit (app, worker e vite.config)
npm run build        # tsc -b && vite build -> dist/
npm run preview      # serve o dist/ (Vite usa a porta 4173 por padrão)
npm run fetch:data   # baixa de novo efemérides e flares (ver abaixo)
```

Durante o desenvolvimento, `npx vitest` (sem `run`) fica observando os arquivos e roda de novo a cada mudança. Para um arquivo só: `npx vitest run src/physics/lambert.test.ts`.

`npm run build` roda o typecheck antes; um erro de tipo para o build. `dist/` está no `.gitignore`. O `vercel.json` publica o projeto como site estático (`npm run build`, saída `dist`).

## Flags de URL para dev

Abra qualquer tela direto, com o design de referência e uma seed fixa:

```
http://localhost:5173/?phase=cruise&preset=reference&seed=1
```

As flags são lidas uma vez, quando a store é criada (`src/app/store.ts` lê `window.location.search` e chama `parseDevParams` de `src/app/devParams.ts`). Não há roteador: navegar no jogo não muda a URL, e mudar a URL só tem efeito depois de recarregar a página.

### `phase`

Valores: `select`, `briefing`, `design`, `launch`, `cruise`, `arrival`, `ops`, `report`, `sources` (a lista `PHASES` de `src/game/flow.ts`).

| Fase | Precisa de `preset=reference`? | O que abre |
|---|---|---|
| `select`, `briefing`, `design`, `sources` | Não | A tela, com o design padrão ou o de referência |
| `launch` | Sim (o design padrão não passa no checklist) | A tela de lançamento antes do lançamento ("Every check is go." e o botão Launch). Nada é jogado automaticamente |
| `cruise` | Sim | Cruzeiro recém-iniciado na data de partida |
| `arrival` | Sim | Cruzeiro jogado até a data de chegada, antes da queima de captura |
| `ops` | Sim | Capturado em órbita, operações ainda não começaram |
| `report` | Sim | Seis turnos jogados e relatório calculado |

Para `cruise`, `arrival`, `ops` e `report`, `gameData` chama `autoplay()` (`src/game/autoplay.ts`) com as escolhas padrão: queima toda TCM que a nave puder pagar; responde cada flare com safe mode, senão shield attitude, senão keep observing; nas operações liga todo instrumento disponível que cabe na energia, na ordem do catálogo. Se o voo falhar antes, a tela vira a que mostra a falha (launch ou arrival).

### `preset`

Só `reference` é reconhecido. Carrega uma cópia de `REFERENCE_DESIGN` (`src/game/checklist.ts`): foguete classe Atlas V 401, o orbitador de referência (`REFERENCE_SPACECRAFT` em `src/game/spacecraft.ts`) e a transferência de C3 mínimo da janela (31/10/2026 → 20/08/2027, C3 ≈ 9,18 km²/s²), com as datas fixas no código. Sem `preset`, o jogo começa com o design padrão de `defaultDesign()`: sem transferência, foguete classe Atlas V 401 e uma sonda que é só o bus (`sc-core`), então o checklist começa vermelho.

### `seed`

Um inteiro (`/^-?\d+$/`, dentro do intervalo seguro do JavaScript; negativos valem). Fixa quais flares acontecem, em que dia, como cada um termina e o erro de injeção do lançamento. Com seed válida na URL, "novo jogo" (`reset()`) mantém a mesma seed. Sem ela, cada jogo novo recebe uma seed aleatória (`freshSeed()`, via `crypto.getRandomValues`).

### Valores inválidos

Nunca lançam erro. Cada campo cai no seu padrão de forma independente:

- `phase` desconhecida, ou uma fase em que o estado não pode entrar (por exemplo `?phase=cruise` sem preset): mission select.
- `preset` com qualquer valor diferente de `reference`: sem preset.
- `seed` que não é inteiro (`1.5`, `abc`, vazio): seed aleatória. (`parseDevParams` devolve 1 nesse caso, mas a store só usa a seed da URL quando `hasSeedParam` é verdadeiro.)

Exemplos úteis:

```
/?phase=design&preset=reference           design completo, para mexer no foguete ou na sonda
/?phase=launch&preset=reference&seed=1    tela de lançamento pronta para lançar
/?phase=arrival&preset=reference&seed=1   chegada a Marte, antes da queima
/?phase=report&preset=reference&seed=1    relatório completo, para screenshot
```

## Atualizar os dados

```bash
npm run fetch:data
```

Roda `node scripts/fetch-horizons.mjs && node scripts/fetch-donki.mjs`. Os dois scripts são Node puro, sem dependências, e escrevem em `src/data/generated/`. O app não acessa rede em tempo de execução; o resultado precisa ser commitado.

### `scripts/fetch-horizons.mjs`

- Fonte: API do JPL Horizons (`https://ssd.jpl.nasa.gov/api/horizons.api`), Terra (`399`) e Marte (`499`).
- Vetores de estado heliocêntricos (`CENTER '500@10'`), plano da eclíptica, ICRF, em km e km/s, de 2026-07-01 a 2029-07-01, um por dia.
- Saída: `ephemeris-earth.json` e `ephemeris-mars.json`. `src/physics/ephemeris.ts` converte para SI (× 1000) ao interpolar.
- Três novas tentativas com espera crescente (2, 4 e 8 s).

### `scripts/fetch-donki.mjs`

- Busca flares de 2024-01-01 a 2024-12-31 e guarda os de classe M e X em `donki-flares.json`.
- Ordem: (1) `api.nasa.gov/DONKI/FLR` com a variável `NASA_API_KEY` (sem ela usa `DEMO_KEY`, com limite baixo de requisições); (2) o serviço CCMC por trás dela, `kauai.ccmc.gsfc.nasa.gov`. Cada fonte tenta 3 vezes de novo.
- Se as duas falharem, o script sai com erro e não escreve nada. Ele nunca inventa eventos.
- `--from-wayback` é o modo manual: lê três snapshots do Wayback Machine de respostas reais do DONKI. O arquivo commitado foi gerado assim em 2026-10-22, quando os dois endpoints estavam fora do ar: são três janelas de ~30 dias de 2024 com 241 flares M/X.
- A chave é trocada por `api_key=REDACTED` antes de qualquer URL ir para o arquivo.

Passando a chave:

```bash
NASA_API_KEY=sua_chave npm run fetch:data            # bash
```

```powershell
$env:NASA_API_KEY = 'sua_chave'; npm run fetch:data  # PowerShell
```

Nunca commite a chave.

### Depois de atualizar

Rode `npm test`. Alguns testes fixam os dados atuais de propósito:

- Uma busca ao vivo do DONKI traz o ano inteiro, e as janelas mudam. `catalog.test.ts` ("DONKI provenance states the real coverage...") e o título da fonte `donki` em `src/data/sources.ts` citam as três janelas; os dois precisam ser atualizados juntos.
- Efemérides novas podem deslocar um pouco os mínimos do porkchop. Confira `porkchop.test.ts` (validação contra o handbook da NASA), `concepts.test.ts` (espera `9.18` no card de C3) e a tabela do README.
- `fetch:data` usa `&&`. Se o Horizons falhar, o DONKI nem roda. Se o DONKI falhar, os arquivos de efemérides já foram reescritos. Use `git diff src/data/generated` e `git checkout` para desfazer.

Mudar o intervalo de datas exige mudar `START_TIME`/`STOP_TIME` no script e conferir `DEFAULT_PORKCHOP` em `src/physics/porkchop.ts`.

## Convenções de código

### TypeScript

- `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax` (use `import type` para tipos).
- Com `noUncheckedIndexedAccess`, `arr[i]` e `record[key]` têm tipo `T | undefined`. Trate o `undefined` ou use `!` só quando o índice é garantido (o código faz isso em laços com limite conhecido).
- Três configs referenciadas por `tsconfig.json`: `tsconfig.app.json` (todo `src` menos workers), `tsconfig.worker.json` (`src/**/*.worker.ts`, lib `WebWorker`) e `tsconfig.node.json` (`vite.config.ts`).
- Alias `@/` → `src/` (em `vite.config.ts` e nos tsconfigs). Entre pastas use `@/physics/...`; dentro da mesma pasta, `./`.
- Não há ESLint nem Prettier configurados. Siga o estilo dos arquivos vizinhos: 2 espaços, aspas simples, sem ponto e vírgula.

### Unidades e tempo

- Internamente tudo é SI: m, s, kg, m/s, N, W.
- Quando um campo não é SI, a unidade está no nome: `costM` (US$ milhões), `c3` (km²/s²), `vInfArrKms` (km/s), `rateMbpsAt1AU`, `storageGb`, `dataGbPerTurn`, `tofDays`, `capturePeriapsisAltM`. Os JSON de efemérides estão em km e km/s; `ephemeris.ts` converte.
- Ângulos em radianos em `orbit.ts`; graus só quando o nome diz (`sunEarthMarsAngleDeg`).
- Tempo é sempre Julian Date (`number`), via `src/physics/time.ts`. Para mostrar ao jogador, `formatJd`. TDB é tratado como UTC.

### Funções puras e dados

- Funções de `physics` e `game` nunca mutam a entrada; devolvem objetos novos. A store substitui `design` em vez de editá-lo.
- `physics`, `game` e `data` não importam React, three.js nem DOM (ver [ARCHITECTURE.md](ARCHITECTURE.md#a-regra-física-e-regras-do-jogo-não-importam-react-threejs-nem-dom)).
- Todo item de catálogo tem `source`; valores sem fonte primária começam com `estimate:` no texto da fonte. Os testes de `catalog.test.ts` cobram isso.
- Valores inventados para o jogo funcionar são "game balance" e são marcados assim no código e na UI.
- Nada na tela imprime `NaN`, `Infinity` ou `undefined`: use `formatNumber` (`src/components/status.ts`) ou `fmt` (`src/data/concepts.ts`), que imprimem "–".

### Arquivos

- Componentes React: `PascalCase.tsx` (`PorkchopPlot.tsx`). Módulos puros: `camelCase.ts` (`porkchopScale.ts`). Primitivos shadcn: minúsculas em `src/components/ui/`.
- Workers: `*.worker.ts`.
- Testes ao lado do módulo: `foo.ts` → `foo.test.ts`. O Vitest só procura `src/**/*.test.ts`; um `.test.tsx` não roda.
- Todo módulo começa com um comentário dizendo o que faz e de onde vêm os números. Mantenha isso ao criar arquivos.

### Commits

Conventional Commits com escopo, como no histórico: `feat(ui): ...`, `fix(3d): ...`, `test(physics): ...`, `perf(build): ...`, `refactor(3d): ...`, `docs: ...`. O repositório também usa dois tipos próprios: `balance:` (ajuste de game balance) e `polish:`.

## Regras do design system

O [DESIGN.md](../DESIGN.md) é a referência completa. Estas são as regras que uma contribuição não pode quebrar:

1. Componentes de dados (`Readout`, `Gauge`, `Checklist`, `Timeline`) recebem números por props e nunca leem a store. Telas usam os hooks `use*` ou `useGameView()`.
2. Status nunca só por cor: sempre com a palavra GO / CAUTION / NO-GO (`STATUS_WORD` em `src/components/status.ts`).
3. O laranja Mars (`mars`) significa "você está aqui / sua escolha", aparece no máximo umas cinco vezes por tela e nunca indica status.
4. Todo número leva a classe `.num` (algarismos tabulares). A fonte STIX Two só aparece em equações.
5. Plano: sem cards, sombras, brilho, blur decorativo, texto com gradiente, roxo ou neon. Separação por linhas finas e tom; cantos retos.
6. Uma ação primária por tela, no canto inferior esquerdo da placa. Controle desabilitado sempre diz por quê.
7. Número de game balance leva a marcação na dica (componente `GameBalance` em `src/screens/design/controls.tsx`).
8. Sem logos ou insígnias da NASA; sem emoji como ícone (use lucide). Animação usa o easing `cubic-bezier(0.16, 1, 0.3, 1)` e respeita reduced motion.

## Como fazer

### Adicionar um motor de foguete

1. Em `src/data/engines.ts`, acrescente um `EnginePart` ao array `ENGINES`:
   ```ts
   {
     id: 'meu-motor',            // único em todos os catálogos
     name: 'Meu Motor',
     propellant: 'kerolox',      // 'kerolox' | 'hydrolox' | 'methalox'
     thrustSL: 1_000_000,        // N; 0 para motor de vácuo
     thrustVac: 1_100_000,       // N
     ispSL: 300,                 // s; 0 para motor de vácuo
     ispVac: 330,                // s
     massKg: 1_000,
     costM: 10,                  // game balance, US$ M por motor
     source: 'Empuxo e Isp: <fonte>. Massa: estimate: <como>. Custo: game balance.',
     url: 'https://...',
   },
   ```
2. Ele aparece sozinho no seletor de motor do `StageEditor` (`enginesFor` em `src/screens/design/rocketEdit.ts`). No primeiro estágio só fica utilizável se `thrustSL > 0` e `ispSL > 0`.
3. Os tanques do estágio precisam ter o mesmo propelente do motor; `tanksFor` filtra e `rocketStats` acusa erro se não baterem.
4. Opcional: o tamanho exato do sino no 3D vai em `ENGINE_BELLS` (`src/scenes/rocketLayout.ts`). Sem entrada, `bellSpec` estima pelo empuxo.
5. `npm test`. `catalog.test.ts` confere id único, números finitos e positivos e a fonte.

Um propelente novo é mais trabalho: o tipo `Propellant` em `src/game/types.ts`, `BULK_DENSITY`, `COST` e `LABEL` em `src/data/tanks.ts` e as cores do jato em `src/scenes/Exhaust.tsx`.

### Adicionar um tanque

Em `src/data/tanks.ts`:

- Tanque genérico: use `family(...)` (gera S/M/L) ou `tank(...)` com `{ fraction }`. A fração seca precisa ficar na faixa que o teste cobra: kerolox 0,05–0,07, hydrolox 0,10–0,12, methalox 0,06–0,08.
- Tanque que reproduz um estágio real: `tank(...)` com `{ kg }` (massa seca publicada menos os motores) e `referenceStageId` apontando para `src/data/presetReference.ts`. O teste exige que tanque + motores fique a 5 % do estágio real.
- O comprimento sai do volume de propelente com `BULK_DENSITY`; o custo, do modelo `COST`.

Boosters ficam em `src/data/boosters.ts` e só se prendem ao primeiro estágio.

### Adicionar uma peça da sonda

1. Em `src/data/spacecraftParts.ts`, acrescente um `SpacecraftPart` a `SPACECRAFT_PARTS` com uma `category` existente (`core`, `power`, `comms`, `instrument`, `protection`, `storage`, `propulsion`).
2. Preencha os campos que a categoria usa:

   | Categoria | Campos |
   |---|---|
   | `power` | `powerW` positivo (a 1 AU se `solar: true`), `batteryWh` |
   | `comms` | `rateMbpsAt1AU` |
   | `instrument` | `powerW` negativo, `science`, `dataGbPerTurn` |
   | `protection` | `radiationShield` (0–1) |
   | `storage` | `storageGb` |
   | `propulsion` | `ispS`. A sonda aceita um sistema só |

   Todas: `costM`, `massKg`, `powerW`, `flavor` (texto para o jogador), `source` e, se fizer sentido, `max` (cópias por sonda).
3. A peça aparece sozinha na sua categoria da aba Spacecraft (`partsIn` em `src/screens/design/spacecraftEdit.ts`).
4. No 3D, um instrumento com id desconhecido é desenhado como caixa genérica (`KIND_BY_ID` em `src/scenes/spacecraftLayout.ts`). Antenas parabólicas usam `DISH_DIAMETER_M`. Formas novas pedem mudança em `spacecraftLayout.ts` e `SpacecraftModel.tsx`. O esboço 2D da aba (`SpacecraftTab.tsx`) reconhece só ids específicos (`solar-large`, `solar-small`, `comms-hga`, `comms-optical`, `rtg`).
5. `npm test`. O teste "a sensible orbiter costs $400–600M..." em `catalog.test.ts` pode quebrar se a peça mudar o equilíbrio.

Uma categoria nova exige o tipo `SpacecraftCategory` (`src/game/types.ts`), `CATEGORIES` em `spacecraftEdit.ts` e as somas em `src/game/spacecraft.ts`.

### Adicionar um card de conceito de física

1. Em `src/data/concepts.ts`, acrescente um `Concept` a `CONCEPTS`. A ordem do array é a ordem da jornada e define o número da equação; inserir no meio renumera as seguintes.
   ```ts
   {
     id: 'meu-conceito',
     title: 'Nome do conceito',
     formula: 'Δv = …',                 // Unicode, desenhado em STIX itálico
     plain: 'Uma ideia, em palavras simples (nível ensino médio).',
     analogy: 'Opcional.',
     phases: ['design', 'launch'],      // fases cujo painel mostra o card
     live: safe((v) => {
       if (!v.transfer) return NO_TRANSFER
       return `Com o seu design: ${fmt(v.transfer.c3, 2)} km²/s².`
     }),
   },
   ```
2. `live` recebe o `GameView` (design, transferência, stats do foguete e da sonda, checklist, capacidade, grade do porkchop). Envolva em `safe(...)`: qualquer exceção ou `NaN` vira "–". Quando faltar dado, devolva uma dica ("Pick a transfer...") em vez de número.
3. Na fase `design` o painel não usa `phases`: cada aba tem sua lista em `TAB_CONCEPTS` (`src/components/AppShell.tsx`). Para o card aparecer numa aba, ponha o id lá.
4. `npm test`. `concepts.test.ts` roda `live()` com o design de referência, o padrão e um design quebrado.
5. Os textos do jogo estão em inglês; mantenha os cards em inglês.

### Adicionar um novo destino de missão

Só Marte está ligado. Europa e o retorno de amostra de asteroide aparecem em `MissionSelect.tsx` com `playable: false` e não têm nada por trás. Um destino novo toca quase todas as camadas:

- Dados: corpo novo em `scripts/fetch-horizons.mjs` (`BODIES`), provavelmente com intervalo de datas maior; tipo `Body` e `FILES` em `src/physics/ephemeris.ts` (`EPHEMERIS_RANGE` é a interseção dos arquivos).
- Física: `MU_*`, `R_*`, `SOI_*` em `constants.ts`. `transferFor` e `computePorkchop` têm `'earth'` → `'mars'` fixo, e `DEFAULT_PORKCHOP` é a janela de 2026 com TOF de 100 a 500 dias.
- Missão: `MISSION` em `src/data/mission.ts` é uma constante única (órbita de captura, orçamento, turnos). Seria preciso um registro de missões e um campo na store dizendo qual está em jogo.
- Regras: `cruise.ts` (chegada e captura em Marte, `CAPTURE_MAX_MISS_KM`), `spacecraft.ts` (`MARS_MEAN_DISTANCE_AU`, queima de captura), `ops.ts` (distância Terra–Marte, conjunção), `checklist.ts`, `lessons.ts`.
- Conteúdo: `concepts.ts`, `realMissions.ts` (MAVEN e MRO), textos de `Briefing`, `Arrival`, `Ops`.
- 3D e 2D: `MarsArrival.tsx`, corpos em `SolarSystem.tsx` e `solarScale.ts`, `CruiseMap.tsx`, texturas em `public/textures/`.
- Testes que fixam números de Marte.

Limites do modelo também pesam: Lambert de uma revolução, sem assistência gravitacional e sem trecho de volta. Uma ida a Júpiter sem assistência é cara e longa; um retorno de amostra precisaria de uma segunda transferência. Para o hackathon, trate novos destinos como fora de escopo.

### Ajustar o game balance

| Onde | O quê |
|---|---|
| `src/data/mission.ts`, `MISSION` | `budgetM` (900), `launchMargin` (0,9), `opsTurns` (6), `turnDays` (30), `scienceTarget` (100), `bufferGbit` (40), `minLiftoffTwr` (1,1), `maxCruiseDays` (600), `encounterSoiFactor` (2) |
| `src/data/mission.ts`, modelo de subida | `ASCENT_DV` (9.400 m/s), `GRAVITY_LOSS_K` (3.000), `GRAVITY_LOSS_MAX_TWR` (2,5), `UPPER_STAGE_MIN_TWR` (0,25) |
| `src/data/spacecraftParts.ts` | `costM`, `science`, `dataGbPerTurn` de cada peça |
| `src/data/engines.ts`, `src/data/tanks.ts` | `costM` dos motores; modelo `COST` dos tanques |
| `src/physics/launcher.ts` | `FAIRINGS` (massa e custo das coifas) |
| `src/game/events.ts`, `EVENT_RULES` | Risco de dano por flare, safe mode, shield attitude, ciência por observação, quantidade e espaçamento de eventos |
| `src/game/cruise.ts` | `TCM_WINDOWS` (dias 15, 60 e 30 antes da chegada), `INJECTION_ERROR_SIGMA_MS` (2 m/s), `CAPTURE_MAX_MISS_KM` (10.000) |
| `src/game/scoring.ts` | `SCORE_DIFFICULTY_MULTIPLIER`, `SAFE_MODE_PENALTY`, `SAFE_MODE_DAYS_PER_PENALTY` |
| `src/physics/link.ts` | `DSN_CONTACT_HOURS_PER_DAY` (8) |

`MISSION_GAME_BALANCE` lista quais campos de `MISSION` são game balance. Ponha ali qualquer campo novo desse tipo. Hoje nenhum módulo lê essa lista; as telas marcam os números com `<GameBalance />` caso a caso.

Os textos de `SIMPLIFICATIONS` (`concepts.ts`) leem as constantes e se atualizam sozinhos. O README não: números citados lá precisam de edição manual.

Testes que vão reclamar de mudanças grandes: `launcher.test.ts` (presets a ±15 % das curvas LSP; mexer no modelo de subida afeta), `catalog.test.ts` (orbitador sensato entre US$ 400 e 600 M que cabe num Atlas V 401 a C3 12 e atinge a meta de ciência), `store.test.ts` e `autoplay.test.ts` (missão de referência de ponta a ponta), `concepts.test.ts`. Quando um teste falhar, decida se o balanceamento novo está certo e só então atualize o teste.

## Problemas comuns

### Tela branca ao abrir o `index.html` direto

O app é feito de módulos ES e precisa de um servidor. O `index.html` da raiz aponta para `/src/app/main.tsx`, que só o Vite sabe transformar. O `dist/index.html` usa caminhos absolutos (`/assets/...`) e um Web Worker de módulo, e o navegador bloqueia os dois em `file://`. Use `npm run dev` ou `npm run build && npm run preview`.

Pelo mesmo motivo, publicar em um subcaminho (por exemplo `usuario.github.io/repo/`) quebra os caminhos: o `vite.config.ts` não define `base`. Publique na raiz de um domínio (como a Vercel faz) ou configure `base`.

### O 3D não aparece

Sem WebGL 2, as vistas mostram os desenhos 2D com a nota "3D view unavailable on this device (no WebGL 2)". Se a cena der erro ao carregar, a nota é "3D view failed to load". O jogo continua jogável nos dois casos. Para conferir o navegador, abra `chrome://gpu` (ou `edge://gpu`) e veja se WebGL2 está habilitado; aceleração de hardware desligada é a causa mais comum.

### Canvas preto no Windows (Direct3D 11)

Histórico: com o MSAA do `EffectComposer`, as cenas de lançamento, sistema solar e chegada renderizavam pretas em GPUs com Direct3D 11 via ANGLE, mesmo com a cena desenhando certo. A correção (commits `8a87aab` e `0049ae1`) foi `multisampling={0}` mais o efeito `SMAA`. Se o preto voltar, confira se alguém religou `multisampling` ou trocou o SMAA. Hangar e SpacecraftView não usam composer e mantêm `antialias: true`.

### `RangeError: No mars ephemeris for JD ...`

As efemérides cobrem de 2026-07-01 a 2029-07-01 (`EPHEMERIS_RANGE`). `bodyState` lança `RangeError` fora disso; `computePorkchop` também lança para uma `PorkchopSpec` fora do intervalo. `transferFor` devolve `null` e as cenas prendem a data com `clampJd`, então o erro só aparece quando código novo chama `bodyState` com uma data fora. Para cobrir outras datas, mude o intervalo em `scripts/fetch-horizons.mjs` e rode `npm run fetch:data`.

### "The porkchop plot could not be computed."

O worker falhou. Clique em "Compute again". Se persistir, veja o console: uma `PorkchopSpec` inválida ou fora das efemérides lança `RangeError` dentro do worker.

### DONKI fora do ar

Os endpoints do DONKI (`api.nasa.gov` e `kauai.ccmc.gsfc.nasa.gov`) às vezes caem; estavam fora em 2026-10-22. Isso não afeta o jogo, que usa o JSON commitado. Para o script: tente mais tarde, use uma `NASA_API_KEY` própria (o `DEMO_KEY` estoura o limite rápido) ou rode `node scripts/fetch-donki.mjs --from-wayback`. Se o script falhar, ele não escreve nada; o arquivo antigo continua lá.

### Loop de render ou "Maximum update depth exceeded"

Quase sempre é um selector que devolve objeto novo: `useGame((s) => ({ ... }))` ou `useGame((s) => calcula(s.design))`. Use um selector por campo, `useShallow` ou os hooks derivados (`useChecklist`, `useTransfer`...). Explicação em [ARCHITECTURE.md](ARCHITECTURE.md#selectors-não-podem-devolver-objetos-novos).

### Teste que roda no navegador mas falha no Vitest

Os testes rodam em Node, sem DOM, sem `Worker` e sem WebGL. Lógica que precisa de teste deve morar num módulo `.ts` puro. Para a store, `store.test.ts` mostra como mockar `@/physics/porkchopClient`.
