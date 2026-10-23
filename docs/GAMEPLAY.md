# Guia de jogo: Mission Architect

Guia para quem joga e para quem ensina com o jogo. Descreve cada fase como ela está implementada na branch `vision-prototype` (telas em `src/screens/`, regras em `src/game/`). Os números vêm do código e dos testes; quando um valor é "game balance" (balanceamento de jogo, não física real), o guia diz isso, como o próprio jogo faz.

A interface do jogo é em inglês. Os rótulos de tela aparecem aqui entre aspas, em inglês, às vezes com uma tradução entre parênteses.

Outros documentos: [README](../README.md) (visão geral e como rodar), [DESIGN.md](../DESIGN.md) (identidade visual), [ARCHITECTURE.md](ARCHITECTURE.md), [DEVELOPMENT.md](DEVELOPMENT.md), [PHYSICS.md](PHYSICS.md) (fórmulas e validação), [DATA.md](DATA.md) (fontes de dados), [HACKATHON.md](HACKATHON.md), [DECISIONS.md](DECISIONS.md), a [spec](superpowers/specs/2026-10-22-mission-architect-vision-design.md) e o [plano](superpowers/plans/2026-10-22-mission-architect-vision.md).

## Sumário

1. [A ideia em um parágrafo](#a-ideia-em-um-parágrafo)
2. [Fase a fase](#fase-a-fase)
3. [Missão de referência, com os números reais](#missão-de-referência-com-os-números-reais)
4. [Falhar de propósito para aprender](#falhar-de-propósito-para-aprender)
5. [Para professores](#para-professores)
6. [Teclado e acessibilidade](#teclado-e-acessibilidade)

## A ideia em um parágrafo

Você planeja uma única missão, a sonda orbital "Red Watch", para mapear Marte e procurar gelo enterrado. A data de lançamento (escolhida no porkchop plot) fixa a energia de lançamento C3 e a velocidade de chegada v∞. O C3 decide quanta massa o seu foguete consegue mandar; o v∞ decide quanto propelente a nave precisa para frear em Marte. Massa da nave, capacidade do foguete e custo total precisam fechar dentro do orçamento de US$ 900 M (game balance). Depois do lançamento você não pilota: toma decisões discretas (correções de rota, respostas a erupções solares, quais instrumentos ligar) dentro do que o seu projeto permite. O relatório final explica cada resultado com a física por trás dele.

Uma partida completa leva de 10 a 15 minutos.

## Fase a fase

A barra superior mostra as fases em ordem: seleção, briefing, design, launch, cruise, arrival, ops, report. A tela "Data sources" (fontes de dados) abre de qualquer fase. Um painel lateral "Physics in play" acompanha todas as fases com os conceitos em jogo, cada um com fórmula, explicação curta e os seus próprios números substituídos nela (27 conceitos em `src/data/concepts.ts`).

### 1. Seleção de missão

Três cartões. Só "Red Watch" (Mars orbiter, órbita de 300 × 33.000 km) é jogável. "Ice Shell" (sobrevoo de Europa) e "Stone Courier" (retorno de amostra de asteroide) aparecem com "Coming soon" para mostrar o alcance da ideia. O botão diz "Plan Red Watch" num jogo novo e "Continue Red Watch" com "Start over" quando já existe progresso.

Ao abrir a missão, o jogo começa a calcular o porkchop plot em segundo plano, para que ele esteja pronto quando você chegar ao design.

### 2. Briefing

Quatro números que julgam o seu projeto: teto de orçamento US$ 900 M, meta de ciência de 100 pontos, órbita de captura 300 × 33.000 km e 180 dias de operações (6 turnos de 30 dias). Orçamento, meta e duração são game balance.

Abaixo vêm duas figuras:

- A linha do tempo da janela de Marte do fim de 2026, em escala (um dia tem a mesma largura em todo lugar). Partidas de 1 set 2026 a 31 jan 2027, chegadas até 31 mar 2028.
- O "Δv map": quanto cada trecho da viagem custa e quem paga. O foguete paga a subida até a órbita de estacionamento de 200 km e a queima de partida; a nave paga as correções de rota (a reserva que você escolher) e a inserção em órbita de Marte. Antes de você escolher uma transferência, o mapa usa a de C3 mínimo.

"Start design" leva ao workspace de design.

### 3. Workspace de design

Três abas que você visita na ordem que quiser: "Trajectory", "Rocket" e "Spacecraft". Cada aba mostra "go" ou "N no-go" conforme os itens da checklist que dependem dela. À direita fica o painel "Launch readiness" (prontidão para lançamento), sempre visível, com:

- "Mass vs launch limit": massa úmida da nave contra o limite de 90 % da capacidade do foguete no C3 escolhido.
- "Cost vs budget": foguete + nave contra US$ 900 M.
- A checklist de lançamento. Clicar num item abre a aba que o corrige.
- O botão "Launch", que só libera quando os 10 itens estão "go".

Todo número se recalcula a cada mudança: trocar a data muda o C3, que muda a capacidade do foguete, que muda a margem.

#### Aba Trajectory: o porkchop plot

![Porkchop plot com curvas de C3 e a prévia 3D do sistema solar](screenshots/porkchop.png)

Cada célula é uma solução do problema de Lambert entre a Terra e Marte, com posições reais do JPL Horizons. A grade padrão tem 77 datas de partida (de 2 em 2 dias) por 122 datas de chegada (de 3 em 3 dias), 9.394 pares, com tempo de voo entre 100 e 500 dias. O cálculo roda num Web Worker no seu navegador.

- Passe o mouse: a prévia 3D desenha em tracejado o arco daquela célula; a escolha atual fica em linha contínua cor de ferrugem.
- Clique para escolher. "Choose the minimum C3" escolhe o mínimo da janela.
- Células vazias não têm transferência; células muito caras aparecem como "very high".

Abaixo do gráfico, quatro leituras dizem o que a escolha significa para o resto do projeto: "Launch C3", "Arrival v∞" (com a queima de captura correspondente), "Flight time" e "Rocket capacity" (com o limite de 90 % para a nave).

O que você troca aqui: C3 baixo deixa o foguete levar mais massa; v∞ de chegada baixo pede menos propelente para frear. Os dois mínimos não caem no mesmo dia. O mínimo de C3 da janela é 9,18 km²/s² (31 out 2026 → 20 ago 2027); o mínimo de v∞ de chegada fica em 6 nov 2026 → 7 set 2027 (2,565 km/s). Ambos conferem com o handbook de missões da NASA (detalhes em [PHYSICS.md](PHYSICS.md)).

#### Aba Rocket: construtor e presets

Comece por um preset ou empilhe estágios (até 3). Cada estágio tem motor, quantidade de motores, tanques do propelente certo e, no primeiro estágio, boosters laterais opcionais. Há uma coifa "small" (1.500 kg) ou "large" (2.500 kg), game balance. O hangar 3D mostra a pilha em escala; sem WebGL aparece um desenho lateral 2D.

Leituras por estágio: Δv (equação do foguete), TWR de decolagem ou de ignição, massa na ignição e custo. Leituras do foguete inteiro: capacidade até o seu C3, a curva NASA LSP (Launch Services Program) quando existe, Δv total, TWR de decolagem (mínimo 1,1, game balance) e custo.

Presets, com a nave de referência (1.507 kg) e o C3 de 9,18 km²/s² (valores de `launchChecklist`):

| Preset | TWR na decolagem | Capacidade a C3 9,18 | Custo do foguete | Curva LSP |
|---|---|---|---|---|
| Atlas V 401-class | 1,17 | 2.410 kg | US$ 78 M | sim |
| Falcon Heavy-class (expendable) | 1,65 | 11.679 kg | US$ 134 M | sim |
| Vulcan VC4-class | 1,59 | 7.347 kg | US$ 166 M | sim |
| Falcon 9-class (expendable) | 1,42 | 3.865 kg | US$ 54 M | não (o site LSP não lista mais a versão descartável) |

Os três presets com curva LSP ficam dentro de ±8 % dos pontos publicados pela NASA, e a interface mostra o selo "Matches NASA LSP curve". Um jogo novo começa com o Atlas V 401-class.

O que você troca aqui: mais estágios e motores dão mais Δv e TWR, mas custam dinheiro. O foguete mais barato que ainda passa na margem deixa mais orçamento sobrando, e orçamento sobrando aumenta a pontuação. Com a nave de referência, o Falcon 9-class termina com 192 pontos e o Atlas V 401-class com 190 (seed 1).

#### Aba Spacecraft: construtor da nave

Peças por subsistema. As massas e potências vêm de documentos da NASA quando existem (MRO, MAVEN, HiRISE, CRISM, MMRTG, DSOC); custo, ciência e volume de dados são game balance.

| Categoria | Peças (máximo) | O que trocam |
|---|---|---|
| Bus | Spacecraft bus, 560 kg, 350 W (exatamente 1) | Obrigatório |
| Power | Painel 12 m² (até 2), painel 20 m² (1), MMRTG 110 W (até 4), bateria 1.540 Wh (até 2) | Painéis perdem potência com 1/r²; o RTG não depende do Sol mas custa US$ 110 M |
| Communications | Antena de baixo ganho 0,01 Mbit/s (até 2), alto ganho 3 m 0,9 Mbit/s (1), terminal laser 57 Mbit/s (1) | Taxa a 1 UA; cai com 1/d² |
| Instruments | Câmera (6 ciência, 120 Gbit/turno), espectrômetro (6, 40), radar (8, 20), magnetômetro (2, 0,5) | Ciência contra potência, massa e dados |
| Data storage | Gravador 160 Gbit ou 32 Gbit (além de 40 Gbit embutidos) | Guarda o que o rádio não consegue mandar |
| Protection | Blindagem contra radiação (remove 50 % do risco das erupções), mantas contra micrometeoroides | As mantas só somam massa e custo neste build |
| Propulsion | Hidrazina monopropelente (Isp 230 s, 75 kg) ou bipropelente (Isp 318 s, 120 kg); só um | Isp maior pede menos propelente, mas a peça é mais pesada e mais cara |

O controle "Trajectory-correction reserve" (reserva para correções de trajetória) vai de 0 a 150 m/s em passos de 5. O propelente total cobre a queima de captura mais essa reserva e aparece dividido em "For capture" e "For TCM reserve".

Leituras: massa úmida, propelente, potência em Marte (na distância Sol–Marte da data de chegada), custo, downlink a 1 UA e na chegada, dados e ciência por turno. O modelo 3D da nave muda com as peças.

#### A checklist de lançamento

São 10 itens, todos recalculados do zero a cada mudança (`src/game/checklist.ts`):

| Item na tela | Passa quando |
|---|---|
| "Transfer selected" | Há uma célula válida escolhida no porkchop |
| "Rocket stack valid" | A pilha não tem erros (motor sem tanque, propelente errado, estágio superior fraco demais etc.) |
| "Liftoff TWR ≥ 1.1" | Empuxo ÷ peso na decolagem, com a nave a bordo, ≥ 1,1 |
| "Launch margin ≥ 10%" | Massa úmida da nave ≤ 90 % da capacidade do foguete no C3 |
| "Within budget" | Foguete + nave ≤ US$ 900 M |
| "Spacecraft complete" | Tem bus, nenhuma peça desconhecida, limites de quantidade respeitados |
| "Power at Mars" | Geração em Marte + bateria (Wh ÷ 4 h) ≥ consumo de todas as peças ligadas |
| "Radio link to Earth" | Pelo menos uma antena |
| "Science instruments" | Pelo menos um instrumento |
| "Orbit insertion engine" | Exatamente um sistema de propulsão capaz de entregar captura + reserva |

#### "Launch anyway"

Se os únicos itens "no-go" forem TWR e/ou margem de lançamento, aparece o link "Launch against the checklist…" e depois o botão "Launch anyway" (lançar mesmo assim). Ele existe para o aluno ver o foguete falhar e ler por quê. Qualquer outro item vermelho mantém o lançamento bloqueado.

### 4. Lançamento

![Tela de lançamento com a decolagem 3D e os eventos de voo](screenshots/launch.png)

O seu próprio foguete decola. A animação reproduz os números calculados: tempos de queima a partir da massa de propelente e da vazão, separação de cada estágio quando o propelente acaba, separação de boosters e da coifa. Não é uma simulação de voo separada. O HUD mostra o relógio T+, o estágio, o Δv gasto contra o Δv necessário e o evento atual. Cerca de 25 s em 3D; "Skip" mostra o resultado na hora e "Replay" repete.

Três falhas possíveis, cada uma com texto próprio:

- "Pad abort": TWR de decolagem abaixo de 1,1. Os motores acendem e desligam na plataforma.
- "Short of orbit": o Δv acabou antes da órbita de estacionamento de 200 km.
- "Short of the departure": chegou em órbita, mas o estágio superior não completou a queima até o C3 da transferência.

Com sucesso, "Into cruise" segue para o cruzeiro. Com falha, "Read the report" vai direto ao relatório e "Revise design" volta ao workspace.

A subida não é voada de verdade: custa um orçamento de 9.400 m/s a TWR 1,5, mais uma perda gravitacional de 3.000 × (1/TWR − 1/1,5) m/s (game balance calibrado nas curvas LSP). Por isso um foguete com TWR baixo gasta mais Δv para chegar à órbita.

### 5. Cruzeiro

![Tela de cruzeiro com o alvo de mira e uma decisão de TCM](screenshots/cruise.png)

A nave voa uma órbita de dois corpos em torno do Sol, a partir da solução de Lambert mais um pequeno erro de injeção do lançador (sorteado pela seed, desvio-padrão de 2 m/s por eixo). Leituras: "Aim error" (distância ao ponto de mira, o centro de Marte, na data de chegada), propelente, v∞ de chegada previsto e distância atual até Marte.

Time warp (aceleração do tempo): pausa, 1, 5 ou 20 dias por segundo. O tempo para sozinho:

- em cada janela de TCM (trajectory correction maneuver, manobra de correção de trajetória);
- em cada erupção solar;
- 3 dias antes da chegada ("Final approach", aproximação final);
- na chegada.

Enquanto uma decisão estiver pendente, o tempo não anda.

#### Janelas de TCM

| Janela | Quando |
|---|---|
| TCM-1 | 15 dias após o lançamento |
| TCM-2 | 60 dias após o lançamento |
| TCM-3 | 30 dias antes da chegada |

Em cada janela o cartão mostra "Cost now" (Δv e kg de propelente), "If you wait" (erro de mira se você não fizer nada), "After the burn" e o propelente antes e depois. Os botões são "Burn now" (a queima re-mira o arco no centro de Marte) e "Wait". A captura exige erro de mira de até 10.000 km.

A troca: corrigir cedo é barato, porque um pequeno erro de velocidade vira um erro de posição proporcional ao tempo que falta. Na missão de referência (seed 1), se nada for corrigido a nave passa a 114.394 km de Marte. Corrigir custa 2,39 m/s na TCM-1, 2,17 m/s na TCM-2 (se a TCM-1 foi pulada) e 43,91 m/s na TCM-3 (se as duas primeiras foram puladas).

Se não houver propelente suficiente, "Burn now" fica desabilitado com o motivo, e só resta esperar.

#### Erupções solares

Cada cruzeiro tem de 2 a 3 erupções, sorteadas pela seed entre 241 erupções M e X reais de 2024 do NASA DONKI. Elas caem a partir do dia 10, com pelo menos 20 dias entre uma e outra. O cartão mostra a classe e a data real ("Based on the real event of…"). Classe M é "moderate" (risco base 15 %) e classe X é "severe" (risco base 40 %). Todos os riscos, custos e recompensas são game balance:

| Opção na tela | Risco de dano | Custo | Disponível quando |
|---|---|---|---|
| "Enter safe mode" | 2 % | 5 dias em modo de segurança (−2,5 pontos na pontuação) | Bateria ≥ 300 Wh |
| "Keep observing the flare" | risco base × (1 − blindagem) | nenhum; +2 (M) ou +4 (X) de ciência de cruzeiro se nada for danificado | Sempre |
| "Turn the shielded side to the Sun" | metade do anterior | 2 m/s de propelente | Há propelente para a manobra |

Um dano desliga um instrumento ao acaso, que fica indisponível nas operações. É aqui que o projeto aparece: sem bateria não há modo de segurança, sem blindagem o risco de observar é o risco cheio, sem propelente sobrando não dá para girar a nave.

A linha do tempo "The cruise, to scale" marca as TCMs (queimadas ou puladas) e as erupções. Na chegada, "Approach Mars" leva à fase seguinte.

### 6. Chegada

Antes da queima: v∞ de chegada, Δv da captura (MOI, Mars orbit insertion), erro de mira e o propelente necessário contra o que há a bordo. Há um único botão, "Fire the capture burn". O resultado não depende de sorte, só do estado da nave:

- Captura ("Go · Captured"): erro de mira ≤ 10.000 km e propelente suficiente para a queima no v∞ real. A órbita de 300 × 33.000 km é desenhada em 3D. "Begin science operations" segue para as operações.
- Sobrevoo ("No-go · Flyby"): longe demais do ponto de mira, ou propelente insuficiente. A nave passa por Marte numa hipérbole. "Read the report" vai ao relatório. Um sobrevoo é falha da missão, com pontuação 0.

### 7. Operações científicas

Seis turnos de 30 dias em órbita. Em cada turno você escolhe quais instrumentos ligar, dentro da potência que sobra depois do bus, do rádio e do gravador. Leituras do turno: distância Terra–Marte (JPL Horizons), atraso de luz em um sentido (d / c), capacidade de downlink do turno e o que está guardado a bordo.

Regras (`src/game/ops.ts`):

- Potência: painéis escalados pela distância real Sol–Marte na data do turno, mais RTG, mais bateria (Wh ÷ 4). Se faltar até para o bus e o rádio, não há downlink.
- Dados: tudo o que os instrumentos observam entra no armazenamento (gravador + 40 Gbit embutidos). O rádio manda o que cabe: taxa a 1 UA ÷ d², 8 horas de contato com a Deep Space Network por dia, 30 dias.
- A ciência chega à Terra na mesma proporção dos dados enviados. O que não cabe no armazenamento é sobrescrito e a ciência dele se perde.
- Conjunção solar: com Marte a menos de 3° do Sol visto da Terra, nada desce naquele turno.

O gráfico "Data collected vs sent to Earth" mostra, turno a turno, o coletado e o enviado. "Run turn N" executa o turno; depois do sexto, "Operations complete" leva ao relatório.

A troca: ligar tudo enche o armazenamento quando Marte se afasta da Terra. Uma antena maior ou o terminal laser devolvem mais do que os instrumentos veem.

### 8. Relatório

![Relatório com pontuação, linha do tempo e lições](screenshots/report.png)

Resultado (`src/game/scoring.ts`, tudo game balance):

- Sucesso: capturado e ciência ≥ 100.
- Sucesso parcial: capturado com menos de 100.
- Falha: não capturado, por qualquer motivo (plataforma, órbita, partida, erro de mira, propelente).

Pontuação, mostrada na tela com os seus números:

```
score = ciência × (1 + 0,5 × fração do orçamento que sobrou) × 1,5
        + Δv que sobrou após a captura / 100
        − 5 × dias em modo de segurança / 10
```

Arredondada, nunca negativa, e 0 em caso de falha. "Ciência" é a ciência de operações que chegou à Terra mais a ciência de cruzeiro.

Estrelas: falha 0; parcial 1; sucesso com pelo menos 20 % do orçamento sobrando 3; outro sucesso 2.

Depois vêm a linha do tempo da missão em escala e "What happened, and why", as lições escolhidas pelo que aconteceu na sua missão, cada uma com os seus números e, quando cabe, a fórmula: "Too heavy to leave the pad", "Short of orbit", "Not enough energy for Mars", "Safe mode", "Solar flare damage", "Missed Mars", "Not enough propellant to brake", "Captured into Mars orbit", "Solar conjunction", "Science limited by the radio link", "Power-limited operations", e um fechamento ("Mission accomplished", "Partial success" ou "Cruise science only") com a duração do voo.

"Compared with two real Mars orbiters" compara a sua missão com MRO e MAVEN, que voaram em Atlas V 401:

| | MRO | MAVEN |
|---|---|---|
| Lançamento | 12 ago 2005 | 18 nov 2013 |
| Massa no lançamento | 2.180 kg | 2.454 kg |
| Custo total | cerca de US$ 720 M | US$ 671 M |
| Inserção em órbita | 10 mar 2006, 1.015 m/s | 22 set 2014, cerca de 1.233 m/s |

Botões finais: "New mission" volta à seleção com o projeto inicial e eventos novos (ou os mesmos, se a URL fixar `?seed=`). "Revise design" mantém o projeto e os mesmos eventos para você ajustar e voar de novo.

## Missão de referência, com os números reais

A missão de referência é `REFERENCE_DESIGN` em `src/game/checklist.ts`. Para abrir direto em qualquer fase dela:

```
http://localhost:5173/?phase=design&preset=reference&seed=1
```

Troque `phase` por `launch`, `cruise`, `arrival`, `ops` ou `report`. Nas fases de voo, o jogo joga sozinho até ali com escolhas padrão: queima toda TCM que conseguir pagar, responde às erupções com modo de segurança (se não der, girar a blindagem; se não der, observar) e liga todos os instrumentos que couberem na potência.

Valores abaixo medidos no código em HEAD com seed 1:

| Etapa | Valor |
|---|---|
| Transferência | 31 out 2026 → 20 ago 2027, 293 dias, C3 9,18 km²/s², v∞ de chegada 2,71 km/s |
| Foguete | Atlas V 401-class, 2 estágios, 332,2 t na decolagem, TWR 1,17, capacidade 2.410 kg a C3 9,18 |
| Nave | 972 kg seca + 535 kg de hidrazina = 1.507 kg; limite de lançamento 2.169 kg (90 % de 2.410) |
| Peças | bus, painel 20 m², bateria, antenas de alto e baixo ganho, câmera, espectrômetro, radar, gravador 160 Gbit, blindagem, monopropelente; reserva de TCM de 50 m/s |
| Custo | foguete US$ 78 M + nave US$ 507 M = US$ 585 M de 900 |
| Potência em Marte | 2.524 W gerados a 1,54 UA + 385 W de bateria contra 746 W de consumo |
| Lançamento | erro de injeção de 3,72 m/s |
| TCMs | TCM-1 2,39 m/s (1,6 kg), TCM-2 0,88 m/s (0,6 kg), TCM-3 dispensada (correção abaixo de 0,05 m/s) |
| Erupções | X1.1 no dia 23 (evento DONKI de 30 dez 2024) e M2.5 no dia 260 (23 mai 2024); modo de segurança nas duas, sem dano |
| Captura | 938 m/s; sobram 20,4 kg de propelente |
| Operações | 20 de ciência por turno; a partir do turno 3 o rádio limita (Terra a 2,14–2,32 UA); 120 coletados, 110,1 entregues, nenhum dado perdido, sem conjunção |
| Resultado | sucesso, pontuação 190, 3 estrelas |

A conta da pontuação: 110,1 × (1 + 0,5 × 315/900) × 1,5 ≈ 194,1; mais cerca de 0,5 do Δv que sobrou; menos 5 pelos 10 dias de modo de segurança; dá 190. Com as seeds 2 e 3 a pontuação é 190 e 187 (a seed 3 sorteia três erupções e 15 dias de modo de segurança).

Para jogar a referência na mão a partir de um jogo novo: escolha "Choose the minimum C3", mantenha o Atlas V 401-class, monte a nave com as peças da tabela, deixe a reserva em 50 m/s, lance, queime as três TCMs e escolha modo de segurança nas erupções.

## Falhar de propósito para aprender

Perder é parte do jogo: toda falha gera uma lição com os números da missão. Experimentos que funcionam bem em sala, partindo da referência (`?phase=design&preset=reference&seed=1`):

| Experimento | Como fazer | O que acontece (seed 1) | Conceito |
|---|---|---|---|
| Pad abort | Aba Rocket: acrescente mais um tanque ao primeiro estágio (o TWR cai para 0,62); use "Launch against the checklist…" → "Launch anyway" | Os motores acendem e o voo é abortado na plataforma; lição "Too heavy to leave the pad" | TWR |
| Faltou energia para Marte | Escolha uma célula de C3 alto, por exemplo partida 20 dez 2026 e chegada 1 set 2027 (C3 ≈ 33,8 km²/s²), e lance com a margem vermelha via "Launch anyway" | A nave chega à órbita de estacionamento mas não à partida: "Short of the departure"; lição "Not enough energy for Mars" | Equação do foguete, C3 |
| Pular todas as TCMs | Clique "Wait" nas três janelas | Erro de mira de 114.394 km; sobrevoo; lição "Missed Mars" | Correções cedo são baratas |
| Corrigir só no fim | "Wait" na TCM-1 e TCM-2, "Burn now" na TCM-3 | A TCM-3 custa 43,91 m/s (29,1 kg); falta propelente para frear e a nave passa direto. Em 200 seeds, essa estratégia falha 91 vezes | Orçamento de Δv |
| Reserva baixa | Reserva de TCM em 0 m/s | As TCMs gastam cerca de 2 kg e a captura fica sem propelente por pouco; lição "Not enough propellant to brake" | Margem |
| Antena de baixo ganho | Remova a antena de alto ganho | Lança e captura, mas só 1,3 de ciência chega à Terra; sucesso parcial, 1 estrela | Link 1/d² |
| Terminal laser | Troque a antena de alto ganho pelo laser | 120 de ciência entregue, pontuação 199 | Link 1/d² |
| Sem bateria | Remova a bateria | "Enter safe mode" fica indisponível nas erupções (precisa de 300 Wh) | Projeto limita as decisões |
| Sem blindagem, observando | Remova a blindagem e escolha "Keep observing" | Risco de 15 % (M) ou 40 % (X) por erupção; um instrumento pode sair de serviço | Radiação |

Uma dica: a mesma seed repete os mesmos eventos, então "Revise design" permite comparar duas versões do projeto contra exatamente as mesmas erupções.

## Para professores

### Conceitos por fase

O painel "Physics in play" mostra estes conceitos (de `src/data/concepts.ts`), cada um com fórmula e os números do aluno:

| Fase | Conceitos |
|---|---|
| Seleção e briefing | Gravitação, mapa de Δv, transferência de Hohmann, ângulo de fase e janela de lançamento, porkchop plot |
| Design | Problema de Lambert, porkchop plot, C3, equação do foguete, TWR, perdas gravitacionais, estágios, estágios paralelos (boosters), empuxo do estágio superior, margem de lançamento, queima de captura, lei do inverso do quadrado, link budget (orçamento de enlace) |
| Lançamento | C3, equação do foguete, TWR, perdas gravitacionais, estágios, velocidade orbital, velocidade de escape |
| Cruzeiro | Equação vis-viva, periélio e afélio, terceira lei de Kepler, direção da queima, TCM, atraso de sinal |
| Chegada | Vis-viva, esfera de influência, queima de captura |
| Operações | Velocidade orbital, terceira lei de Kepler, inverso do quadrado, link budget, atraso de sinal, conjunção solar |
| Relatório | Mapa de Δv, C3, margem de lançamento, queima de captura, inverso do quadrado |

### Atividades sugeridas

- Caça ao mínimo (20 min). Em duplas, os alunos procuram no porkchop o menor C3 e o menor v∞ de chegada e anotam as datas. Pergunta para discussão: por que não são o mesmo dia? Comparar com o handbook da NASA (tabela no [README](../README.md)).
- Leilão de foguetes (30 min). Com a mesma nave, cada grupo testa um preset e anota capacidade, custo e pontuação final. Quem fez mais pontos? O foguete mais forte venceu?
- Corrigir cedo ou tarde (20 min). Mesma seed, três estratégias de TCM (todas, só a primeira, só a última). Registrar o custo de cada queima e o resultado. Liga com "erro ≈ δv × tempo restante".
- Orçamento de enlace (30 min). Rodar as operações com antena de baixo ganho, alto ganho e laser. Pedir aos alunos que calculem à mão 1/d² para a distância do turno 6 e comparem com o "Downlink this turn" da tela.
- Engenharia de risco (25 min). Grupos defendem uma política para as erupções (sempre modo de segurança, sempre observar, girar a blindagem) e testam com várias seeds. Liga probabilidade com decisão de engenharia.
- Relatório como texto. Cada aluno escreve um parágrafo explicando a sua falha usando a lição do relatório e a fórmula que ela mostra.

Para todos verem os mesmos eventos, distribua a mesma URL com `&seed=` fixo.

## Teclado e acessibilidade

- "Skip to the screen" é o primeiro item de foco e pula a barra superior.
- Porkchop: com o gráfico em foco, as setas movem a mira uma célula (Shift + seta move 5), Home vai ao C3 mínimo, Enter ou Espaço escolhe.
- Time warp: é um grupo de rádio com uma parada de Tab; setas, Home e End trocam a velocidade. Quando uma decisão aparece, o foco vai para o título dela.
- Hangar 3D: arraste para girar; Ctrl + roda do mouse ou os botões para zoom (a roda sozinha rola a página).
- Movimento reduzido: com `prefers-reduced-motion`, o lançamento mostra o resultado direto, com quadros parados de cada evento sob demanda, e as cenas 3D não animam a câmera.
- Sem WebGL: cada cena 3D tem um substituto 2D (mapa da transferência, desenho lateral do foguete, planta da nave, desenho das cônicas na chegada).
- Os resultados das decisões são anunciados em regiões `aria-live`; as figuras SVG têm `aria-label` com os números.
- Botões que avançam fase (queima de captura, "Run turn") ignoram clique duplo.
- O jogo é para desktop, a partir de 1280 px de largura; foi ajustado para notebook de 1366 × 768. Celular não é suportado.
