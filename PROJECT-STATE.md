# PROJECT-STATE

## Fase atual
Mudança de direção (13/10/2026): o jogo passa a ser no estilo Kerbal Space Program, feito só com HTML, CSS e JS puro, com YAGNI obrigatório, órbitas visíveis e física didática. Os três prompts foram reescritos. Próximo: P0 da nova arquitetura.

## Concluído
- Prompts novos: `Contexto.md`, `Arquitetura.md`, `Desenvolvimento_guiado.md`.
- Versão anterior (Next.js/TypeScript, RPG de cartas) está no main até o P0 novo removê-la. Referência: commit `bdf802e`.

## Próximo passo
P0 do `Desenvolvimento_guiado.md`: remover a versão Next.js, criar dados e física em JS puro com testes `node --test`.

## Decisões
- Data inicial do jogo: 13/10/2026; a janela Terra→Marte do modelo cai em ~15/11/2026.
- Subida até LEO custa 9.400 m/s fixos; partida 3.613 m/s; captura elíptica 907 m/s.
- Zona de encontro = 2 × SOI de Marte (jogabilidade).

## Pendências
- `Contexto.md`: título oficial, critérios de avaliação e link do desafio.

## Fora do MVP
Backend, banco, login, multiplayer, IA, 3D, n-corpos, pouso pilotado.
