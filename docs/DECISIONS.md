# Registro de decisões

Registro no estilo ADR (architecture decision record) das decisões que moldaram o protótipo de visão. Fontes: a spec ([seção 8](superpowers/specs/2026-10-22-mission-architect-vision-design.md#8-tech) e [seção 13 "Calls made by Claude"](superpowers/specs/2026-10-22-mission-architect-vision-design.md#13-calls-made-by-claude-user-to-check)) e as rulings (decisões do controlador) R1 a R37 do ledger (registro) de construção (`.superpowers/sdd/2026-10-22-mission-architect-vision/progress.md`). Os números de tarefa (T1 a T17) remetem ao [plano de implementação](superpowers/plans/2026-10-22-mission-architect-vision.md).

Veja também: [README](../README.md), [ARCHITECTURE.md](ARCHITECTURE.md), [PHYSICS.md](PHYSICS.md), [DATA.md](DATA.md), [GAMEPLAY.md](GAMEPLAY.md), [HACKATHON.md](HACKATHON.md), [DEVELOPMENT.md](DEVELOPMENT.md), [DESIGN.md](../DESIGN.md).

## Como ler

Cada entrada tem um ID, um título e quatro linhas: a decisão, o motivo, o custo se estiver errada (e como revisitar) e o status.

| Prefixo | Origem | Quem decidiu |
|---|---|---|
| U | Decisões do usuário registradas na spec | Usuário |
| C | "Calls made by Claude", spec seção 13 | IA, para o usuário conferir |
| R | Rulings do controlador durante a construção | IA (processo de build) |
| F | Achado da revisão final | IA (processo de build) |
| P | Itens estacionados no fim do ledger | IA (processo de build) |

Status usados: "Em vigor", "Concluída" (ação pontual já feita), "Não acionada" (regra condicional cuja condição nunca ocorreu), "Aberta".

## Sumário

1. [Produto e UX](#produto-e-ux)
2. [Modelo físico](#modelo-físico)
3. [Dados](#dados)
4. [Balanceamento de jogo](#balanceamento-de-jogo)
5. [Engenharia](#engenharia)

## Produto e UX

### U1. Protótipo de visão, não a submissão (usuário)
- Decisão: construir um protótipo ambicioso que mostra à equipe como é uma entrada forte; a equipe reconstrói uma versão menor nas 48 h do evento (14 e 15 nov 2026).
- Por quê: o protótipo pode ir além do que cabe num fim de semana, desde que cada peça tenha uma versão cortada reproduzível (spec seção 11).
- Se estiver errado: a equipe chega ao evento com expectativas acima do que consegue reconstruir. Revisitar com o plano de corte de [HACKATHON.md](HACKATHON.md).
- Status: Em vigor.

### U2. Impacto visual e matemática séria sobre dados da NASA (usuário)
- Decisão: os juízes devem lembrar de duas coisas: 3D cinematográfico desde os primeiros segundos e matemática visível sobre dados reais da NASA.
- Por quê: o critério Relevance exige dados da NASA como componente central, e o vencedor mais parecido (PureFlow, 2025) usava dados reais na mecânica.
- Se estiver errado: 3D bonito sobre matemática decorativa, um dos anti-objetivos da spec.
- Status: Em vigor.

### U3. Construção modular de foguete em 3D, com decolagem do foguete do jogador (usuário)
- Decisão: o jogador empilha estágios num hangar 3D e vê o próprio foguete decolar.
- Por quê: é o plano de abertura do vídeo e a parte mais tátil do loop.
- Se estiver errado: custo alto de 3D no hackathon; o plano de corte permite voltar ao 2D.
- Status: Em vigor no protótipo; simplificar para 2D no hackathon.

### U4. UI moderna de alto nível, bibliotecas de UI permitidas (usuário)
- Decisão: interface moderna, com bibliotecas de componentes; a escolha da stack ficou com a IA (C2).
- Por quê: o visual pesa em Presentation e o prazo não permite componentes acessíveis feitos à mão.
- Se estiver errado: dependências a mais para a equipe aprender no evento.
- Status: Em vigor.

### U5. Decisões durante o cruzeiro (usuário)
- Decisão: depois do lançamento o jogador gerencia a missão com poucas decisões significativas, limitadas pelo projeto.
- Por quê: o desafio pede "manage"; um projeto bom deve dar opções boas e um projeto marginal só opções ruins.
- Se estiver errado: o cruzeiro vira espera; a IA definiu quais decisões (C10).
- Status: Em vigor.

### C4. Só a sonda de Marte é jogável (IA)
- Decisão: Europa e asteroide aparecem como cartões bloqueados ("Coming soon").
- Por quê: uma missão completa vale mais que três pela metade; os cartões mostram o alcance.
- Se estiver errado: juízes acham o escopo pequeno. Os cartões saem no corte do hackathon.
- Status: Em vigor.

### C5. Só inglês, desktop primeiro (IA)
- Decisão: interface em inglês, a partir de 1280 px, funcionando em notebook de 1366 × 768; sem layout de celular.
- Por quê: o Space Apps exige inglês; juízes avaliam em computador.
- Se estiver errado: alunos brasileiros sem inglês têm mais dificuldade. Tradução fica para depois do evento.
- Status: Em vigor.

### C9. Atalhos de desenvolvimento em vez de pipeline de vídeo (IA)
- Decisão: flags de URL (`?phase=…&preset=reference&seed=N`) abrem qualquer fase com o projeto de referência e eventos fixos; produzir o vídeo fica fora do escopo.
- Por quê: planos repetíveis para o vídeo sem jogar 10 minutos a cada tomada.
- Se estiver errado: nenhum custo relevante; as flags não aparecem para o jogador comum.
- Status: Em vigor (completada por R23).

### C10. Decisões de cruzeiro = erupções e TCMs; escolhas leves nas operações (IA, sobre U5)
- Decisão: o cruzeiro tem respostas a erupções solares e manobras de correção; as operações têm escolha de instrumentos por turno.
- Por quê: são decisões reais de equipes de voo e ligam o projeto às consequências.
- Se estiver errado: as operações podem ser demais; a spec permite cortá-las.
- Status: Em vigor. A escolha da spec de "o que enviar por downlink" virou automática (só instrumentos são escolhidos).

### C11. O lançamento visualiza os números calculados (IA)
- Decisão: a animação reproduz a linha do tempo da equação do foguete (tempos de queima, separações); não há motor de física de voo.
- Por quê: o que o jogador vê é o que a física calculou, sem segundo modelo para divergir.
- Se estiver errado: perde-se realismo de trajetória de subida, que a spec declara fora do escopo.
- Status: Em vigor.

### R21. Décimo item da checklist: "Spacecraft complete" (IA, T7)
- Decisão: acrescentar o item que exige bus, peças conhecidas e limites de quantidade.
- Por quê: sem ele, uma nave sem bus passaria em todos os outros itens.
- Se estiver errado: uma linha a mais na checklist.
- Status: Em vigor.

### R30. Seed nova a cada jogo, a não ser que a URL fixe uma (IA, T13)
- Decisão: "New mission" sorteia uma seed nova (crypto ou `Math.random`); `?seed=` mantém a mesma.
- Por quê: variedade para quem joga, determinismo para demos.
- Se estiver errado: nenhum custo conhecido.
- Status: Em vigor.

### R31. "Launch anyway" quando só TWR ou margem falham (IA, T13)
- Decisão: o painel de lançamento oferece lançar contra a checklist apenas se todos os itens vermelhos forem TWR ou margem; o botão "Launch" principal continua bloqueado.
- Por quê: o aluno vê o foguete falhar na plataforma, antes da órbita ou da partida, e lê a lição.
- Se estiver errado: cerca de 40 linhas para remover.
- Status: Em vigor.

### R32. Fluxo depois de falhas (IA, T13)
- Decisão: lançamento que falha mostra a tela de lançamento e depois o relatório; a captura fica na tela de chegada; só a captura leva às operações, o sobrevoo vai ao relatório.
- Por quê: a história fica mais clara quando a falha aparece onde aconteceu.
- Se estiver errado: nenhum custo conhecido.
- Status: Em vigor.

### R35. Texto do diálogo de reinício depois de uma missão terminada (IA, T16 → T17)
- Decisão: depois do relatório, o diálogo diz "Start a new flight?" em vez de "Restart the mission?".
- Por quê: o texto antigo falava de um voo "em andamento" que já tinha acabado.
- Se estiver errado: nenhum custo.
- Status: Concluída (T17).

### R37. "Fly again" renomeado para "New mission" (IA, revisão final)
- Decisão: o botão do relatório que volta à seleção se chama "New mission"; "Revise design" é o caminho para voar o mesmo projeto de novo.
- Por quê: "Fly again" sugeria repetir o voo, mas o botão reinicia tudo.
- Se estiver errado: nenhum custo.
- Status: Em vigor.

## Modelo físico

### C1. Peças com especificações reais; curvas LSP validam presets (IA, sobre U3)
- Decisão: motores e tanques carregam dados publicados (Isp, empuxo, massa); as curvas de carga útil × C3 do NASA LSP servem para validar presets, não como lista de escolha.
- Por quê: o jogador constrói com a mesma física que valida os foguetes reais.
- Se estiver errado: presets não batem com a NASA; o teste `launcher.test.ts` acusaria.
- Status: Em vigor (presets dentro de −7,9 % a +6,6 %).

### F1. Validar o porkchop contra o handbook da NASA (IA, revisão final)
- Decisão: o teste do porkchop compara os mínimos com a Tabela 2 de NASA/TM-2010-216764: C3 tipo II 9,144 (31 out 2026 → 19 ago 2027) contra 9,18 nosso (31 out → 20 ago).
- Por quê: a revisão final apontou que o porkchop era conferido contra a própria saída, e a spec seção 6 exige referência publicada.
- Se estiver errado: tolerâncias (±0,3 km²/s², ±0,05 km/s, ±3 dias) frouxas demais esconderiam um erro; Curtis e o teste de ida e volta cobrem o solver.
- Status: Concluída.

### R2. Limite do C3 mínimo no teste (IA, T4)
- Decisão: se o melhor C3 real caísse fora de [7, 14] km²/s² com os testes de Curtis e ida e volta passando, alargar o limite para o valor achado ±1.
- Por quê: física validada de forma independente vale mais que um limite chutado.
- Se estiver errado: um bug do solver se esconde atrás de uma asserção frouxa.
- Status: Não acionada (9,18 caiu dentro); F1 trouxe a referência publicada.

### R3. Tolerância LSP de reserva (IA, T6)
- Decisão: se ±15 % fosse inviável para todos os pontos, aceitar ±20 % só para C3 ≥ 15.
- Por quê: é no C3 alto que um modelo de perdas fixas mais diverge.
- Se estiver errado: presets menos precisos em C3 alto.
- Status: Não acionada (o teste "no R3 fallback needed" passa com ±15 %).

### R8. A fórmula manda: `propellantFor(1000, 320, 1000)` = 375,3 kg (IA, T2)
- Decisão: corrigir o valor esperado do plano (374,7), que era erro de aritmética.
- Por quê: conferido à mão pela equação do foguete.
- Se estiver errado: nenhum custo.
- Status: Concluída.

### R11. Terra pelo geocentro, não pelo baricentro Terra–Lua (IA, T3)
- Decisão: manter o corpo 399 do Horizons; o teste de interpolação de meio dia da Terra aceita 50 km (a Lua desloca o geocentro cerca de 31 km), Marte fica em 1 km; precisão também conferida contra vetores reais de 12 h (94 m e 9 m).
- Por quê: o porkchop parte do centro da Terra.
- Se estiver errado: checagem de interpolação mais fraca para a Terra, compensada pela comparação de 12 h.
- Status: Em vigor.

### R12. Células perto de 180° ficam finitas (IA, T4)
- Decisão: transferências próximas de 180° são soluções 3D reais com C3 de até ~2.011; o gráfico corta a escala de cor ("very high") e a capacidade do foguete vira 0 para C3 inalcançável.
- Por quê: fisicamente correto vale mais que NaN artificial.
- Se estiver errado: o gráfico mostra uma faixa de C3 alto em vez de uma faixa vazia.
- Status: Em vigor.

### R17. Subida com termo de perda gravitacional (IA, T6)
- Decisão: Δv de subida = 9.400 m/s (a TWR 1,5) + 3.000 × (1/TWR − 1/1,5) m/s, game balance calibrado nas curvas LSP.
- Por quê: um orçamento fixo não servia para Atlas V (TWR 1,17) e Falcon Heavy ou Vulcan (~1,6) ao mesmo tempo; a perda gravitacional cresce de verdade quando a TWR cai, e vira conceito ensinável.
- Se estiver errado: um segundo parâmetro ajustável; validado pelas três curvas.
- Status: Em vigor.

### R18. TWR mínima de decolagem 1,1; preset de referência = Atlas V 401 (IA, T6)
- Decisão: baixar o mínimo de 1,2 para 1,1 (o Atlas V 401 real decola com ~1,17); a referência usa a pilha do Atlas V 401 porque ela leva 2.410 kg a C3 9,18, acima do limiar de 1.920 kg fixado na ruling.
- Por quê: o foguete que lançou MAVEN e MRO precisa voar no jogo; TWR baixa passa a ser penalizada por R17, não bloqueada.
- Se estiver errado: muda o limiar da checklist.
- Status: Em vigor.

### R19. Estágios superiores precisam de TWR de ignição ≥ 0,25 (IA, T6)
- Decisão: um estágio superior abaixo disso, com tudo o que leva, não "alcança" a carga na bisseção de capacidade.
- Por quê: fecha a brecha em que menos motores no estágio superior sempre venciam; estágios reais acendem entre 0,3 e 0,8.
- Se estiver errado: o Centaur V do Vulcan fica perto do limite; conferir os ajustes LSP.
- Status: Em vigor.

### R20. A TWR no termo de perda gravitacional é limitada a [1,1; 2,5] (IA, T6)
- Decisão: limitar a TWR usada na fórmula de R17.
- Por quê: sem o limite, uma pilha com TWR 8 precisaria de só 7.776 m/s; os presets voam entre 1,17 e 1,65 e não mudam.
- Se estiver errado: nenhum custo conhecido.
- Status: Em vigor.

### R25. TCM perto de 180° mira no plano orbital atual (IA, T9)
- Decisão: a menos de 5° de uma transferência de 180°, a TCM mira Marte projetado no plano orbital da nave; a TCM seguinte remove o resto fora do plano.
- Por quê: ali o Lambert puro é singular (cerca de 940 m/s na TCM-1 da referência contra ~6 m/s cinco dias depois); é o que navegadores fazem em transferências quase de 180°.
- Se estiver errado: custos de TCM perto de 180° diferem um pouco de um otimizador 3D completo.
- Status: Em vigor.

### R34. TCMs miram o centro de Marte (IA, T16)
- Decisão: manter o modelo; a interface chama a leitura de "Aim error" (distância ao ponto de mira, o centro de Marte) e a simplificação aparece na tela de fontes.
- Por quê: honesto e barato; a captura assume periapse de 300 km.
- Se estiver errado: um ponto de mira no B-plane seria mais realista. Fica como melhoria futura.
- Status: Em vigor.

## Dados

### C3. Todos os dados da NASA pré-baixados em JSON estático (IA)
- Decisão: scripts Node em `scripts/` baixam os dados para `src/data/generated/`; o jogo não faz chamadas de rede durante a partida.
- Por quê: a demo não pode quebrar porque uma API caiu, e isso aconteceu com o DONKI em 22 out 2026.
- Se estiver errado: dados envelhecem; `npm run fetch:data` atualiza.
- Status: Em vigor.

### R5. Ordem de fontes do DONKI (IA, antes de T5)
- Decisão: tentar api.nasa.gov, depois o endpoint direto do CCMC, depois respostas reais arquivadas no Wayback Machine, com a procedência registrada. Nunca inventar eventos.
- Por quê: continua sendo dado do DONKI; só muda o transporte.
- Se estiver errado: a nota de procedência fica mais fraca.
- Status: Em vigor; o terceiro caminho foi o usado (R13).

### R6. Presets validados por curvas LSP (IA, antes de T5)
- Decisão: Atlas V 401 (digitalização AMAT do site LSP, ancorada no C3 12,07 do MAVEN), Falcon Heavy descartável e Vulcan VC4; Falcon 9 existe sem curva.
- Por quê: são as curvas que os dados da NASA sustentam (o site não lista mais o Falcon 9 descartável).
- Se estiver errado: um preset validado a menos.
- Status: Em vigor (os três validados entraram).

### R7. Duas opções de propulsão da nave (IA, antes de T5)
- Decisão: hidrazina monopropelente (Isp 230 s, a escolha real de MRO e MAVEN, mais barata) e bipropelente (Isp 318 s, mais pesada e cara).
- Por quê: a pesquisa corrigiu o "biprop 320" do plano e a escolha é uma troca real.
- Se estiver errado: uma peça a mais.
- Status: Em vigor.

### R9. Parâmetro `EPHEM_TYPE` do Horizons (IA, T3)
- Decisão: usar `EPHEM_TYPE`; o `EPHEMERIS_TYPE` do plano retorna HTTP 400.
- Por quê: a API real manda.
- Se estiver errado: nenhum custo.
- Status: Concluída.

### R10. Limite da distância de Marte em 1,6662 UA (IA, T3)
- Decisão: o limite do teste sobe para 1,6662 UA (o dado real chega a 1,666101).
- Por quê: o limite do plano era arredondado.
- Se estiver errado: nenhum custo.
- Status: Concluída.

### R13. Erupções DONKI de três janelas arquivadas (IA, T5)
- Decisão: usar três respostas reais de ~30 dias do DONKI de 2024, via Wayback (241 erupções M e X, maio a dezembro de 2024); o campo `source` diz que a cobertura é parcial.
- Por quê: dado real da NASA por arquivo vale mais que uma tarefa travada.
- Se estiver errado: a amostra cobre 78 dias de 2024. Rodar `npm run fetch:data` quando o DONKI voltar.
- Status: Em vigor.

### R14. Frações de massa seca dos tanques podem sair das faixas do plano (IA, T5)
- Decisão: aceitar valores fora das faixas quando dados reais de estágios (`presetReference.ts`) exigem.
- Por quê: dado real vale mais que faixa chutada.
- Se estiver errado: tanques genéricos um pouco leves.
- Status: Em vigor.

### R16. Boosters líquidos do Falcon Heavy como `BoosterPart` (IA, T6)
- Decisão: os núcleos laterais viram boosters com propelente líquido opcional, montados com dados de referência (9 Merlin 1D).
- Por quê: um único caminho de estágios paralelos para boosters sólidos e líquidos.
- Se estiver errado: os boosters laterais não são editáveis peça a peça no hangar.
- Status: Em vigor.

### R24. Erupções sorteadas da lista, não pelo calendário (IA, T9)
- Decisão: `scheduleEvents` sorteia erupções do conjunto DONKI pela seed; cada evento mostra a data e a classe reais.
- Por quê: as lacunas de cobertura deixam de importar; o texto é "Based on the real event of <data>".
- Se estiver errado: os eventos não seguem o calendário do cruzeiro, o que é intencional.
- Status: Em vigor.

## Balanceamento de jogo

### R15. Volume de dados por turno com 8 h/dia de Deep Space Network (IA, T5)
- Decisão: volume do turno = taxa (Mbit/s na distância real) × 8 h de contato por dia × dias do turno.
- Por quê: liga Mbit/s reais a Gbit por turno.
- Se estiver errado: rebalancear as operações (foi o que R27 fez).
- Status: Em vigor (o README fala em "one Deep Space Network pass per day"; o código usa 8 h/dia).

### R22. O consumo de energia conta todas as peças ligadas (IA, T7)
- Decisão: gravador e aquecedores da propulsão entram no consumo, não só bus, rádio e instrumentos.
- Por quê: mais honesto.
- Se estiver errado: a checagem de potência fica um pouco mais rígida.
- Status: Em vigor.

### R26. Modo de segurança só soma dias de modo de segurança (IA, T9)
- Decisão: o modo de segurança não mexe na ciência de cruzeiro; a pontuação desconta 5 pontos a cada 10 dias.
- Por quê: um único lugar para o custo, já previsto no plano.
- Se estiver errado: nenhum custo.
- Status: Em vigor.

### R27. Rebalanceamento dos instrumentos (IA, T10)
- Decisão: volumes de dados realistas (câmera + espectrômetro + radar = 180 Gbit por turno), ajustados para: referência com antena de alto ganho entrega ≥ 100; só baixo ganho entrega ≤ 60 % disso; laser remove o limite; armazenamento importa.
- Por quê: com os valores antigos o rádio nunca limitava (146–221 Gbit possíveis contra 21 coletados) e a referência não chegava a 100.
- Se estiver errado: números de instrumentos se afastam dos reais (estão marcados como game balance).
- Status: Em vigor (referência 110,1; baixo ganho 1,3; laser 120).

### R28. Teste em que o armazenamento cheio reduz a ciência (IA, T10)
- Decisão: exigir um cenário (gravador pequeno atravessando a conjunção de 21 mar 2028) em que dados perdidos baixam a ciência entregue.
- Por quê: "dados perdidos" com uma nota não demonstrava a troca de R27.
- Se estiver errado: um teste a mais.
- Status: Em vigor (os testes são de caracterização).

### R36. Sobrevoo é falha (IA, revisão final)
- Decisão: sem captura (sobrevoo, erro de mira ou falta de propelente) o resultado é "failure" com pontuação 0; as lições ainda citam a ciência de cruzeiro.
- Por quê: a spec seção 4.9 diz "flyby (failure)".
- Se estiver errado: estrelas mais duras para sobrevoos.
- Status: Em vigor.

## Engenharia

### C2. Stack Vite + React + TypeScript + React Three Fiber + Tailwind/shadcn + Motion + Zustand (IA, sobre U4)
- Decisão: essa stack, com Vitest, abandonando a regra do protótipo antigo de "sem frameworks, sem 3D, sem dependências".
- Por quê: componentes acessíveis prontos, 3D declarativo e estado simples.
- Se estiver errado: curva de aprendizado para a equipe no evento.
- Status: Em vigor.

### C6. Trabalho na branch `vision-prototype` (IA)
- Decisão: o código antigo fica intacto em `main`.
- Por quê: o protótipo é uma referência, não substitui o que existia.
- Se estiver errado: nenhum custo.
- Status: Em vigor.

### C7. Construção em camadas (IA)
- Decisão: (a) dados, Lambert, porkchop, lançador, nave, captura e relatório de ponta a ponta com visual simples; (b) 3D e câmera; (c) eventos DONKI, painel de física e polimento.
- Por quê: um loop funcionando cedo; se faltar tempo, o loop vence qualquer plano isolado do vídeo.
- Se estiver errado: nenhum custo; a mesma regra vale para o hackathon.
- Status: Concluída (camada A terminou com 265 testes).

### C8. Código fácil de extrair (IA)
- Decisão: física e regras de jogo em TypeScript puro, sem React, three.js nem DOM, documentados e testados.
- Por quê: as regras do Space Apps sobre código pré-existente não estão confirmadas; a equipe pode reaproveitar se for permitido ou redigitar usando como referência.
- Se estiver errado: nenhum custo; ver [HACKATHON.md](HACKATHON.md#reaproveitar-ou-reconstruir).
- Status: Em vigor.

### R1. `startCruise` aceita um erro de injeção opcional (IA, T9)
- Decisão: `startCruise(design, seed, opts?: { injectionErrorMs?: Vec3 })`.
- Por quê: o teste precisa de um voo com erro zero, e um global só para testes seria pior.
- Se estiver errado: um parâmetro opcional para remover.
- Status: Em vigor.

### R4. `GameView` definido na store (IA, T11)
- Decisão: `GameView` = estado da store + `rocketStats`, `spacecraftStats` e `checklist` derivados; o `live()` dos conceitos recebe esse objeto.
- Por quê: o tipo não existia em lugar nenhum do plano.
- Se estiver errado: renomear um tipo.
- Status: Em vigor.

### R23. Flags de URL jogam as fases anteriores (IA, T8 → T13)
- Decisão: `?phase=…&preset=reference` carrega o projeto de referência; em T13 as fases de voo passaram a ser jogadas por `autoplay` com escolhas padrão.
- Por quê: abrir o cruzeiro ou as operações precisa mostrar estado real e determinístico.
- Se estiver errado: até T13, as telas de voo abriam vazias.
- Status: Concluída (T13).

### R29. A grade do porkchop fica no `GameView` (IA, T12)
- Decisão: aceitar uma renderização extra do painel quando a grade chega; o hover fica isolado.
- Por quê: custo desprezível.
- Se estiver errado: nenhum custo relevante.
- Status: Em vigor.

### R33. Edições só de texto em `src/game` na fase de polimento (IA, T16)
- Decisão: aceitar mudanças de redação (linha de log do ajuste de TCM, lição de erro de mira "on the arrival date").
- Por quê: o controlador conferiu o diff: nenhum número nem comportamento mudou.
- Se estiver errado: nenhum custo.
- Status: Concluída.

### P1. Comentário do teste do porkchop sobre a diferença do tipo I (IA, estacionado)
- Decisão: o comentário atribuía a diferença do tipo I a arredondamento; deveria citar modelo, efeméride e a forma do vale. Só texto, números conferidos.
- Por quê: não afeta resultado.
- Se estiver errado: nenhum custo.
- Status: Aberta no ledger; o comentário em HEAD já cita efeméride (DE441) e quantização da grade, então parece resolvido.

### P2. Comentários desatualizados em `PresetPicker.tsx` e `devParams.ts` (IA, estacionado)
- Decisão: o comentário do `PresetPicker` diz que o teste confere ±8 % (o teste exige ±15 %; o selo de ±8 % é verdadeiro por medição); o cabeçalho de `devParams.ts` diz que seed inválida vira 1 (o store sorteia uma seed nova). Só comentários.
- Por quê: não muda comportamento.
- Se estiver errado: nenhum custo.
- Status: Aberta.
