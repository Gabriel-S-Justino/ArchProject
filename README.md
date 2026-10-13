# Mission Architect

Jogo no estilo Kerbal Space Program para o NASA Space Apps Challenge 2026: monte um foguete, espere a janela de lançamento, viaje até Marte vendo as órbitas e entenda a física de cada passo.

Feito só com HTML, CSS e JavaScript puro, sem dependências.

## Como jogar
```bash
python3 -m http.server 8000
```
Abra `http://localhost:8000`. (Abrir o `index.html` direto do disco não funciona porque o navegador bloqueia módulos JS em `file://`.)

## Testes
```bash
npm test   # roda node --test, sem instalar nada
```

Documentação do projeto: `Contexto.md` → `Arquitetura.md` → `Desenvolvimento_guiado.md`. Estado atual em `PROJECT-STATE.md`.
