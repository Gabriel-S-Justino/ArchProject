# Dados do Mission Architect

Este documento lista cada conjunto de dados que o jogo usa: o que é, quem fornece, URL, data da coleta, arquivo no repositório, script que o gera, como o jogo o usa e quais são as limitações conhecidas. No fim há a tabela de valores de balanceamento, o procedimento para atualizar os dados e um texto pronto para o campo "NASA data" da submissão no Space Apps.

A regra do projeto é a da [spec](superpowers/specs/2026-10-22-mission-architect-vision-design.md), seção 5: todo dado externo é baixado antes, salvo como JSON ou TypeScript estático no repositório, e o jogo nunca depende de uma API ao vivo durante a partida ou a demo. Todo número na tela é dado real, calculado a partir de dado real, ou marcado como "game balance".

A lista canônica, com as datas, é `src/data/sources.ts` (`DATA_SOURCES`), que alimenta a tela "Data sources" do jogo. Os modelos que consomem esses dados estão em [PHYSICS.md](PHYSICS.md).

Leitura relacionada: [README](../README.md) · [ARCHITECTURE](ARCHITECTURE.md) · [PHYSICS](PHYSICS.md) · [GAMEPLAY](GAMEPLAY.md) · [DEVELOPMENT](DEVELOPMENT.md) · [HACKATHON](HACKATHON.md) · [DECISIONS](DECISIONS.md)

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Efemérides do JPL Horizons](#2-efemérides-do-jpl-horizons)
3. [Erupções solares do NASA DONKI](#3-erupções-solares-do-nasa-donki)
4. [Curvas de desempenho da NASA LSP](#4-curvas-de-desempenho-da-nasa-lsp)
5. [Motores, tanques, boosters e estágios](#5-motores-tanques-boosters-e-estágios)
6. [Peças da espaçonave](#6-peças-da-espaçonave)
7. [Missões reais para comparação](#7-missões-reais-para-comparação)
8. [Texturas da NASA](#8-texturas-da-nasa)
9. [Referência de validação: NASA/TM-2010-216764](#9-referência-de-validação-nasatm-2010-216764)
10. [Valores de balanceamento de jogo](#10-valores-de-balanceamento-de-jogo)
11. [Atualizando os dados](#11-atualizando-os-dados)
12. [Texto para o campo "NASA data" do Space Apps](#12-texto-para-o-campo-nasa-data-do-space-apps)

## 1. Visão geral

| Conjunto | Fornecedor | Arquivo no repo | Gerado por | Coletado em |
|---|---|---|---|---|
| Vetores de estado diários de Terra e Marte | NASA/JPL SSD, Horizons | `src/data/generated/ephemeris-earth.json`, `ephemeris-mars.json` | `scripts/fetch-horizons.mjs` | 2026-10-22 |
| Erupções solares M e X de 2024 | NASA DONKI (CCMC), via snapshots do Wayback Machine | `src/data/generated/donki-flares.json` | `scripts/fetch-donki.mjs --from-wayback` | 2026-10-22 |
| Carga útil x C3 de Atlas V 401, Falcon Heavy expendable, Vulcan VC4 | NASA Launch Services Program (Atlas V via digitalização do AMAT) | `src/data/lsp.ts` | manual | 2026-10-22 |
| Motores | ULA, Aerojet Rocketdyne, NASA, SpaceX, NPO Energomash (alguns via Wikipedia) | `src/data/engines.ts` | manual | 2026-10-22 |
| Tanques e estágios de referência | ULA Atlas V User's Guide; Wikipedia "Falcon Heavy" e "Vulcan Centaur" | `src/data/tanks.ts`, `presetReference.ts` | manual | 2026-10-22 |
| Boosters laterais | Northrop Grumman (GEM 63/63XL); estágio Falcon Heavy | `src/data/boosters.ts` | manual | 2026-10-22 |
| Peças da espaçonave | NASA/JPL (MRO, MAVEN, DSOC, MMRTG), PDS, NASA SmallSat SoA, L3Harris, Nammo | `src/data/spacecraftParts.ts` | manual | 2026-10-22 |
| Missões reais (MRO, MAVEN) | NASA/JPL, NASA PDS, NTRS | `src/data/realMissions.ts` | manual | 2026-10-22 |
| Texturas de Terra, Marte, estrelas e Sol | NASA Earth Observatory, USGS/NASA, NASA GSFC SVS, NASA SDO | `public/textures/*.jpg` | manual (ver `public/textures/SOURCES.md`) | 2026-10-22 |
| Referência de validação do porkchop | NASA Glenn, NASA/TM-2010-216764 | `src/physics/porkchop.test.ts`, `src/data/sources.ts` | manual | 2026-10-23 |
| Constantes da missão "Red Watch" | projeto do jogo, modelado em MRO e MAVEN | `src/data/mission.ts` | manual | 2026-10-22 |

"Manual" quer dizer que os valores foram lidos dos documentos citados e digitados no código com a fonte ao lado de cada entrada (campo `source` e, quando existe, `url`). `src/data/catalog.test.ts` exige que todo motor, booster, curva LSP, missão real e estágio de referência tenha fonte, que tanques e peças digam de onde vêm seus números, e que curvas LSP e missões reais tenham URL.

## 2. Efemérides do JPL Horizons

| Campo | Valor |
|---|---|
| O que é | posição (km) e velocidade (km/s) heliocêntricas de Terra e Marte, uma amostra por dia |
| Fornecedor | NASA/JPL Solar System Dynamics, Horizons System |
| API | `https://ssd.jpl.nasa.gov/api/horizons.api` (página: https://ssd.jpl.nasa.gov/horizons/) |
| Corpos | Terra = `399` (geocentro, não o baricentro Terra-Lua); Marte = `499` (centro do planeta) |
| Centro | `500@10` (centro do Sol) |
| Referencial | `REF_PLANE='ECLIPTIC'`, `REF_SYSTEM='ICRF'`, gravado no arquivo como `ecliptic J2000` |
| Tabela | `VEC_TABLE='2'` (estado: x, y, z, vx, vy, vz), `OUT_UNITS='KM-S'`, CSV |
| Intervalo | 2026-07-01 a 2029-07-01, passo de 1 dia: 1.097 linhas por corpo, `startJd` 2461222.5 |
| Soluções | Terra: alvo DE441, centro DE441. Marte: alvo mar099, centro DE441 (nomes lidos do cabeçalho da resposta do Horizons e gravados no campo `source`) |
| Coletado | 2026-10-22 |
| Arquivos | `src/data/generated/ephemeris-earth.json`, `ephemeris-mars.json` (cabeçalho com `body`, `source`, `url` completa da consulta, `fetched`, `center`, `frame`, `startJd`, `stepDays`, `count`, depois `data` como linhas planas de 6 números) |
| Script | `scripts/fetch-horizons.mjs` |

Uso no jogo: `src/physics/ephemeris.ts` (`bodyState`) interpola os vetores com Hermite cúbico. Daí saem a grade do porkchop (cada célula é um Lambert entre a Terra na partida e Marte na chegada), o ponto de partida do cruzeiro, o ponto de mira das TCMs, a distância Sol–Marte usada na potência solar, a distância Terra–Marte usada na taxa de dados e no atraso do sinal, o ângulo Sol–Terra–Marte da conjunção, e as posições no sistema solar 3D.

Limitações:

- O jogo só funciona entre 2026-07-01 e 2029-07-01; fora disso `bodyState` lança `RangeError` e as operações prendem a data às pontas do intervalo.
- O tempo dos vetores é TDB; o jogo trata como UTC (cerca de 69 s de diferença).
- O corpo 399 é o geocentro, que a Lua desloca alguns milhares de km em torno do baricentro. O teste de interpolação aceita até 50 km para a Terra por causa disso (ver [PHYSICS.md](PHYSICS.md#3-tempo-e-efemérides)).
- Amostragem diária: entre amostras o estado é interpolado. Comparado com vetores do Horizons a cada 12 h, o interpolador ficou a 94 m (Terra) e 9 m (Marte) dos valores verdadeiros.

## 3. Erupções solares do NASA DONKI

| Campo | Valor |
|---|---|
| O que é | erupções solares (FLR) de classe M e X: id, horário do pico, classe, local na superfície do Sol, link para a página do evento |
| Fornecedor | NASA DONKI (Space Weather Database Of Notifications, Knowledge, Information), mantido pelo CCMC do NASA GSFC |
| Página | https://kauai.ccmc.gsfc.nasa.gov/DONKI/ |
| De onde veio o arquivo do repo | três snapshots do Wayback Machine do endpoint CCMC `https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/FLR`, timestamps `20240615145942`, `20241128153255`, `20250114183851` |
| Filtro aplicado | `classType` M ou X, pico entre 2024-01-01 e 2024-12-31, sem duplicatas por `flrID` |
| Coletado | 2026-10-22 |
| Arquivo | `src/data/generated/donki-flares.json` |
| Script | `scripts/fetch-donki.mjs --from-wayback` |

Por que o Wayback: em 2026-10-22 os dois endpoints ao vivo do DONKI (`api.nasa.gov` e o CCMC) estavam fora do ar, segundo o [README](../README.md). O script tem um modo de recuperação documentado que lê respostas reais do DONKI arquivadas no Wayback Machine. Chamado com datas que não consegue interpretar (`startDate=yyyy-MM-dd`), o DONKI devolve a janela padrão dos 30 dias anteriores à requisição; cada snapshot é portanto uma resposta real de cerca de 30 dias. O próprio script registra que não existe snapshot de uma consulta do ano inteiro de 2024 (verificado em 2026-10-22, pela API CDX do Wayback).

Cobertura real (calculada a partir das erupções por `coverageWindows` em `src/data/donki.ts`, que separa janelas por intervalos de mais de 10 dias):

| Janela | Erupções | Classe M | Classe X |
|---|---|---|---|
| 2024-05-16 → 2024-06-15 | 68 | 62 | 6 |
| 2024-10-29 → 2024-11-27 | 101 | 99 | 2 |
| 2024-12-15 → 2024-12-31 | 72 | 69 | 3 |
| Total | 241 | 230 | 11 |

A terceira janela termina em 31 de dezembro porque o snapshot de janeiro de 2025 foi cortado pelo filtro de 2024. O campo `range` do JSON (2024-01-01 a 2024-12-31) é o filtro pedido, não a cobertura. `DONKI_META` e o título da fonte em `sources.ts` usam as janelas reais, e `catalog.test.ts` falha se o texto disser "2024-01-01" ou não citar as três janelas.

Uso no jogo: `src/game/events.ts` sorteia 2 ou 3 erupções distintas dessa lista para cada cruzeiro e as coloca em dias do voo (sorteio semeado, não pela data do calendário). O jogador vê a data e a classe reais da erupção. Classe M vira evento "moderado", classe X "severo". Riscos, custos e recompensas são balanceamento de jogo ([PHYSICS.md, seção 14](PHYSICS.md#14-eventos-de-erupção-solar)).

Limitações:

- Cobertura parcial de 2024 (78 dias somando as três janelas), não o ano inteiro.
- A data real da erupção não corresponde à data do cruzeiro no jogo: o evento é "baseado no evento real de <data>".
- Só a classe entra na mecânica; local, duração e partículas associadas não são usados.

## 4. Curvas de desempenho da NASA LSP

Fonte principal: NASA Launch Services Program (KSC), Launch Vehicle Performance Website, consulta "High Energy", https://elvperf.ksc.nasa.gov/Pages/Query.aspx. As curvas dão a massa de espaçonave separada (kg) em função do C3 (km²/s²). Regras da LSP anotadas em `src/data/lsp.ts`: reservas de guiagem 3-sigma, massa do adaptador padrão já descontada, declinação genérica. Missões reais costumam voar alguns por cento acima da curva.

| Curva | Origem | Detalhes | Pontos (C3) |
|---|---|---|---|
| Atlas V 401 | curva da LSP digitalizada no AMAT (Girija, open source; arXiv:2310.05994, que cita o site da LSP), arquivo `launcher-data/atlas-v401.csv`, URL https://raw.githubusercontent.com/athulpg007/AMAT/master/launcher-data/atlas-v401.csv | O Atlas V não está mais no site ao vivo da LSP. Pontos em C3 pares interpolados linearmente dos pontos digitalizados (0,26; 3.020) (5,75; 2.677) (11,25; 2.354) (18,63; 1.946) (24,17; 1.662) (29,85; 1.395) (35,10; 1.172) kg; o ponto C3 0 foi extrapolado do primeiro segmento. O arquivo de Falcon Heavy do AMAT bate com a LSP ao vivo dentro de 1%. | 0 a 30 |
| Falcon Heavy (expendable) | consulta ao vivo no site da LSP em 2026-10-22, "Falcon Heavy Expendable" | KSC LC-39A, sem recuperação de boosters nem do núcleo, reservas 3-sigma | 0 a 30 |
| Vulcan VC4 | consulta ao vivo no site da LSP em 2026-10-22, "Vulcan VC4" | SLC-41, órbita de estacionamento de 185 km, fase balística (coast) ≤ 60 min, adaptador C22 descontado, margem 3-sigma | −5 a 30 |

Falcon 9 não tem curva de propósito: a LSP não lista mais o Falcon 9 expendable e as curvas com recuperação param em C3 = 10. O preset Falcon 9 existe no jogo sem validação.

Ponto de controle real (`LSP_ANCHORS`): o MAVEN partiu em 18 Nov 2013 num Atlas V 401 com 2.454 kg (press kit do MAVEN) e C3 12,07 km²/s² na abertura do período de lançamento (NTRS 20160000802, tabela 1). A curva dá ≈ 2.309 kg nesse C3, cerca de 6% abaixo da missão real. `catalog.test.ts` exige diferença menor que 10%.

Uso no jogo: as curvas não definem a capacidade do foguete do jogador; ela é calculada pela equação do foguete estágio a estágio. As curvas validam os três presets (`launcher.test.ts` exige ±15% em todos os pontos; os erros medidos ficam entre −7,9% e +6,6%, tabela em [PHYSICS.md, seção 11](PHYSICS.md#11-lançador-modular)) e aparecem como "referência real" ao lado do foguete na aba do foguete (`lspPayloadKg` em `RocketTab.tsx`).

Limitações: a curva do Atlas V é uma digitalização de terceiros, não um download da NASA; curvas da LSP são conservadoras (3-sigma); a interpolação é linear e não extrapola fora dos pontos.

## 5. Motores, tanques, boosters e estágios

Os arquivos marcam com "estimate:" todo valor que nenhuma fonte primária confirmou. Custos são sempre balanceamento de jogo.

### Motores (`src/data/engines.ts`)

| Motor | Empuxo SL / vácuo (kN) | Isp SL / vácuo (s) | Massa (kg) | Fonte | Valores "estimate" |
|---|---|---|---|---|---|
| RD-180 | 3.827 / 4.152 | 311,3 / 337,8 | 5.480 | ULA Atlas V Launch Services User's Guide Rev 11 (2010), fig. 1.4.1-3; massa: NPO Energomash via Glavkosmos e Wikipedia | nenhum |
| Merlin 1D | 845 / 914 | 282 / 311 | 470 | SpaceX Falcon User's Guide 2020 (arquivado) via Wikipedia; empuxo vácuo = 8.227 kN ÷ 9 | massa 470 kg |
| Merlin 1D Vacuum | 0 / 981 | 0 / 348 | 500 | Wikipedia "Falcon 9" (Block 5, citando spacex.com); o artigo do Falcon Heavy lista 934 kN | massa 500 kg |
| RS-25D | 1.860 / 2.279 | 366 / 452,3 | 3.177 | dados Aerojet Rocketdyne (rocket.com arquivado) via Wikipedia; NASA SLS RS-25 fact sheet; 109% da potência nominal | nenhum (massa via Wikipedia) |
| RL10C-1 | 0 / 101,9 | 0 / 449,7 | 190 | empuxo: ULA Mars 2020 mission overview; Isp e massa: Wikipedia "RL10" (citando NTRS 20110015783 e dados Aerojet Rocketdyne) | nenhum |
| RL10C-1-1 | 0 / 105,98 | 0 / 453,8 | 188 | Aerojet Rocketdyne RL10 data sheet (arquivado) via Wikipedia | nenhum |
| BE-4 | 2.446,5 / 2.650 | 310 / 340 | 5.400 | empuxo SL: ULA BE-4 fact sheet | Isp 340 s (a ULA cita ~340 s sem dizer se é SL ou vácuo; tratado como vácuo), Isp SL 310 s, empuxo vácuo 2.650 kN, massa 5.400 kg |

Origem por tipo: a NASA publica diretamente o RS-25 (fact sheet do SLS) e há uma referência NTRS para o RL10. Os demais vêm do fabricante ou do provedor de lançamento (ULA, Aerojet Rocketdyne, SpaceX, NPO Energomash), em parte por meio da Wikipedia, citada em cada entrada.

### Boosters (`src/data/boosters.ts`)

| Booster | Propelente / seca (kg) | Empuxo médio SL / vácuo (kN) | Isp SL / vácuo (s) | Fonte | Valores "estimate" |
|---|---|---|---|---|---|
| GEM 63 | 44.200 / 5.100 | 1.090 / 1.239 | 245,4 / 279,06 | Northrop Grumman GEM 63/63XL datasheet (DS-26): 49.300 kg total, queima de 97,6 s, 1,60 × 20,09 m, saída do bocal 1,37 m; Isp do catálogo NG via Wikipedia | Isp tratado como vácuo; empuxo médio e valores SL derivados |
| GEM 63XL | 48.000 / 5.400 | 1.351 / 1.511 | 250,5 / 280,3 | mesmo datasheet: 53.400 kg total, 87,3 s, 1,60 × 21,95 m, bocal 1,42 m | idem |
| Booster lateral líquido tipo Falcon | 410.900 / 22.200 | 9 × Merlin 1D | 282 / 311 | montado do estágio `ref-fhe-side` e de 9 Merlin 1D | herda a massa estimada do Merlin |

Derivação dos sólidos (cabeçalho do arquivo): `empuxo_vac = propelente / tempo de queima × Isp_vac × g₀`, `empuxo_SL = empuxo_vac − 101.325 Pa × área de saída do bocal`, `Isp_SL = Isp_vac × empuxo_SL / empuxo_vac`. O empuxo de pico do datasheet é maior (1.649,6 kN e 2.060,6 kN).

### Estágios de referência (`src/data/presetReference.ts`) e tanques (`src/data/tanks.ts`)

Os estágios de referência guardam os números publicados dos veículos por trás das curvas LSP. Os tanques "de referência" carregam a estrutura real do estágio (massa seca publicada menos os motores); `catalog.test.ts` exige que tanque + motores fiquem a 5% do estágio real em propelente e massa seca.

| Estágio | Propelente (kg) | Massa seca (kg) | Fonte | Valores "estimate" |
|---|---|---|---|---|
| Atlas V Common Core Booster | 284.089 | 21.054 (inclui RD-180; tanque `tank-k381-ccb` = 15.574) | ULA Atlas V User's Guide Rev 11, fig. 1.4.1-3/1.4.1-4 | nenhum |
| Atlas V Centaur (um motor) | 20.830 | 2.243 (inclui RL10; tanque = 2.053) | idem | nenhum |
| Atlas V interestágio e coifa LPF 4 m | — | 947; 2.127 | idem | nenhum |
| Falcon Heavy booster lateral (×2) e núcleo central | 410.900 cada | 22.200 cada (tanque = 17.970) | Wikipedia "Falcon Heavy", citando Espace & Exploration nº 51; a SpaceX não publica massas de estágio | massa do núcleo central (a tabela dá um valor só para os três núcleos; o central reforçado é mais pesado na realidade); tanque depende da massa estimada do Merlin |
| Falcon Heavy segundo estágio | 107.500 | 4.000 (tanque = 3.500) | idem | tanque depende da massa estimada do MVac |
| Falcon Heavy coifa | — | 1.700 | idem | nenhum |
| Vulcan booster | 353.400 (382.000 bruto − 28.600 vazio, derivado) | 28.600 (tanque = 17.800) | Wikipedia "Vulcan Centaur" (lida em 2026-10-22) | tanque depende da massa estimada do BE-4 |
| Centaur V (heavy) | 54.000 | 5.700 (tanque = 5.324) | idem | massa seca: fração estrutural do Centaur III (0,099) × 54 t + 2 × 188 kg; a ULA não publica |
| Vulcan coifa 5,4 m | — | 2.640 | idem | massa: coifa 5-m Short do Atlas V (3.524 kg, 20,7 m) escalada pelo comprimento |
| GEM 63XL (×4) | 48.000 | 5.400 | Northrop Grumman DS-26 | nenhum |

Tanques genéricos (famílias S/M/L de 3,7 m e 5,4 m para kerolox, hydrolox e methalox) usam frações secas de balanceamento dentro de faixas reais (kerolox 0,05–0,07; hydrolox 0,10–0,12; methalox 0,06–0,08). O comprimento é o de um cilindro com o volume do propelente na densidade média da mistura (kerolox 1.023, hydrolox 362, methalox 833 kg/m³), sem domos nem interestágio. O tanque "Half Core" de 3,81 m é balanceamento (metade do CCB com a mesma fração).

Uso no jogo: o jogador monta o foguete com essas peças (`src/physics/launcher.ts`). Os presets `atlas-v-401`, `falcon-heavy-exp` e `vulcan-vc4` reproduzem os veículos reais estágio por estágio e são validados contra a LSP. As coifas do jogo são só "pequena" (1.500 kg) e "grande" (2.500 kg), balanceamento; cada preset usa a mais próxima da real (Atlas V 2.127 kg → grande; Falcon Heavy 1.700 kg → pequena; Vulcan 2.640 kg → grande).

Limitações: valores "estimate" acima; empuxo e Isp constantes por fase; nenhum modelo de estrangulamento (throttle).

## 6. Peças da espaçonave

Arquivo: `src/data/spacecraftParts.ts`. Escala de orbitadores reais da NASA em Marte (MRO, MAVEN) e seus instrumentos. Custo, pontos de ciência e volume de dados por turno são sempre balanceamento.

| Peça | Valor real e fonte | Valores "estimate" |
|---|---|---|
| Barramento (`sc-core`), 560 kg, −350 W | MRO 892 kg e MAVEN 744 kg de barramento (seca menos carga útil; press kits) incluem painéis, antenas e propulsão, que aqui são peças separadas | 560 kg é o restante; carga de 350 W |
| Painel solar 12 m² (MAVEN), 3.200 W a 1 UA | MAVEN gera 1.150–1.700 W em Marte com 12 m² (press kit do MAVEN), × r² ≈ 3.200 W a 1 UA | massa 60 kg (~55 W/kg; painéis rígidos 31–85 W/kg, NASA SmallSat SoA, Power) |
| Painel solar 20 m² (MRO), 6.000 W a 1 UA | 6.000 W a 1 UA, 2.000 W no afélio de Marte, 20 m² (press kit do MRO) | massa 110 kg |
| MMRTG, 43,6 kg, 110 W | NASA Mars 2020 MMRTG fact sheet | nenhum |
| Bateria Li-ion 55 Ah | MAVEN voa 2 × 55 Ah (press kit) | 1.540 Wh = 55 Ah × 28 V; 13 kg a ~120 Wh/kg (NASA SmallSat SoA) |
| Antena de baixo ganho, 0,01 Mbit/s a 1 UA | ordem de grandeza típica (~10 kbit/s a 1 UA numa antena DSN de 34 m) | taxa, massa e potência |
| Antena de alto ganho 3 m (MRO), 0,9 Mbit/s a 1 UA | MRO: prato de 3 m, TWTA de 100 W em banda X, 2,6 Mbit/s numa antena DSN de 34 m a 0,59 UA (press kit), × d² ≈ 0,9 Mbit/s | massa 60 kg, carga 200 W |
| Terminal laser (DSOC), 57 Mbit/s a 1 UA | DSOC (Psyche): 25 Mbit/s a 226 milhões de km (1,51 UA) em 8 Abr 2024, abertura de 22 cm (notícia NASA JPL), × d² ≈ 57 Mbit/s | massa 30 kg, 100 W |
| Câmera (HiRISE), 65 kg, −60 W | HiRISE: 65 kg, < 60 W em média, abertura 0,5 m (Bergstrom et al., IAF 2004; University of Arizona LPL) | nenhum |
| Espectrômetro (CRISM), 32,92 kg, −45,8 W | CRISM instrument catalog, NASA PDS Geosciences Node | nenhum |
| Radar (SHARAD) | SHARAD: 10 W de RF, 15–25 MHz, dipolo de 10 m (press kit do MRO) | total 15 kg e 40 W |
| Magnetômetro (MAVEN MAG) | — | 0,6 kg e 5,7 W (números do MAVEN MAG não confirmados) |
| Blindagem contra radiação, 30 kg | — | massa; fator de blindagem 0,5 é balanceamento |
| Mantas contra micrometeoroides, 25 kg | — | massa |
| Gravador 160 Gbit (MRO) | MRO: 160 Gbit (press kit) | massa e potência |
| Gravador 32 Gbit (MAVEN) | MAVEN: 32 Gbit (press kit) | massa e potência |
| Hidrazina monopropelente, Isp 230 s | MRO 6 × 170 N e MAVEN 6 × 200 N (press kits); família MR-107, Isp 223–237 s (spec sheet L3Harris/Aerojet Rocketdyne) | massa seca 75 kg, 20 W |
| Bipropelente, Isp 318 s | LEROS 1b: 635 N, Isp ≥ 317 s (página da Nammo); 318 s de média em voo (Wikipedia "LEROS") | massa seca 120 kg, 30 W |

Uso no jogo: massa seca, propelente para a captura, potência em Marte, taxa de enlace, armazenamento e ciência (`src/game/spacecraft.ts`, `ops.ts`). A espaçonave de referência soma 972 kg secos e US$ 507 M; com propelente, 1.507 kg.

Limitações: muitas massas e potências de subsistema são estimativas; a taxa de cada antena é uma única taxa a 1 UA escalada com 1/d², sem orçamento de enlace completo.

## 7. Missões reais para comparação

Arquivo: `src/data/realMissions.ts`. Usado só em comparações factuais no relatório (`src/screens/Report.tsx`) e como âncora da curva do Atlas V.

| Missão | Lançamento | Veículo | Massa no lançamento | Massa seca | Custo | Chegada | Δv de MOI | C3 | Fonte |
|---|---|---|---|---|---|---|---|---|---|
| Mars Reconnaissance Orbiter | 2005-08-12 | Atlas V 401 | 2.180 kg | 1.031 kg | ~US$ 720 M (450 nave e instrumentos, 90 lançamento, 180 operações em 5,5 anos) | 2006-03-10 | 1.015 m/s | — | JPL MRO launch press kit (Ago 2005); MOI: catálogo da missão MRO no NASA PDS |
| MAVEN | 2013-11-18 | Atlas V 401 | 2.454 kg | 809 kg | US$ 671 M (ciclo de vida) | 2014-09-22 | ≈ 1.233 m/s | 12,07 km²/s² | NASA MAVEN launch press kit (Nov 2013); C3 e MOI: NTRS 20160000802 |

## 8. Texturas da NASA

Detalhes completos em `public/textures/SOURCES.md`. Todas baixadas em 2026-10-22 e redimensionadas com sharp 0.34 (Lanczos3, mozjpeg). Os originais não ficam no repo. Imagens da NASA em geral não têm copyright; o jogo dá crédito na tela de fontes e não sugere endosso da NASA.

| Arquivo | Origem | Licença e crédito |
|---|---|---|
| `earth_bluemarble_4k.jpg` (4096×2048) | Blue Marble Next Generation, dezembro de 2004, topografia + batimetria (5400×2700) | domínio público; NASA Earth Observatory |
| `mars_viking_4k.jpg` (4096×2048) | Mars Viking MDIM 2.1, mosaico global colorido (21339×10670, 1 km/px) | USGS: "public domain", sem restrição de uso; NASA/JPL/USGS |
| `starmap_8k.jpg` (8192×4096) | Deep Star Maps, SVS 3895 (J2000 RA/Dec) | domínio público; NASA/Goddard Space Flight Center Scientific Visualization Studio |
| `sun_sdo_aia171_2k.jpg` (2048×2048) | SDO/AIA 171 Å, imagem de 2026-10-23 00:36:46 UT (4096×4096); faixa de legenda pintada de preto | domínio público; NASA/SDO e as equipes AIA, EVE e HMI |

Limitação: não há script para as texturas. Para recriar, baixe os originais listados em `SOURCES.md` numa pasta vazia e redimensione (sharp não é dependência do projeto). A URL do SDO sempre serve a imagem mais recente, então uma nova coleta dá outra imagem.

## 9. Referência de validação: NASA/TM-2010-216764

| Campo | Valor |
|---|---|
| Documento | *Interplanetary Mission Design Handbook: Earth-to-Mars Mission Opportunities 2026 to 2045*, NASA/TM-2010-216764 |
| Autores | L. M. Burke, R. D. Falck, M. L. McGuire, NASA Glenn Research Center, outubro de 2010 |
| URL | https://ntrs.nasa.gov/citations/20100037210 |
| Lido em | 2026-10-23 |
| Valores usados | tabela 2 (p. 12): mínimos de energia da oportunidade de 2026; tabela 1 (p. 10): ótimo de 2026, C3 9,144, Tipo II |
| Onde | `REF` em `src/physics/porkchop.test.ts`; texto em `src/data/sources.ts` (`porkchop-validation`) |

Resumo: mínimo de C3 Tipo II do manual 9,144 km²/s² (31 Out 2026 → 19 Ago 2027, 292 dias, v∞ 2,729 km/s); o jogo dá 9,18 km²/s² (31 Out 2026 → 20 Ago 2027, 293 dias, v∞ 2,71 km/s). Tolerâncias do teste: C3 ±0,3 km²/s², v∞ ±0,05 km/s, datas ±3 dias. A tabela completa com as três linhas e as diferenças está em [PHYSICS.md, seção 8](PHYSICS.md#8-validação-contra-nasatm-2010-216764).

## 10. Valores de balanceamento de jogo

Estes números não vêm de dados publicados. Foram escolhidos para o jogo funcionar, dentro de ordens de grandeza reais, e a interface os marca como "game balance". `MISSION_GAME_BALANCE` em `src/data/mission.ts` lista quais campos de `MISSION` são balanceamento.

| Valor | Número | Arquivo |
|---|---|---|
| Orçamento da missão | US$ 900 M | `mission.ts` (`budgetM`) |
| Orçamento de subida (TWR 1,5) | 9.400 m/s | `mission.ts` (`ASCENT_DV`) |
| Coeficiente de perda gravitacional | 3.000 m/s; TWR limitado a [1,1; 2,5] | `mission.ts` |
| TWR mínimo de decolagem / de estágio superior | 1,1 / 0,25 | `mission.ts` |
| Margem de lançamento | massa úmida ≤ 90% da capacidade | `mission.ts` (`launchMargin`) |
| Turnos de operação | 6 de 30 dias | `mission.ts` |
| Meta de ciência | 100 pontos | `mission.ts` |
| Buffer interno de dados | 40 Gbit | `mission.ts` |
| Cruzeiro máximo | 600 dias (sem uso na lógica do cruzeiro hoje) | `mission.ts` |
| Coifas | pequena 1.500 kg, US$ 3 M; grande 2.500 kg, US$ 5 M | `src/physics/launcher.ts` |
| Limites do foguete | 3 estágios, 1–9 motores por estágio, 0–6 boosters | `launcher.ts` |
| Custo dos motores (US$ M cada) | RD-180 30; Merlin 1D 2,5; Merlin Vacuum 4; RS-25D 60; RL10C-1 14; RL10C-1-1 15; BE-4 18 | `engines.ts` |
| Custo dos boosters (US$ M cada) | GEM 63 8; GEM 63XL 10; lateral Falcon 40 | `boosters.ts` |
| Custo dos tanques | base + por tonelada de propelente: kerolox 2 + 0,04; hydrolox 3 + 0,6; methalox 2 + 0,05 | `tanks.ts` |
| Frações secas dos tanques genéricos | kerolox 0,05/0,06; hydrolox 0,11; methalox 0,06/0,07 | `tanks.ts` |
| Custo das peças da espaçonave (US$ M) | barramento 180; painel 12 m² 25; painel 20 m² 45; MMRTG 110; bateria 6; baixo ganho 4; alto ganho 40; laser 120; câmera 70; espectrômetro 60; radar 50; magnetômetro 10; blindagem 15; mantas 10; gravador 160 Gbit 12; gravador 32 Gbit 5; hidrazina 25; bipropelente 45 | `spacecraftParts.ts` |
| Ciência por turno / dados por turno | câmera 6 / 120 Gbit; espectrômetro 6 / 40 Gbit; radar 8 / 20 Gbit; magnetômetro 2 / 0,5 Gbit | `spacecraftParts.ts` |
| Fator da blindagem | remove 50% do risco de erupção | `spacecraftParts.ts` |
| Cobertura da bateria | Wh / 4 h | `src/game/spacecraft.ts` |
| Reserva de TCM | 0–150 m/s | `spacecraft.ts` |
| Erro de injeção | N(0, 2 m/s) por eixo | `src/game/cruise.ts` |
| Janelas de TCM | dia 15, dia 60, chegada − 30 dias | `cruise.ts` |
| Distância máxima para captura | 10.000 km do centro de Marte na data de chegada | `cruise.ts` |
| Riscos de erupção | base 0,15 (M) e 0,40 (X); modo de segurança 0,02; atitude blindada × 0,5 | `src/game/events.ts` |
| Custos e recompensas de erupção | modo de segurança: 5 dias e bateria ≥ 300 Wh; atitude: 2 m/s; observar: +2 (M) ou +4 (X) | `events.ts` |
| Agenda de erupções | 2–3 por cruzeiro, a partir do dia 10, espaçadas ≥ 20 dias | `events.ts` |
| Contato com a DSN | 8 h por dia | `src/physics/link.ts` |
| Pontuação | multiplicador 1,5; +Δv restante/100; −5 a cada 10 dias em modo de segurança; 3 estrelas com ≥ 20% do orçamento | `src/game/scoring.ts` |

Custos medidos dos presets (foguete vazio): Atlas V 401 US$ 77,9 M; Falcon 9 US$ 54,2 M; Falcon Heavy US$ 134,2 M; Vulcan VC4 US$ 166,1 M. Com a espaçonave de referência (US$ 507 M), a missão de referência custa US$ 585 M.

## 11. Atualizando os dados

### Comandos

```bash
node scripts/fetch-horizons.mjs                  # efemérides de Terra e Marte (sem chave)
node scripts/fetch-donki.mjs                     # DONKI ao vivo: api.nasa.gov, depois CCMC
node scripts/fetch-donki.mjs --from-wayback      # DONKI arquivado (como o arquivo atual foi feito)
npm run fetch:data                               # os dois primeiros, em sequência
npm test                                         # rode sempre depois de atualizar
```

Node 18+ basta para os scripts (sem dependências); o projeto pede Node ≥ 22.12. Os scripts escrevem em `src/data/generated/` e gravam a data local da execução em `fetched`.

### Chave da API

`fetch-donki.mjs` usa a variável de ambiente `NASA_API_KEY` para `api.nasa.gov`; sem ela usa `DEMO_KEY`, que tem limite baixo de requisições. Peça uma chave gratuita em https://api.nasa.gov/. O script troca o valor da chave por `api_key=REDACTED` antes de gravar a URL no JSON, para que nenhuma chave entre no repositório. O Horizons não precisa de chave.

### Modos de falha

- Horizons: cada corpo tem 3 novas tentativas com espera crescente (2, 4 e 8 s). O script para com erro se a resposta não tiver o bloco `$$SOE…$$EOE`, se uma linha não puder ser lida, se o passo não for exatamente 1 dia, ou se o cabeçalho não nomear as soluções de efeméride.
- DONKI ao vivo: tenta `api.nasa.gov` e depois o endpoint do CCMC, cada um com 3 novas tentativas. Se os dois falharem, sai com código 1, não escreve nada e sugere o modo `--from-wayback`. Se a resposta não tiver nenhuma erupção M ou X, recusa gravar um arquivo vazio.
- `npm run fetch:data` roda o DONKI no modo ao vivo. Se a API estiver no ar, o arquivo atual (três janelas do Wayback) é substituído por uma consulta do ano inteiro de 2024, e o teste `catalog.test.ts` que fixa as três janelas (241 erupções) passa a falhar. Isso é esperado: atualize o teste e o texto do README junto com os dados.
- Novas efemérides podem mudar levemente os números do porkchop. Os testes de validação (`porkchop.test.ts`) e o `REFERENCE_DESIGN` em `src/game/checklist.ts` (datas fixas 31 Out 2026 → 20 Ago 2027) dependem deles. O intervalo 2026-07-01 a 2029-07-01 está fixo no script e no teste `ephemeris.test.ts`.

### Nunca inventar dados

Os scripts nunca escrevem eventos ou valores inventados: na falha eles param. A mesma regra vale para quem edita os arquivos em `src/data/`: todo número precisa de uma fonte no campo `source`; o que não tiver fonte primária leva o prefixo "estimate:" com a justificativa; o que for escolha de jogo é marcado como "game balance". Se uma fonte mudar, atualize também a entrada em `src/data/sources.ts` e a data.

## 12. Texto para o campo "NASA data" do Space Apps

A submissão do Space Apps precisa estar em inglês, então a lista abaixo fica em inglês, pronta para colar:

```text
- NASA/JPL Solar System Dynamics, Horizons System (https://ssd.jpl.nasa.gov/horizons/): daily heliocentric state vectors of Earth (DE441) and Mars (mar099), ecliptic J2000, 2026-07-01 to 2029-07-01, fetched 2026-10-22. Every cell of our porkchop plot is a Lambert solve between these positions; they also drive the cruise, Mars arrival, solar power vs. distance, radio data rate, signal delay and solar conjunction.
- NASA DONKI, Space Weather Database Of Notifications, Knowledge, Information (NASA GSFC CCMC, https://kauai.ccmc.gsfc.nasa.gov/DONKI/): 241 M- and X-class solar flares from three archived ~30-day windows of 2024 (Wayback Machine snapshots of the DONKI FLR service, fetched 2026-10-22). Real flares, with their real dates and classes, strike the spacecraft during cruise.
- NASA Launch Services Program, Launch Vehicle Performance Website (https://elvperf.ksc.nasa.gov/Pages/Query.aspx): payload vs. C3 curves for Falcon Heavy (expendable) and Vulcan VC4 (queried 2026-10-22) and Atlas V 401 (LSP curve as digitized in the open-source AMAT tool). Our rocket model matches every curve point within 8%.
- NASA/TM-2010-216764, Interplanetary Mission Design Handbook: Earth-to-Mars Mission Opportunities 2026 to 2045 (Burke, Falck, McGuire, NASA Glenn, https://ntrs.nasa.gov/citations/20100037210): reference for validating our 2026 porkchop minimum (handbook C3 9.144 km²/s², ours 9.18 km²/s², same departure date).
- NASA/JPL Mars Reconnaissance Orbiter and MAVEN launch press kits, NTRS 20160000802 (MAVEN trajectory design), NASA PDS (MRO mission catalog, CRISM instrument catalog): spacecraft part masses, power, data rates and the real-mission comparison in the final report.
- NASA Mars 2020 MMRTG fact sheet, NASA/JPL Deep Space Optical Communications results, NASA SLS RS-25 fact sheet, NASA Small Spacecraft Systems Virtual Institute State of the Art (Power): power source, laser terminal, engine and subsystem figures.
- NASA imagery (public domain): Blue Marble Next Generation (NASA Earth Observatory), Mars Viking MDIM 2.1 mosaic (USGS/NASA), Deep Star Maps SVS 3895 (NASA Goddard SVS), SDO/AIA 171 Å image of 2026-10-23 (NASA SDO).
```
