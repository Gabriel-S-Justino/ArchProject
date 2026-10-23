# Plano de jogo para o hackathon

Este é o manual da equipe para o NASA Space Apps Challenge 2026. A branch `vision-prototype` é um protótipo de visão: mostra como pode ser uma entrada forte. Nas 48 horas do evento a equipe reconstrói uma versão menor. Este documento diz o que reconstruir, em que ordem, como apresentar e o que não pode dar errado na submissão.

Base: o resumo de pesquisa em `.superpowers/docs-brief/research-summary.md` (coletado em 22 out 2026), a seção 11 da [spec](superpowers/specs/2026-10-22-mission-architect-vision-design.md) e o [README](../README.md). Veja também [GAMEPLAY.md](GAMEPLAY.md), [DATA.md](DATA.md), [PHYSICS.md](PHYSICS.md), [ARCHITECTURE.md](ARCHITECTURE.md), [DEVELOPMENT.md](DEVELOPMENT.md), [DECISIONS.md](DECISIONS.md) e o [plano de implementação](superpowers/plans/2026-10-22-mission-architect-vision.md).

## Sumário

1. [Fatos e datas do evento](#fatos-e-datas-do-evento)
2. [Critérios de julgamento: onde estamos](#critérios-de-julgamento-onde-estamos)
3. [Prêmios-alvo](#prêmios-alvo)
4. [Diferenciação](#diferenciação-frente-ao-junior-astronaut-mission-trainer)
5. [Plano de corte para 48 h](#plano-de-corte-para-48-h)
6. [Cronograma e papéis](#cronograma-hora-a-hora-e-papéis)
7. [Reaproveitar ou reconstruir](#reaproveitar-ou-reconstruir)
8. [Vídeo de 30 segundos](#vídeo-de-30-segundos)
9. [Alternativa: apresentação de até 7 slides](#alternativa-apresentação-de-até-7-slides)
10. [Checklist de submissão](#checklist-de-submissão)
11. [Riscos e mitigações](#riscos-e-mitigações)

## Fatos e datas do evento

> Atenção: tudo abaixo foi coletado em 22 out 2026. Os guias de 2026 (julgamento e submissão) só saem em 13 nov 2026, véspera do evento. Releia os dois nesse dia e corrija este documento se algo mudou. As regras de julgamento e de IA citadas aqui são do guia de 2025, arquivado.

| Item | Data ou regra | Fonte |
|---|---|---|
| Hackathon | 14 e 15 nov 2026 (horário do evento local) | [FAQ dos participantes](https://www.spaceappschallenge.org/resources/participant-faqs/) |
| Texto completo dos desafios | 28 out 2026 | FAQ |
| Guias de 2026 | 13 nov 2026 | FAQ |
| Global Nominees e Finalists | dez 2026 | FAQ |
| Global Winners | jan 2027 | FAQ |
| Nosso desafio | "Space Mission Design Game" (tags Intermediate e Beginner/Youth; assunto Games) | [página do desafio](https://www.spaceappschallenge.org/2026/challenges/space-mission-design-game/) |
| Equipe | 1 a 6 pessoas | guia de submissão 2025 |
| Demo | vídeo de até 30 s ou até 7 slides contando o título; passou do limite, fica inelegível | guia de submissão 2025 |
| Idioma | tudo em inglês, ou com legendas em inglês | guia de submissão 2025 |
| Links | públicos, sem login | guia de submissão 2025 |
| Dados da NASA | obrigatórios para prêmios globais | guia de julgamento 2025 |
| IA | permitida, com divulgação; o FAQ de 2026 chama de "Super Intelligence (SI)" | FAQ 2026, guia 2025 |

O texto completo do desafio sai em 28 out. Quando sair, confira se o enunciado ainda pede o que a seção "Relevance" abaixo assume (projetar uma missão com demandas concorrentes).

Guias arquivados de 2025: [julgamento e prêmios](https://web.archive.org/web/20251128144656/https://www.spaceappschallenge.org/resources/judging-awards-guide/) e [submissão](https://web.archive.org/web/20251229205712/https://www.spaceappschallenge.org/resources/project-submission-guide/).

## Critérios de julgamento: onde estamos

Cinco critérios, nota de 1 a 5 cada, sem pesos publicados (o guia de 2017 dava pesos iguais). O caminho é: juízes locais → Global Nominees → juízes especialistas escolhem cerca de 40 Global Finalists e menções honrosas → executivos da NASA e parceiros escolhem 10 Global Winners, um por prêmio.

A nota abaixo é a nossa avaliação honesta do protótipo. A versão do hackathon vai ser menor, então o que importa é manter as evidências marcadas como "manter".

| Critério | O que o guia pede | Evidência no protótipo | Nota estimada | Ponto fraco |
|---|---|---|---|---|
| Validity | Base científica, viável, completo, usável | Porkchop conferido com o handbook da NASA (C3 mínimo 9,18 contra 9,144 km²/s², mesmas datas ±1 dia); presets dentro de −7,9 % a +6,6 % das curvas NASA LSP; 434 testes passando; simplificações listadas na tela "Data sources"; nenhuma chamada de rede durante o jogo | 4 a 5 | Custos, ciência e efeitos das erupções são game balance; TCMs miram o centro de Marte; dados DONKI cobrem só 78 dias de 2024 |
| Relevance | Responder ao desafio inteiro; dados da NASA como "core component… rather than a superficial addition" | Horizons gera o porkchop, o cruzeiro e o enlace de rádio; DONKI gera as decisões do cruzeiro; LSP e NTRS validam a física. O loop data → C3 → foguete → massa → orçamento é o "competing demands" do desafio | 5 (se o texto de 28 out confirmar) | Depende do enunciado completo |
| Creativity | Originalidade | O foguete do jogador decola com a física calculada; erupções reais viram decisões limitadas pelo projeto; a missão inteira cabe numa partida | 4 | Jogos de "monte seu foguete" existem; o diferencial precisa aparecer nos primeiros segundos |
| Impact | Quem se beneficia e quanto | Público de ensino médio e graduação; cada derrota vira uma lição com os números do aluno; roteiro para professores em [GAMEPLAY.md](GAMEPLAY.md) | 3 a 4 | Nenhum teste com alunos reais ainda; só em inglês |
| Presentation | Narrativa e clareza, "equal attention" | Cenas 3D, flags de URL para gravar planos repetíveis, telas em estilo de handbook | 3 a 5 | O vídeo ainda não existe; 30 s é pouco tempo; tudo depende da execução no fim de semana |

O que mais sobe a nota com menos esforço: um vídeo forte (Presentation) e dois ou três alunos jogando antes da submissão, com uma frase de resultado no texto (Impact).

## Prêmios-alvo

Cada Global Winner leva um prêmio. Nossos alvos, em ordem:

1. Best Mission Concept ("most plausible concept and design"). O vencedor de 2025, PureFlow (Brasil), era um designer de habitat com massa, potência e suporte de vida ao vivo, testado contra tempestades solares reais do DONKI: "a survival simulator, not a layout tool". É o análogo mais próximo de nós. A nossa versão cobre a missão inteira, com física validada contra documentos da NASA.
2. Best Use of Data. Os dados da NASA definem as mecânicas: o porkchop é calculado sobre efemérides do Horizons, as decisões do cruzeiro vêm de erupções do DONKI, e as curvas LSP e o handbook do NTRS servem de prova. A tela "Data sources" mostra fonte e data de cada arquivo.
3. Art & Technology. Cenas 3D com texturas da NASA, uma identidade visual própria (veja [DESIGN.md](../DESIGN.md)) e física real por baixo. Em 2025 este prêmio foi para "Henry's Farm Adventures" (Egito), minijogos de navegador ligados a eventos reais por dados da NASA.

Também possíveis: Best Use of Science (validação contra o handbook) e Galactic Impact, se houver evidência de uso em sala.

Padrões dos vencedores passados que já temos: dado da NASA dirigindo uma mecânica, retorno numérico imediato para cada escolha, link público jogável. O que ainda falta: narrativa e papéis (Eco-Metropolis 2024 tinha níveis por idade), e uma equipe com alguém dedicado a design e storytelling.

## Diferenciação frente ao "Junior Astronaut Mission Trainer"

O outro desafio de 2026, "Build a Junior Astronaut Mission Trainer", pede um jogo de posto avançado na Lua ou em Marte. Ele vai atrair projetos parecidos com o nosso na superfície (jogo, Marte, educação). As diferenças que precisamos deixar claras no vídeo e no texto:

- Escopo: nós cobrimos a missão inteira (objetivo, trajetória, foguete, nave, voo, operações). Um trainer de posto avançado começa quando o astronauta já chegou.
- Física: problema de Lambert, equação do foguete por estágio, inserção em órbita, enlace de rádio 1/d². Não é gestão de recursos com números inventados.
- Público: ensino médio e graduação, sem formação em engenharia espacial.
- Submetemos para "Space Mission Design Game". Não marcar o outro desafio por engano no formulário.

## Plano de corte para 48 h

Da seção 11 da spec e do README, detalhado por módulo:

| Decisão | O quê | Módulos de referência |
|---|---|---|
| Manter | Porkchop sobre dados pré-baixados do Horizons | `scripts/fetch-horizons.mjs`, `src/data/generated/ephemeris-*.json`, `src/physics/lambert.ts`, `porkchop.ts`, `porkchop.worker.ts` |
| Manter | Foguete modular com capacidade em função do C3 | `src/physics/launcher.ts`, `rocket.ts`, catálogos `engines.ts`, `tanks.ts`, `presets.ts`, `lsp.ts` |
| Manter | Nave com massa, potência e orçamento; checklist de lançamento | `src/game/spacecraft.ts`, `checklist.ts`, `src/data/spacecraftParts.ts` |
| Manter | Cruzeiro simples com uma ou duas erupções DONKI e TCMs | `src/game/cruise.ts`, `events.ts`, `src/data/generated/donki-flares.json` |
| Manter | Captura e relatório com pontuação e lições | `cruise.ts` (`arrive`), `scoring.ts`, `lessons.ts` |
| Simplificar | Construtor de foguete e lançamento em 2D (pilha SVG em escala, como o `StackElevation.tsx`) | — |
| Simplificar | Uma única cena 3D do sistema solar com poucos movimentos de câmera, ou 2D se faltar tempo | `src/scenes/SolarSystem.tsx` como referência |
| Simplificar | Operações: pode virar um resumo calculado em vez de 6 turnos com escolha | `src/game/ops.ts` |
| Cortar | Cartões de missões bloqueadas (Europa, asteroide) | — |
| Cortar | Subsistemas extras (mantas, RTG, laser, segundo gravador) | — |
| Cortar | Comparação com MRO e MAVEN no relatório | `src/data/realMissions.ts` |
| Cortar | Hangar 3D, lançamento 3D, chegada 3D | `Hangar.tsx`, `LaunchScene.tsx`, `MarsArrival.tsx` |

A ordem de construção segue a mesma regra do protótipo (decisão C7 em [DECISIONS.md](DECISIONS.md)): primeiro o loop de ponta a ponta com visual simples, depois o 3D, depois polimento. Se o tempo acabar, o loop completo vale mais que qualquer cena bonita.

## Cronograma hora a hora e papéis

### Papéis (equipe de 4 a 6)

| Papel | Responsabilidade | Com 4 pessoas |
|---|---|---|
| Física e dados | Efemérides, Lambert, porkchop, launcher, testes de validação | acumula com regras de jogo |
| Regras de jogo | Checklist, cruzeiro, eventos, pontuação, lições | acumula com física |
| Front-end | Telas, estado (store), fluxo de fases, deploy | sozinho |
| 3D e visual | Cena do sistema solar, identidade visual, capturas para o vídeo | acumula com vídeo |
| História e vídeo | Roteiro, gravação, edição, legendas, slides, texto da submissão | acumula com 3D |
| Testes e submissão | Testar com pessoas de fora, checklist de submissão, lista de recursos, divulgação de IA | com 5 ou 6 pessoas, papel próprio |

Uma pessoa é dona da submissão do começo ao fim. Ela não programa nas últimas 6 horas.

### Cronograma (H0 = abertura do evento local)

| Horas | Marco | O que acontece |
|---|---|---|
| H0–H2 | Partida | Ler o texto final do desafio e os guias de 13 nov; confirmar a regra de código pré-existente com o organizador local; criar repositório; publicar um "hello world" no Vercel para garantir o link público |
| H2–H8 | Base | Física e dados: efemérides, Lambert, porkchop com testes. Front-end: esqueleto das fases. Vídeo: roteiro e lista de planos |
| H8–H14 | Projeto | Porkchop clicável; foguete 2D com capacidade a C3; nave com massa, potência, custo; checklist de lançamento |
| H14–H20 | Voo | Cruzeiro com TCMs e uma ou duas erupções; captura; relatório com pontuação. Dormir em turnos a partir daqui |
| H20–H26 | Loop fechado | Jogo jogável de ponta a ponta no link público. Duas pessoas de fora jogam sem ajuda; anotar onde travam |
| H26–H34 | Polimento | Uma cena 3D; lições no relatório; correções do teste; tela de fontes de dados |
| H34–H36 | Congelamento | Nada novo entra. Só correção de bug |
| H36–H40 | Gravação | Capturar os planos do vídeo com as flags de URL; slides de reserva |
| H40–H44 | Edição | Editar o vídeo em até 30 s, legendas em inglês, texto da submissão, campo de dados da NASA, lista de recursos |
| H44–H46 | Submissão | Enviar. Abrir todos os links numa janela anônima, sem login |
| H46–H48 | Folga | Margem para imprevistos. Não usar para features |

## Reaproveitar ou reconstruir

As regras do Space Apps sobre código escrito antes do evento não estão confirmadas. O README diz que o solver, o worker do porkchop, os scripts de download e os arquivos de dados são módulos isolados, documentados e testados, para a equipe "reuse them if the event rules allow pre-existing code, or re-type them from this reference if not". Confirme com o organizador local na H0 e guarde a resposta por escrito.

| Peça | Se o código prévio for permitido | Se não for |
|---|---|---|
| `src/physics/` (Lambert, Kepler, porkchop, launcher, link) | Copiar com os testes | Redigitar usando o protótipo como referência; os testes dizem quando está certo |
| `scripts/fetch-*.mjs` e `src/data/generated/*.json` | Copiar; anotar a data de download | Rodar `npm run fetch:data` no evento. Horizons costuma responder; o DONKI estava fora do ar em 22 out 2026, então tenha `--from-wayback` como plano B |
| Catálogos (`engines.ts`, `tanks.ts`, `spacecraftParts.ts`, `presets.ts`) | Copiar | Redigitar os números com as fontes citadas em `src/data/sources.ts` |
| Regras de jogo (`src/game/`) | Copiar e cortar | Redigitar em versão simplificada |
| Telas, cenas 3D, identidade visual | Reconstruir menor de qualquer forma | Reconstruir |

Em qualquer caso, a submissão deve dizer o que existia antes do evento e o que foi feito nele.

## Vídeo de 30 segundos

Regra: até 30 s. Passou, fica inelegível. Tudo em inglês ou com legenda em inglês. O roteiro sugerido pelo guia de 2025 é: 0:00 nome e equipe; 0:02 desafio e por quê; 0:05 título e slogan; 0:10 como funciona e dados da NASA; 0:20–0:30 visão de futuro. O roteiro abaixo encaixa os cinco planos da spec nessa estrutura.

> Nota em pt-BR: o texto de tela e a narração ficam em inglês porque a submissão exige inglês. As colunas "Plano" e "Como capturar" são para a equipe.

| Tempo | Plano | On-screen text / narration (English) | Como capturar |
|---|---|---|---|
| 0:00–0:04 | Montagem do foguete no hangar 3D | "Mission Architect · Team [name] · Space Apps 2026: Space Mission Design Game" | `?phase=design&preset=reference&seed=1`, aba "Rocket"; trocar de preset (Atlas V 401 → Vulcan VC4) para a pilha mudar no hangar; girar a câmera arrastando |
| 0:04–0:09 | Decolagem com separação de estágios | "Build your rocket from real engine data. It flies the numbers." | `?phase=launch&preset=reference&seed=1`; a sequência dura cerca de 25 s, usar o trecho de liftoff até a separação do estágio 1 |
| 0:09–0:15 | Porkchop aparecendo e arco 3D ao vivo | "9,394 Lambert solves on NASA JPL Horizons data, matching NASA's 2026 mission handbook." | `?phase=design&preset=reference&seed=1` (abre na aba "Trajectory"); gravar a mensagem "Solving Lambert's problem…" e o gráfico surgindo; passar o mouse para o arco tracejado seguir |
| 0:15–0:21 | Decisão de erupção solar no cruzeiro | "Real NASA DONKI solar flares. Your design decides your options." | `?phase=cruise&preset=reference&seed=1`; time warp 5 d/s; na TCM-1 (dia 15) clicar "Burn now"; no dia 23 aparece a erupção X1.1; pausar antes de gravar o cartão |
| 0:21–0:27 | Captura em Marte e relatório | "938 m/s to brake into Mars orbit. Every outcome explained with physics." | `?phase=arrival&preset=reference&seed=1`, clicar "Fire the capture burn"; corte para `?phase=report&preset=reference&seed=1` (sucesso, 190 pontos, 3 estrelas) |
| 0:27–0:30 | Cartão final | "Real data. Real math. Your mission. Play: [public URL]" | Cartão estático com o link |

Dicas de gravação:

- Rode `npm run build` e `npm run preview` para gravar a versão de produção, numa janela de 1920 × 1080.
- `seed=1` repete sempre as mesmas erupções e o mesmo erro de injeção, então dá para regravar um plano sem mudar o resto.
- Pause o time warp antes de gravar uma data: os dígitos animados borram durante a aceleração.
- Não use imagens geradas por IA. Se usar, a regra de 2025 exige marca d'água visível.
- Sem logos da NASA nem insígnias de missão no vídeo.
- Se alguém da equipe tiver menos de 18 anos, não use rosto, voz ou imagem dele.

## Alternativa: apresentação de até 7 slides

Use se o vídeo não ficar bom a tempo. Sete slides contando o título.

> Nota em pt-BR: o texto dos slides fica em inglês pela mesma regra. Cada slide leva uma imagem de tela; as capturas atuais estão em `docs/screenshots/`.

1. Title: "Mission Architect: design a real Mars mission, from launch date to science return." Team name, challenge name.
2. The problem: "Mission design is a loop of competing demands: launch date, rocket, spacecraft mass, budget. Students never see it." Image: the loop diagram from the README.
3. Trajectory: "Every porkchop cell is a Lambert solve on NASA JPL Horizons data. Our 2026 minimum: C3 9.18 km²/s², 31 Oct 2026 → 20 Aug 2027. NASA's handbook: 9.144." Image: `porkchop.png`.
4. Rocket and spacecraft: "Real engine data. Capacity checked against NASA Launch Services Program curves (within 8%). Mass, power and budget must close." Image: rocket tab or `launch.png`.
5. Flight: "Course corrections and real NASA DONKI solar flares. Your design decides which responses you have." Image: `cruise.png`.
6. Report: "Every outcome explained with the student's own numbers." Image: `report.png`.
7. Data and next steps: list of NASA datasets; "Next: classroom pilots, Europa and asteroid missions." Public link.

## Checklist de submissão

- [ ] Projeto ligado ao desafio oficial "Space Mission Design Game" (não "Create Your Own Challenge", não o Junior Astronaut).
- [ ] Equipe de 1 a 6 pessoas, todas cadastradas.
- [ ] Vídeo de até 30 s (cronometrar o arquivo final) ou até 7 slides contando o título.
- [ ] Tudo em inglês, ou com legendas em inglês: vídeo, slides, texto, interface do jogo.
- [ ] Link do jogo público e sem login. Testar em janela anônima. No Vercel, desligar a proteção de deployment (preview com login bloqueia juízes).
- [ ] Link do repositório público.
- [ ] Campo de dados da NASA preenchido. Usar a lista de [DATA.md](DATA.md) e da tela "Data sources" (`src/data/sources.ts`): JPL Horizons, NASA DONKI, NASA LSP, NTRS (handbook e MAVEN), press kits de MRO e MAVEN, imagens da NASA.
- [ ] Lista de todos os recursos (dados, bibliotecas, texturas, fontes) com links. Fabricantes (ULA, SpaceX, Northrop Grumman, L3Harris, Nammo) entram como fontes de dados de motores.
- [ ] Nada com direitos autorais sem permissão.
- [ ] Nenhum logo da NASA nem insígnia de missão, no jogo, no vídeo ou nos slides. Nomes reais de missões só em comparações factuais.
- [ ] Divulgação do uso de IA (texto abaixo).
- [ ] Nenhuma imagem ou vídeo gerado por IA sem marca d'água visível. O protótipo não usa nenhum.
- [ ] Enviado com pelo menos 2 horas de folga antes do prazo.

### Texto de divulgação de IA

> Nota em pt-BR: o texto fica em inglês porque vai no formulário. Ajuste a primeira frase para o que a equipe realmente fizer com IA durante o evento, e troque "AI" por "Super Intelligence (SI)" se o guia de 2026 exigir esse termo.

```
AI use disclosure. We used AI coding assistants (Claude Code, by Anthropic) to help write and
review code and documentation, under the team's direction; every physics result is checked by
unit tests against published NASA references. A vision prototype built with the same tools before
the event served as a reference [state whether code was reused or re-typed]. No images, video or
audio in this project are AI-generated: planet, Sun and star textures are NASA imagery, credited
on the in-game Data sources screen. The project uses no NASA logos or mission insignia.
```

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Regra de código pré-existente proíbe reaproveitar o protótipo | Perguntar na H0; plano de redigitar os módulos com os testes como guia; declarar tudo na submissão |
| Vídeo passa de 30 s | Cronometrar o arquivo exportado, não a timeline do editor; mirar 28 s |
| Link pede login | Testar em janela anônima e em outro computador; desligar proteção de preview do Vercel |
| API do DONKI fora do ar (aconteceu em 22 out 2026) | Usar os arquivos já baixados ou `node scripts/fetch-donki.mjs --from-wayback`; o jogo não faz chamadas de rede durante a partida |
| 3D lento ou quebrado no computador do juiz | Manter os substitutos 2D; 3D só numa cena; carregar 3D sob demanda |
| Escopo cresce e o loop não fecha | Marco "loop fechado" na H26; congelamento na H34; cortar operações antes de cortar a captura |
| Dados da NASA parecem decoração | No vídeo, mostrar o número saindo do dado (porkchop, data real da erupção); no texto, ligar cada conjunto de dados a uma mecânica |
| Texto do desafio de 28 out pede algo diferente | Reler e ajustar o plano de corte antes do evento |
| Guias de 2026 mudam regras de demo ou de IA | Reler em 13 nov; atualizar a checklist acima |
| Equipe exausta na hora da submissão | Dono da submissão não programa nas últimas 6 horas; dormir em turnos |
| Erros em inglês no texto | Uma pessoa revisa todo o texto público antes de enviar |
