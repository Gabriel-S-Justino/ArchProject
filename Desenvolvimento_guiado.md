# DESENVOLVIMENTO GUIADO — MISSION ARCHITECT (RPG DE CARTAS)

## 1. ENTRADA
Antes de implementar, leia: `Contexto.md → Arquitetura.md`.
`Arquitetura.md` é a especificação das regras e dos números das cartas. Não invente regras fora dela.

## 2. REGRA PRINCIPAL
Autonomia de implementação ≠ autonomia de escopo.

Pode criar/refatorar código, corrigir bugs, criar testes, instalar dependências justificadas e executar comandos.

Não pode, sem justificativa: aumentar escopo, trocar stack, criar banco/auth/microserviços ou infraestrutura desnecessária.

## 3. PRIMEIRO PASSO
Inspecione o repositório. Se não houver app, crie:
```bash
npx create-next-app@latest . --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*"
npm i -D vitest
```
Adicione o script `"test": "vitest run"` no `package.json`. Ative `strict` no `tsconfig.json`.
Se já houver código, preserve o que funciona.

## 4. ORDEM
Cada etapa termina com `npm run test` e `npm run build` passando.

### P0 — engine (sem UI)
1. `types/game.ts` exatamente como a seção 5 da arquitetura.
2. `data/*.json` com todas as cartas da seção 7, cada uma com `flavor` em português e `"gameBalance": true`.
3. `game/rng.ts`: `mulberry32` e `deriveSeed(seed, ...parts)`.
4. `game/design.ts`: `calculateDesign(mission, design, cards)` → custo, massa seca/total, Δv, geração, consumo, downlink, bônus por teste.
5. `game/validation.ts`: `validateDesign` com códigos e mensagens em português.
6. `game/tests.ts`: `rollTest(rng, bonus, difficulty)` com 1 e 20 naturais.
7. `game/events.ts`: montar deck por fase com seed e resolver cada evento.
8. `game/turn.ts`: `startMission`, `resolveLaunch`, `playTurn`, `resolveArrival`, `finishMission` (ordem do turno da seção 8).
9. `game/scoring.ts` e `game/lessons.ts`.
10. `game/simulation.ts`: `simulateMission(mission, design, seed, policy = autoPolicy)` encadeando os passos.
11. Testes da seção 16 e cenários de balanceamento da seção 17.

**Pronto quando:** a nave de referência é válida e vence em ≥ 60% de 200 seeds; a versão com antena de baixo ganho fica em partial na maioria; mesma seed ⇒ mesmo `MissionResult`.

### P1 — jogo jogável
1. `hooks/useGame.ts` com o reducer da seção 12, chamando só funções de `game/`.
2. `app/page.tsx` renderiza a tela pela `phase`.
3. Briefing: texto da missão + `CrewPicker` (exatamente 3).
4. Projeto: `CardHand` com todas as cartas disponíveis, `ShipBoard` com slots por categoria, `ResourceBars` (orçamento, massa, energia em operação, downlink, Δv vs. exigido) e `ValidationPanel`. Botão "Lançar" desabilitado com erros.
5. Voo: `FlightView` com turno/fase, evento comprado em `EventModal` (dado, bônus, dificuldade, resultado), mão de ações, botões de habilidade e "Próximo turno".
6. Relatório: resultado, estrelas, score, `Timeline` (tabela ou SVG simples por turno), lista de lições, "Jogar de novo".

**Pronto quando:** uma pessoa que nunca viu o jogo completa uma partida sem ajuda, do briefing ao relatório, em menos de 10 minutos.

### P2 — diferencial
1. `WhatIfPanel`: no relatório, trocar 1 carta, rodar `simulateMission` com a mesma seed e comparar lado a lado.
2. Missões Olho na Terra e Sentinela Lunar (só dados).
3. `services/horizons.ts` + `app/api/distance/route.ts` com timeout de 3 s e fallback para `data/distances.json`.
4. Cartas "Sabia que?" no briefing com fonte NASA citada.

### P3 — polimento
Arte das cartas, animação de virar carta, campanha com reputação em `localStorage`, acessibilidade (teclado, contraste, `aria-live` nos resultados de teste), som opcional.

Não iniciar P3 antes de P0/P1.

## 5. CICLO
`inspecionar → planejar → implementar → testar → executar → revisar → corrigir`

Validar cada incremento. Commits pequenos, um por passo numerado.

## 6. DOMÍNIO
Regras importantes têm uma única fonte de verdade em `game/`.
```ts
calculateDesign()
validateDesign()
simulateMission()
calculateScore()
```
A UI nunca recalcula massa, energia, Δv ou score por conta própria.

## 7. SIMULAÇÃO
`validar → calcular recursos → lançamento → turnos (evento → ação → energia → ciência → downlink → snapshot) → chegada → resultado → score → lições`

Resultado estruturado e reproduzível. Nunca usar `Math.random()`; toda aleatoriedade vem de `game/rng.ts`.

## 8. NASA/JPL
Implementar só após P1 funcional:
```text
UI → Route Handler → Adapter → JPL Horizons → dados normalizados → engine
```
Se falhar, usar fallback local. A demo nunca depende da rede.

## 9. DADOS OFICIAIS
Antes de usar regra baseada em documento NASA:
1. conferir `Contexto.md`;
2. identificar fonte;
3. classificar como requisito, dado ou hipótese;
4. registrar origem no `flavor` ou em comentário.

Não inventar dados. Informação ausente vira pendência em `PROJECT-STATE.md`.

## 10. TESTES
Vitest em `tests/`. Obrigatórios:
- `calculateDesign`: custo, massa, Δv (comparar com fórmula), energia a 1,52 UA, downlink.
- `validateDesign`: cada código de erro tem um teste.
- `rollTest`: 1 e 20 naturais; limite exato da dificuldade.
- Turno: déficit de energia desliga instrumentos na ordem certa; 2 modos seguros seguidos destroem a nave; buffer cheio descarta dados.
- Chegada: Δv insuficiente ⇒ failure.
- Score e estrelas.
- Determinismo e cenários de balanceamento.

## 11. SEGURANÇA
Verificar inputs, parâmetros, APIs, secrets, dados externos e HTML. Nunca versionar secrets.

## 12. DEPENDÊNCIAS
Base: next, react, tailwindcss, typescript, vitest. Qualquer outra precisa de justificativa no commit.

## 13. BANCO / AUTH
Não criar.

## 14. IA
P3, opcional. Engine não depende dela.

## 15. FEATURE GATE
Para qualquer feature: `problema? necessidade? benefício? custo? risco? alternativa menor?`
Sem justificativa proporcional: não implementar.

## 16. ESTADO
Criar e manter `PROJECT-STATE.md`: fase atual, concluído, em andamento, próximo passo, decisões, ajustes de balanceamento, bugs, fora do MVP.

## 17. DEFINITION OF DONE
Implementada, integrada, executada, testada, `npm run build` sem erro, compatível com a arquitetura e sem complexidade desnecessária. Textos da UI em português.

## 18. REVISÃO FINAL
Arquitetura, código, segurança, performance, UX, demo (roteiro de 3 minutos: montar nave errada → falhar → "E se?" → corrigir → vencer) e deploy na Vercel.

## 19. PRIORIDADE
`funcionar > estabilidade > clareza > UX > dados científicos > polimento > extras`

Quando o MVP estiver completo, não adicione complexidade sem retorno.
