# CONTEXTO — MISSION ARCHITECT (RPG DE CARTAS)

## 1. FLUXO
`Contexto.md → Arquitetura.md → Desenvolvimento_guiado.md`
Leia os três antes de implementar. Este arquivo diz **o quê** e **por quê**; o próximo diz **como**.

## 2. DESAFIO NASA
**Nome:** [pendente — copiar o título oficial do desafio no site do Space Apps 2026]
**Challenge Statement (texto oficial):**
> Designing a space mission requires careful consideration of competing demands, including mission objectives, spacecraft design, scientific instruments, launch vehicles, budgets, power, mass, communications, and orbital constraints. For students who rarely get to experiment with an entire mission from concept to operation, these trade-offs often remain abstract. Your challenge is to create an interactive game that allows participants to design, manage, and simulate a complete space mission while making engineering decisions, managing limited resources, and evaluating how each choice shapes the success of their mission.

**Objetivo oficial:** jogo interativo em que o participante projeta, gerencia e simula uma missão espacial completa, tomando decisões de engenharia, gerenciando recursos limitados e avaliando como cada escolha afeta o sucesso.
**Problema:** estudantes raramente experimentam uma missão inteira, do conceito à operação; os trade-offs ficam abstratos.
**Público-alvo:** estudantes (ensino médio e graduação) sem formação em engenharia espacial.
**Requisitos obrigatórios (derivados do statement):**
- Projetar a missão: objetivo, nave, instrumentos, lançador.
- Gerenciar recursos limitados: orçamento, energia, massa, comunicação, restrições orbitais.
- Simular a missão do conceito à operação.
- Mostrar como cada escolha afeta o resultado.
**Restrições:** prazo do hackathon (~48 h); precisa rodar no navegador sem instalação.
**Critérios de avaliação:** [pendente — copiar do site oficial]
**Prazo/evento:** NASA Space Apps Challenge 2026.
**Fonte oficial:** [pendente — link da página do desafio]

## 3. DADOS NASA
**Datasets / APIs:**
- JPL Horizons API — distância Sol↔destino e Terra↔destino em uma data (alimenta energia solar, downlink e atraso de sinal). P2.
- JPL Small-Body Database API — dados de asteroide para a missão de asteroide. P2/P3.
- Páginas de missões reais da NASA (Juno, Curiosity, JWST, MRO, Lunar Reconnaissance Orbiter) — textos curtos "Sabia que?". P2.
**Dados obrigatórios:** nenhum para o MVP; o MVP roda com JSON local.
**Dados opcionais:** os acima.
**Licenças/regras:** dados e textos da NASA são, em geral, de domínio público; citar a fonte em cada carta "Sabia que?". Conferir as regras do Space Apps sobre uso de recursos de parceiros.
**Referências:** [pendente — listar os recursos indicados na página do desafio]

## 4. CIÊNCIA
**Conceitos:** orçamento de massa, orçamento de energia, delta-v, link de comunicação, confiabilidade/redundância, ambiente espacial (radiação, micrometeoroides).
**Fórmulas/modelos (simplificados):**
- Energia solar: `P = P_1UA / d²` (d em UA).
- Downlink: `banda = banda_base / d²` (regra de jogo, não equação de link real).
- Delta-v: `Δv = Isp · g0 · ln(m0 / mf)`, g0 = 9,80665 m/s².
- Atraso de sinal: `t = d / c`.
**Simplificações:** sem mecânica orbital real (transferências são um custo fixo de delta-v por destino); turnos discretos; eventos probabilísticos com seed.
**Limitações:** valores de cartas (custo, massa, potência) são **balanceamento de jogo**, inspirados em ordens de grandeza reais, não dados de engenharia.

Não apresentar o sistema como ferramenta operacional/certificada.

## 5. PRODUTO
**Nome:** Mission Architect
**Formato:** RPG de cartas single-player no navegador.
**Objetivo:** montar uma missão com cartas, observar trade-offs ao vivo, simular o voo fase a fase e receber um relatório que explica as consequências.
**Fluxo:** `briefing → projeto (montar nave) → validar → lançamento → cruzeiro → chegada → operações → relatório`
**Missões/destinos:**
- MVP: **Vigia Vermelho** (orbitador de Marte, 1,52 UA).
- P2: Olho na Terra (LEO, 1 UA), Sentinela Lunar (Lua, 1 UA).
- P3: Caçador de Asteroides, Gigante Gasoso (Júpiter, 5,2 UA).
**Tipos de carta:** Missão, Lançador, Componente (energia, comunicação, propulsão, proteção, aviônica, instrumento), Equipe (personagens RPG), Evento, Ação.
**Decisões do usuário:** escolher equipe (3 de 6), escolher lançador, adicionar/remover componentes, jogar ações durante o voo, ligar/desligar instrumentos, usar habilidades da equipe.
**Métricas:** orçamento, massa, balanço de energia, downlink, delta-v, confiabilidade, ciência entregue, score.
**Resultado:** sucesso total / parcial / falha + estrelas + explicação causal + modo "E se?" (trocar uma carta e re-simular com a mesma seed).

## 6. NASA/JPL
**Fonte principal:** JPL Horizons (P2).
**Dados utilizados:** distância heliocêntrica e geocêntrica do destino.
**Fallback:** sim — `data/distances.json` com distâncias médias.
API externa não pode impedir a demonstração.

## 7. YAGNI
Não adicionar sem requisito: banco, autenticação, microserviços, Redis, filas, Kubernetes, IA obrigatória, infraestrutura complexa, analytics, painel administrativo, multiplayer.
Progresso de campanha (P3), se existir, usa `localStorage`.

## 8. HACKATHON
**MVP:** uma missão (Vigia Vermelho) jogável do briefing ao relatório, com montagem por cartas, validação ao vivo, eventos, testes d20 com seed e relatório explicativo.
**P0:** tipos, cartas em JSON, engine puro (validação, recursos, eventos, simulação, score), testes.
**P1:** telas de briefing, projeto, voo e relatório ligadas ao engine.
**P2:** modo "E se?", mais 2 missões, Horizons + fallback, cartas "Sabia que?".
**P3:** arte, animações, campanha com reputação, acessibilidade, som.

Prioridade: `funcionar > estabilidade > clareza > UX > dados > polimento > extras`

## 9. REGRAS
- Diferencie fatos, decisões e hipóteses.
- Não invente requisitos ou valores científicos; números de cartas são de jogo e devem estar marcados assim.
- Use documentos NASA como fonte de verdade.
- Preserve a estrutura.
- Se requisito oficial conflitar com ideia prévia, requisito oficial vence.
- Campos `[pendente]` não bloqueiam o MVP; não invente o conteúdo deles.

**Próximo: `Arquitetura.md`.**
