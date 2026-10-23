# Documentação do Mission Architect

Protótipo de visão para o desafio **"Space Mission Design Game"** do NASA Space Apps Challenge 2026. Esta pasta reúne a documentação do time, em português. O [README principal](../README.md) fica em inglês porque o Space Apps exige materiais de submissão em inglês.

## Por onde começar

| Se você quer… | Leia |
|---|---|
| Rodar o jogo e mexer no código | [DEVELOPMENT.md](DEVELOPMENT.md) |
| Entender como o código está organizado | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Saber como jogar (e como ensinar com o jogo) | [GAMEPLAY.md](GAMEPLAY.md) |
| Conferir cada fórmula e como ela foi validada | [PHYSICS.md](PHYSICS.md) |
| Saber de onde vem cada dado da NASA | [DATA.md](DATA.md) |
| Preparar o hackathon, o vídeo de 30 s e a submissão | [HACKATHON.md](HACKATHON.md) |
| Entender por que cada decisão foi tomada | [DECISIONS.md](DECISIONS.md) |

## Outros documentos (em inglês)

- [Spec de design](superpowers/specs/2026-10-22-mission-architect-vision-design.md): intenção, jornada do jogador, dados e matemática, como planejado em 22/10/2026.
- [Plano de implementação](superpowers/plans/2026-10-22-mission-architect-vision.md): as 17 tarefas em que o protótipo foi construído.
- [DESIGN.md](../DESIGN.md): identidade visual, tokens e regras de interface.
- [PRODUCT.md](../PRODUCT.md): público e propósito do produto.
- [public/textures/SOURCES.md](../public/textures/SOURCES.md): origem e licença das texturas da NASA.

## O que mudou entre a spec e o que foi construído

A spec é o documento de intenção; o código evoluiu durante a construção. As diferenças que importam para quem lê a spec:

- **Capacidade do foguete.** A spec dizia que a capacidade viria da curva C3 do veículo. No jogo, ela é calculada pela equação do foguete, estágio por estágio, com um Δv de subida que inclui perdas gravitacionais (depende do TWR na decolagem). As curvas do NASA LSP servem para **validar** os foguetes de referência (pior erro medido: −7,9 % Falcon Heavy, +6,6 % Atlas V 401). Ver [PHYSICS.md](PHYSICS.md) e as decisões R17–R20 em [DECISIONS.md](DECISIONS.md).
- **Correções de trajetória (TCM).** A spec falava em escolher "quando e quanto" corrigir. No jogo, há três janelas fixas (TCM-1, TCM-2, TCM-3) e em cada uma o jogador escolhe "queimar agora" (correção completa, custo calculado por Lambert) ou "esperar".
- **Eventos do cruzeiro.** Só erupções solares (flares) reais do DONKI são usadas; ejeções de massa coronal (CME) não entraram.
- **Operações.** Por turno, o jogador escolhe quais instrumentos ligar; a prioridade de downlink não é uma escolha separada.
- **Mira das correções.** As TCMs miram o centro de Marte (não um ponto no plano B); a captura assume periapse de 300 km. Isso aparece no jogo como "aim error" e na lista "How the game simplifies".
- **Escudo de micrometeoroides.** Hoje só adiciona massa e custo; não tem efeito em eventos.
- **Esfera de influência.** O cartão de física "Sphere of influence" descreve uma troca de corpo central a 2× a SOI que o código não faz: a captura usa a regra de distância ≤ 10.000 km no dia de chegada. Correção pendente no texto do cartão.
- **Validação do porkchop.** Adicionada depois da revisão final: C3 mínimo de 9,18 km²/s² (31/10/2026 → 20/08/2027) contra 9,144 do *Interplanetary Mission Design Handbook* da NASA (NASA/TM-2010-216764, Tabela 2).
