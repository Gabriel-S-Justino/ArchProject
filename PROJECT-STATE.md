# PROJECT-STATE

## Fase atual
P1 concluído. Próximo: P2.

## Concluído
- P0: tipos (`types/game.ts`), cartas em `data/`, engine em `game/` (design, validação, testes d20, turnos, chegada, score, lições, simulação determinística), 47 testes em `tests/`.
- P1: fluxo jogável em `app/page.tsx` (briefing → projeto → cruzeiro → chegada → operações → relatório) com `hooks/useGame.ts`.

## Próximo passo
P2: painel "E se?" lado a lado no relatório; missões Olho na Terra e Sentinela Lunar; Horizons + fallback; cartas "Sabia que?".
Hoje o relatório já tem "Ajustar a nave e repetir os mesmos eventos" (mesma seed), que é a base do "E se?".

## Decisões
- A seed é sorteada no clique de "Lançar missão" (seed 0 = ainda não sorteada), para o prerender do Next ficar estático e o reducer puro.
- Instrumentos só consomem energia na fase de operações; `cruiseOnlyPower` só no cruzeiro.
- O evento de cada turno depende só de seed, fase e turno, nunca do projeto da nave.

## Balanceamento (200 seeds, sem ações)
- Nave de referência: 164 sucessos, 21 parciais, 15 falhas (falhas vêm de duas inserções orbitais erradas).
- Antena de baixo ganho: 185 parciais.
- Painel pequeno: ciência média cai de ~115 para ~71.

## Pendências
- `Contexto.md`: título oficial, critérios de avaliação e link do desafio.
- Habilidade do Controlador de Voo no lançamento existe no engine, mas a tela ainda não oferece.

## Fora do MVP
Banco, login, multiplayer, IA.
