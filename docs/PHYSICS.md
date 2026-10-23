# Física do Mission Architect

Este documento descreve cada modelo que o jogo usa: a fórmula, onde ela está no código (arquivo e função), as unidades e o teste que a valida. Ele existe para sustentar a frase "matemática de verdade sobre dados reais da NASA": se um número aparece na tela, dá para seguir daqui até o código e até o teste.

Todos os valores abaixo foram conferidos no código da branch `vision-prototype` (commit `0049ae1`). Os resultados marcados como "medido" foram obtidos rodando as funções do próprio repositório; os demais são constantes ou asserções dos testes.

Leitura relacionada: [README](../README.md) · [ARCHITECTURE](ARCHITECTURE.md) · [DATA](DATA.md) · [GAMEPLAY](GAMEPLAY.md) · [DEVELOPMENT](DEVELOPMENT.md) · [HACKATHON](HACKATHON.md) · [DECISIONS](DECISIONS.md) · [spec do protótipo](superpowers/specs/2026-10-22-mission-architect-vision-design.md)

## Sumário

1. [Convenções](#1-convenções)
2. [Constantes físicas](#2-constantes-físicas)
3. [Tempo e efemérides](#3-tempo-e-efemérides)
4. [Relações de dois corpos](#4-relações-de-dois-corpos)
5. [Propagação de Kepler com variáveis universais](#5-propagação-de-kepler-com-variáveis-universais)
6. [Problema de Lambert](#6-problema-de-lambert)
7. [Grade do porkchop](#7-grade-do-porkchop)
8. [Validação contra NASA/TM-2010-216764](#8-validação-contra-nasatm-2010-216764)
9. [Queima de escape e de captura](#9-queima-de-escape-e-de-captura)
10. [Equação do foguete](#10-equação-do-foguete)
11. [Lançador modular](#11-lançador-modular)
12. [Orçamentos da espaçonave](#12-orçamentos-da-espaçonave)
13. [Cruzeiro: erro de injeção, TCMs e chegada](#13-cruzeiro-erro-de-injeção-tcms-e-chegada)
14. [Eventos de erupção solar](#14-eventos-de-erupção-solar)
15. [Operações em órbita de Marte](#15-operações-em-órbita-de-marte)
16. [Pontuação](#16-pontuação)
17. [Como o jogo simplifica](#17-como-o-jogo-simplifica)
18. [Física real x balanceamento de jogo](#18-física-real-x-balanceamento-de-jogo)

## 1. Convenções

- Unidades SI dentro da física: metros, segundos, quilogramas, m/s. As exceções são explícitas: C3 em km²/s², v∞ de chegada em km/s, potência em W, taxa de dados em Mbit/s, volume de dados em Gbit, dinheiro em US$ M.
- Referencial heliocêntrico eclíptico J2000 (o mesmo dos vetores do JPL Horizons). O eixo +z é o polo da eclíptica; "prógrado" significa sentido anti-horário visto de +z.
- `src/physics/` e `src/game/` são TypeScript puro, sem React, three.js ou DOM. Os testes rodam em Node com Vitest (`npm test`).
- Funções nunca devolvem `NaN` silenciosamente: elas retornam `null`, `Infinity`, `0` ou um estado com seis `NaN`, conforme documentado em cada uma, e as telas tratam esses casos.

## 2. Constantes físicas

Arquivo: `src/physics/constants.ts` (comentário do arquivo: "CODATA / IAU / NASA Planetary Fact Sheet"). Teste: `src/physics/constants.test.ts` compara cada valor com `toBe` (igualdade exata).

| Símbolo no código | Valor | Unidade | Significado |
|---|---|---|---|
| `G0` | 9.80665 | m/s² | gravidade padrão (usada no Isp) |
| `AU` | 1.495978707e11 | m | unidade astronômica |
| `C` | 299792458 | m/s | velocidade da luz |
| `DAY` | 86400 | s | um dia |
| `MU_SUN` | 1.32712440018e20 | m³/s² | GM do Sol |
| `MU_EARTH` | 3.986004418e14 | m³/s² | GM da Terra |
| `MU_MARS` | 4.282837e13 | m³/s² | GM de Marte |
| `R_EARTH` | 6371e3 | m | raio médio da Terra |
| `R_MARS` | 3389.5e3 | m | raio médio de Marte |
| `SOI_MARS` | 577e6 | m | raio da esfera de influência de Marte |

Outras constantes reais espalhadas pelo código:

| Constante | Valor | Onde |
|---|---|---|
| `J2000_JD` | 2451545.0 (2000-01-01T12:00:00Z) | `src/physics/time.ts` |
| `MARS_MEAN_DISTANCE_AU` | 1,5237 UA (semieixo maior de 227,956 milhões de km, NASA Mars Fact Sheet) | `src/game/spacecraft.ts` |
| `PARKING_RADIUS_M` | `R_EARTH` + 200 km | `src/physics/launcher.ts` |

## 3. Tempo e efemérides

### Data juliana

`src/physics/time.ts`: `jdFromDate(d) = d.getTime() / 86 400 000 + 2440587.5` e o inverso `dateFromJd`. O jogo trata TDB como UTC; a diferença de cerca de 69 s é ignorada (comentário do arquivo). `formatJd` escreve "16 Nov 2026" em UTC.

Teste `src/physics/time.test.ts`: J2000 vira JD 2451545, a época Unix vira 2440587.5, ida e volta Date → JD → Date em até 1 ms, formatação e `NaN` para texto inválido.

### Estados de Terra e Marte

`src/physics/ephemeris.ts`, função `bodyState(body, jd)`. Lê os vetores diários do JPL Horizons em `src/data/generated/ephemeris-{earth,mars}.json` (detalhes do dado em [DATA.md](DATA.md)) e interpola entre duas amostras com um polinômio cúbico de Hermite, usando as posições e as velocidades das duas amostras vizinhas:

```
t = (jd − startJd) / stepDays − i        (0 ≤ t ≤ 1, h = 1 dia em segundos)
r(t) = h00·r_i + h10·h·v_i + h01·r_(i+1) + h11·h·v_(i+1)
h00 = 2t³ − 3t² + 1   h10 = t³ − 2t² + t   h01 = 3t² − 2t³   h11 = t³ − t²
v(t) = dr/dt (derivada analítica das mesmas bases)
```

Entrada em km e km/s, saída em m e m/s. Fora de `EPHEMERIS_RANGE` (JD 2461222.5 a 2462318.5, ou seja 2026-07-01 a 2029-07-01) a função lança `RangeError`.

Teste `src/physics/ephemeris.test.ts`:

- os arquivos têm proveniência (Horizons, URL da API, data), centro `500@10`, referencial `ecliptic J2000`, passo de 1 dia e mais de 1.000 linhas;
- a cobertura comum vai de 2026-07-01 a 2029-07-01;
- a Terra fica entre 0,983 e 0,984 UA do Sol em 2027-01-03 (época do periélio);
- Marte fica entre 1,381 e 1,6662 UA em todo o intervalo, amostrado a cada 6 h (o afélio do mar099 chega a 1,666101 UA perto de 2027-03-05);
- numa data de amostra a função devolve a linha armazenada com erro abaixo de 1 m e 1 mm/s;
- no meio do dia, a interpolação concorda com a média de duas propagações de dois corpos (uma a partir de cada vizinho) dentro de 1 km para Marte e 50 km para a Terra. A Terra tem tolerância maior porque o corpo 399 do Horizons é o geocentro, que a Lua desloca cerca de 30 km em meio dia em relação a um arco só com o Sol (lacuna medida: 31 a 36 km). Comparado com vetores reais do Horizons a cada 12 h, o interpolador ficou a 94 m (Terra) e 9 m (Marte) dos pontos médios verdadeiros;
- a velocidade devolvida bate com a derivada numérica da posição (< 1 mm/s);
- as duas pontas do intervalo funcionam e qualquer data fora dele lança `RangeError`.

## 4. Relações de dois corpos

Arquivo: `src/physics/orbit.ts`. Teste: `src/physics/orbit.test.ts`.

| Função | Fórmula |
|---|---|
| `circularSpeed(mu, r)` | `v = √(μ/r)` |
| `visViva(mu, r, a)` | `v = √(μ·(2/r − 1/a))` |
| `period(mu, a)` | `T = 2π·√(a³/μ)` |
| `hohmann(mu, r1, r2)` | `a = (r1 + r2)/2`, `Δv1 = visViva(r1, a) − v_circ(r1)`, `Δv2 = v_circ(r2) − visViva(r2, a)`, `t = T(a)/2` |
| `escapeBurn(mu, rPark, vInf)` | ver [seção 9](#9-queima-de-escape-e-de-captura) |
| `captureBurn(mu, rp, ra, vInf)` | ver [seção 9](#9-queima-de-escape-e-de-captura) |
| `orbitalElements(s, mu)` | `a = 1/(2/r − v²/μ)`, vetor excentricidade `e = ((v² − μ/r)·r − (r·v)·v)/μ`, `i = acos(h_z/‖h‖)`, `p = h²/μ`, `rp = p/(1 + e)`, `ra = p/(1 − e)` (infinito se e ≥ 1) |

`hohmann` e `orbitalElements` alimentam os cartões explicativos do painel de física (`src/data/concepts.ts`); a trajetória do jogo usa Lambert, não Hohmann.

O teste reproduz os valores do protótipo legado: órbita circular a 200 km ≈ 7.788 m/s, período da Terra ≈ 365,25 dias, Hohmann Terra → Marte ≈ 258,9 dias, queima de partida desde LEO ≈ 3.613 m/s, captura elíptica em Marte ≈ 907 m/s. Também recupera elementos de uma órbita circular, de uma elipse inclinada a 30°, de uma hipérbole (a < 0, e = 1,5, ra = ∞) e de uma órbita retrógrada (i ≈ 180°).

## 5. Propagação de Kepler com variáveis universais

Arquivo: `src/physics/kepler.ts`, função `propagate(s0, mu, dt)`. Método: Curtis, *Orbital Mechanics for Engineering Students*, algoritmos 3.3 e 3.4. Uma única formulação cobre elipse, parábola e hipérbole.

```
α  = 2/r0 − v0²/μ                        (= 1/a)
z  = α·χ²
C(z), S(z) = funções de Stumpff (série de Taylor quando |z| < 1e-3)
F(χ) = (r0·vr0/√μ)·χ²·C(z) + (1 − α·r0)·χ³·S(z) + r0·χ − √μ·Δt = 0
f = 1 − (χ²/r0)·C       g = Δt − (χ³/√μ)·S
r = f·r0 + g·v0
ḟ = (√μ/(r·r0))·(z·χ·S − χ)   ġ = 1 − (χ²/r)·C
v = ḟ·r0 + ġ·v0
```

Detalhes de implementação que importam para a robustez:

- Órbitas fechadas são reduzidas módulo um período antes de resolver (`dt % T`).
- O chute inicial de χ segue Vallado (algoritmo 8), com recuo para `√μ·Δt/r0`.
- `solveChi` usa Newton protegido por bisseção (estilo `rtsafe` do Numerical Recipes). F é estritamente crescente (dF/dχ = r > 0), a raiz tem o sinal de Δt e |χ| ≤ √μ·|Δt|/rp, então sempre existe um intervalo que contém a raiz. Tolerância 1e-10 relativa, no máximo 50 iterações.
- Se não convergir, ou se `√μ·dt` não for finito, devolve um estado com os seis componentes `NaN`, nunca um estado errado.
- `sampleTrajectory(s0, mu, duração, n)` gera n pontos igualmente espaçados no tempo, cada um propagado direto de s0 (sem acumular erro). É usada para desenhar os arcos.

Teste `src/physics/kepler.test.ts`:

| Caso | O que o teste exige |
|---|---|
| Δt = 0 | devolve o mesmo estado |
| órbita circular de 1 UA, 1 período | volta ao início com erro < 1 km e < 1 mm/s |
| 1/4 de período | gira 90° (erro < 1 km) |
| Δt = −3,25 T | aceita tempo negativo e vários períodos |
| elipse de Hohmann, meio período | chega ao afélio (erro < 1 km) |
| hipérbole e = 1,5, ida e volta (600 s a 30 dias) | e preservado a 1e-9, volta a < 1 m e < 1 mm/s |
| e = 1,0001, 1,01 e 10, Δt até 3.650 dias | converge, e preservado a 1e-6, ida e volta com erro relativo < 1e-9 |
| elipse e = 0,9 e parábola | ida e volta a < 1 m |
| 200 dias em passos de 10 dias | energia e momento angular conservados a 1e-9 relativo |
| hipérbole e = 1,8 | r(t) e posição perifocal batem com a solução analítica `t = √((−a)³/μ)·(e·sinh H − H)` a 1e-6 |
| `dt` = ±`Number.MAX_VALUE`, ∞, `NaN` | estado todo `NaN` |
| Stumpff | contínuas na troca série/fórmula fechada (< 1e-12 relativo) e corretas em z = 0, ±1 |

## 6. Problema de Lambert

Arquivo: `src/physics/lambert.ts`, função `lambert(r1, r2, tof, mu)`. Método: Curtis, algoritmo 5.2, variáveis universais. Uma revolução, sempre prógrado em relação a +z. A função não depende de unidades, desde que r, tof e μ sejam coerentes.

```
Δθ = ângulo entre r1 e r2; se (r1 × r2)_z < 0 o arco prógrado vai pelo caminho longo: Δθ = 2π − ângulo
A  = ±√(2·r1·r2)·cos(ângulo/2)              (negativo no caminho longo)
y(z) = r1 + r2 + A·(z·S(z) − 1)/√C(z)
F(z) = (y/C)^1,5·S + A·√y − √μ·Δt = 0
f = 1 − y/r1     g = A·√(y/μ)     ġ = 1 − y/r2
v1 = (r2 − f·r1)/g      v2 = (ġ·r2 − r1)/g
```

A forma `A = ±√(2·r1·r2)·cos(ângulo/2)` é algebricamente igual a `sin Δθ·√(r1·r2/(1 − cos Δθ))`, mas continua precisa perto de 0° e de 180°.

A raiz é procurada por Newton em z, protegido por bisseção. O intervalo começa em [−4π², 4π²] (4π² é uma volta completa) e o limite inferior desce até −1e5 enquanto F não ficar negativo. Onde y ≤ 0 a geometria é impossível e a função reporta F = −∞. As derivadas de Stumpff usam série de Taylor quando |z| < 0,1. Tolerância 1e-12 relativa, no máximo 100 iterações.

A função devolve `null` (e nunca velocidades não finitas) quando:

- `tof` não é positivo e finito, ou μ ≤ 0;
- r1 e r2 estão a menos de 1e-6 rad de 0° ou de 180° (o plano da transferência fica indefinido);
- a iteração não converge.

Teste `src/physics/lambert.test.ts`:

- reproduz o exemplo 5.2 do Curtis (km, km/s, μ = 398600): v1 = (−5,9925; 1,9254; 3,2456) e v2 = (−3,3125; −4,1966; −0,38529) km/s, com erro ≤ 1e-3 por componente;
- `null` para tof ≤ 0, `NaN` e ∞; para vetores paralelos (incluindo desvio de 1e-7 rad); para exatamente 180°;
- ida e volta com `propagate` em cinco casos (caminho curto tipo Terra-Marte, caminho longo, arco hiperbólico rápido de 20 dias, quarto de órbita em torno da Terra, arco um pouco abaixo de 180°): posição e velocidade finais com erro relativo < 1e-9, e momento angular com z > 0;
- quando (r1 × r2) aponta para −z, a solução vai pelo caminho longo, ainda prógrada.

O caso perto de 180° volta a aparecer nas correções de rota: ver [seção 13](#13-cruzeiro-erro-de-injeção-tcms-e-chegada).

## 7. Grade do porkchop

Arquivo: `src/physics/porkchop.ts`. Funções: `transferFor(depJd, arrJd, limits)` (uma transferência) e `computePorkchop(spec)` (a grade). As duas usam a mesma rotina interna `solveTransfer`, então uma célula da grade e a transferência daquela data são idênticas bit a bit. Na interface a grade roda num Web Worker (`porkchop.worker.ts`, `porkchopClient.ts`).

Cada célula é um Lambert heliocêntrico (μ = `MU_SUN`) entre a posição da Terra na partida e a de Marte na chegada, ambas do JPL Horizons:

```
v∞,partida = v1 − v_Terra(partida)          (m/s, vetor)
v∞,chegada = v2 − v_Marte(chegada)          (m/s, vetor)
C3 = (|v∞,partida| / 1000)²                 (km²/s²)
v∞ de chegada = |v∞,chegada| / 1000         (km/s)
```

Especificação padrão `DEFAULT_PORKCHOP` (janela de fim de 2026):

| Campo | Valor |
|---|---|
| partidas | 2026-09-01 a 2027-01-31, a cada 2 dias (77 colunas) |
| chegadas | 2027-04-01 a 2028-03-31, a cada 3 dias (122 linhas; a última é 2028-03-29) |
| tempo de voo aceito | 100 a 500 dias, inclusive |

Os dois arrays (`c3`, `vInf`) são `Float32Array` em ordem `[iArr * nDep + iDep]`. Uma célula vale `NaN` nos dois arrays quando o tempo de voo está fora de [100, 500] dias, quando Lambert não tem solução (inclusive transferências a menos de 1e-6 rad de 180°) ou quando o valor estouraria para infinito em Float32. Nunca há `Infinity`. `best` é a célula de menor C3; se nenhuma célula for válida, `computePorkchop` lança `RangeError`, assim como para uma spec malformada ou fora da efeméride.

Medido: das 9.394 células da grade padrão, 641 são `NaN`. O mínimo global é C3 = 9,1835 km²/s², partida 31 Out 2026, chegada 20 Ago 2027.

Teste `src/physics/porkchop.test.ts`:

- a spec padrão tem exatamente os valores acima; a grade tem 77 × 122 células;
- `transferFor(15 Nov 2026, 1 Set 2027)` tem 290 dias e, propagando (r1, v1) pelo tempo de voo, chega a menos de 10 km de r2;
- r1 e r2 são exatamente as posições da efeméride; v∞, C3 e v∞ de chegada seguem as definições acima a 1e-9;
- `null` para tempo de voo fora de 100–500 dias, chegada antes da partida e datas fora da efeméride; limites personalizados funcionam;
- a grade padrão roda em menos de 3 s em Node;
- a célula (37, 55) é igual a `Math.fround` da transferência correspondente;
- `best` é o mínimo das células válidas e é finito;
- toda célula fora de [100, 500] dias é `NaN`, `NaN` aparece nos dois arrays ao mesmo tempo, nenhuma é ±∞, e células `NaN` correspondem exatamente a `transferFor` = `null`;
- specs sem célula válida, fora da efeméride ou com passo ≤ 0 lançam `RangeError`.

## 8. Validação contra NASA/TM-2010-216764

A referência é L. M. Burke, R. D. Falck e M. L. McGuire, *Interplanetary Mission Design Handbook: Earth-to-Mars Mission Opportunities 2026 to 2045*, NASA/TM-2010-216764, NASA Glenn Research Center, outubro de 2010 ([NTRS 20100037210](https://ntrs.nasa.gov/citations/20100037210)). Valores da tabela 2, "Earth to Mars, 2026 Opportunity, Energy Minima" (p. 12), e da tabela 1 (p. 10: ótimo de 2026, C3 9,144, Tipo II).

Condições do manual (anotadas no teste): transferência balística, sem manobra no espaço profundo; chegada tratada como sobrevoo (sem peso no v∞ de chegada); otimizador MIDAS de cônicas concatenadas; busca em passos de 2 dias; valores impressos com duas casas. Tipo I é transferência com ângulo menor que 180°, Tipo II entre 180° e 360°.

Nosso lado: a grade padrão (passos de 2 dias × 3 dias) sobre os vetores DE441/mar099 do Horizons. No teste, uma célula é Tipo II quando (r1 × r2)_z < 0.

| Mínimo de | NASA/TM-2010-216764 | Mission Architect | Diferença |
|---|---|---|---|
| C3, Tipo II (ótimo de 2026) | 9,144 km²/s²; 2026-10-31 → 2027-08-19 (292 d); v∞ 2,729 km/s | 9,1835 km²/s²; 2026-10-31 → 2027-08-20 (293 d); v∞ 2,7124 km/s | C3 +0,04; v∞ −0,017; chegada +1 d |
| C3, Tipo I | 11,11 km²/s²; 2026-11-14 → 2027-08-09 (268 d); v∞ 2,915 km/s | 10,906 km²/s²; 2026-11-14 → 2027-08-11 (270 d); v∞ 2,911 km/s | C3 −0,20; v∞ −0,004; chegada +2 d |
| v∞ de chegada, Tipo II | 2,565 km/s (C3 9,646); 2026-11-06 → 2027-09-08 (306 d) | 2,5646 km/s (C3 9,581); 2026-11-06 → 2027-09-07 (305 d) | v∞ −0,0004; chegada −1 d |

Os valores de C3, datas e v∞ da coluna "Mission Architect" foram medidos com `transferFor` sobre a grade padrão; a coluna de referência é o objeto `REF` do teste. O C3 e as datas das duas primeiras linhas também estão no comentário do teste e em `src/data/sources.ts`.

Tolerâncias do teste (`C3_TOL`, `VINF_TOL`, `DATE_TOL_DAYS`), aplicadas às três linhas, tanto ao C3 quanto ao v∞ e às duas datas:

- C3: ±0,3 km²/s²
- v∞ de chegada: ±0,05 km/s
- cada data: ±3 dias

Por que essas margens: os passos da nossa grade (2 e 3 dias) põem a célula até 1–1,5 dia longe do ótimo verdadeiro, e a busca do manual em passos de 2 dias acrescenta até 1 dia. Nos valores entram gerações diferentes de efeméride (o manual é anterior ao DE441), a saída com duas casas do MIDAS e a quantização da grade ao longo do vale do mínimo. A maior diferença medida é −0,20 km²/s² no C3 do Tipo I. O teste também exige que o `best` da grade seja o mínimo Tipo II, como no manual.

## 9. Queima de escape e de captura

Arquivo: `src/physics/orbit.ts`.

Escape a partir de uma órbita circular de estacionamento de raio `r_park` (no jogo, `R_EARTH` + 200 km), com v∞ = √C3:

```
Δv_escape = √(v∞² + 2μ/r_park) − √(μ/r_park)              escapeBurn(mu, rPark, vInf)
```

Captura na periapse de uma elipse rp × ra a partir de v∞:

```
Δv_captura = √(v∞² + 2μ/rp) − √(μ·(2/rp − 1/a)),  a = (rp + ra)/2      captureBurn(mu, rp, ra, vInf)
```

No jogo, a órbita de captura é 300 km × 33.000 km de altitude (`MISSION.capturePeriapsisAltM`, `MISSION.captureApoapsisAltM`), então rp = `R_MARS` + 300 km e ra = `R_MARS` + 33.000 km. As duas queimas são impulsivas.

Valores medidos: escape para C3 9,18 km²/s² a partir de 200 km custa 3.635 m/s; captura com v∞ 2,65 km/s custa 907,8 m/s; com o v∞ da transferência de referência (2,712 km/s), 938 m/s.

Testes: `orbit.test.ts` (3.613 m/s e 907 m/s nos casos legados, tolerância de ±5 m/s por `toBeCloseTo(x, −1)`), `spacecraft.test.ts` (captura a 2,65 km/s dentro de 10 m/s de 907 m/s, independente do Isp) e `launcher.test.ts` (o escape entra no Δv exigido do lançador).

## 10. Equação do foguete

Arquivo: `src/physics/rocket.ts`. Teste: `src/physics/rocket.test.ts`.

| Função | Fórmula | Uso |
|---|---|---|
| `deltaV(isp, m0, mf)` | `Δv = Isp·g₀·ln(m0/mf)`; 0 se não for m0 > mf > 0 | estágios do lançador, linha do tempo do lançamento |
| `propellantFor(dv, isp, dryKg)` | `m_prop = m_seca·(e^(Δv/(Isp·g₀)) − 1)`; 0 se Δv ≤ 0; ∞ se Isp ≤ 0 | propelente carregado na espaçonave |
| `propellantFromMass(dv, isp, massKg)` | `m_prop = m0·(1 − e^(−Δv/(Isp·g₀)))`; 0 se Δv ≤ 0 ou `NaN`; ∞ se Isp ≤ 0 ou Δv infinito | cada queima feita durante o voo (TCM, atitude, captura) |

`dvLeftMs` em `src/game/scoring.ts` usa a mesma equação para converter o propelente que sobrou em Δv: `Isp·g₀·ln((seca + prop)/seca)`.

O teste confere Tsiolkovsky (`deltaV(300, 2, 1)` = 300·g₀·ln 2), zero para razões de massa impossíveis, `propellantFor(1000, 320, 1000)` ≈ 375,3 kg, que `propellantFor` é a inversa de `deltaV`, e que `propellantFromMass` concorda com `deltaV`.

## 11. Lançador modular

Arquivo: `src/physics/launcher.ts`. Teste: `src/physics/launcher.test.ts`. Constantes de balanceamento em `src/data/mission.ts`.

O lançamento não é uma simulação de voo. É um orçamento de Δv: a pilha de estágios precisa fornecer a subida até a órbita de estacionamento de 200 km mais a queima de escape até o C3 escolhido.

### Regras de montagem (`rocketStats`)

- 1 a 3 estágios (`MAX_STAGES`), cada um com pelo menos um tanque e um motor, 1 a 9 motores iguais por estágio (`MIN_ENGINES`, `MAX_ENGINES`).
- O propelente de cada tanque precisa ser o do motor (kerolox, hydrolox ou methalox).
- O primeiro estágio precisa de um motor que funcione ao nível do mar (empuxo SL > 0 e Isp SL > 0).
- Boosters laterais só no primeiro estágio, 0 a 6 (`MAX_BOOSTERS`).
- Coifa pequena (1.500 kg) ou grande (2.500 kg) (`FAIRINGS`); a coifa viaja com o estágio 1.
- Massa de cada estágio: soma de propelente e massa seca dos tanques, mais n × massa do motor.

### Δv por estágio e mistura de Isp no estágio 1

Para os estágios superiores, empuxo e Isp de vácuo. Para o estágio 1 (função `propulsion`), média entre nível do mar e vácuo, porque o estágio começa na atmosfera e termina quase no vácuo:

```
F = n·(F_SL + F_vac)/2      Isp = (Isp_SL + Isp_vac)/2      ṁ = F/(Isp·g₀)
Δv_estágio = Isp·g₀·ln(m0/mf)
TWR de decolagem = (n·F_SL do núcleo + n_b·F_SL dos boosters) / (m0·g₀)
TWR dos estágios superiores = F_vac / (m0·g₀)
tempo de queima = m_prop / ṁ
```

O teste confere esses números para o preset Atlas V 401 (Centaur: 20.830 + 2.053 + 190 kg mais a carga; núcleo: Isp médio (311,3 + 337,8)/2; TWR = 3.827.000 N / (m0·g₀); tempo de queima = m_prop/ṁ).

### Boosters em paralelo

No estágio 1 com boosters, a queima é dividida em segmentos de vazão constante:

- Fase A: núcleo e boosters queimam juntos até o primeiro deles esvaziar. Isp efetivo `Isp_A = (F_b + F_c)/((ṁ_b + ṁ_c)·g₀)`.
- Se os boosters acabam primeiro: soltam a massa seca e o núcleo queima o que sobrou (fase B, Isp do núcleo).
- Se o núcleo acaba primeiro: os boosters terminam a queima carregando o núcleo, depois tudo se separa.

O Δv do estágio é a soma de `deltaV` em cada segmento. O teste reproduz à mão o estágio 1 do Vulcan VC4 (2 × BE-4 e 4 × GEM 63XL) e confere m0, Δv, tempo de queima e TWR.

### Subida até a órbita de estacionamento

```
Δv_subida(TWR) = ASCENT_DV + GRAVITY_LOSS_K·(1/TWR − 1/ASCENT_REFERENCE_TWR)
              = 9.400 + 3.000·(1/TWR − 1/1,5)  m/s,   TWR limitado a [1,1; 2,5]
```

Função `ascentDeltaV`. Um foguete que mal vence o próprio peso sobe devagar e perde mais para a gravidade; em primeira ordem essa perda cresce com 1/TWR. O limite inferior 1,1 é `MISSION.minLiftoffTwr`; o superior, `GRAVITY_LOSS_MAX_TWR` = 2,5, existe porque acima disso arrasto, limitação no max-Q e perdas de direcionamento dominam (sem o limite, uma pilha com TWR 8 precisaria de só 7.776 m/s). Faixa resultante: 8.600 m/s (TWR ≥ 2,5) a 10.127 m/s (TWR 1,1). TWR ≤ 0 ou não finito dá ∞.

Esses três números (9.400, 3.000 e 2,5) são balanceamento de jogo calibrado nas curvas da NASA LSP. O comentário de `mission.ts` explica a escolha: com um orçamento fixo, o Atlas V 401 (TWR ≈ 1,17) precisaria de ≈ 10.000 m/s e Falcon Heavy e Vulcan VC4 (TWR ≈ 1,6) de 9.100 a 9.400 m/s, e nenhum valor único atende os três dentro de 15%.

### Δv exigido para um C3

```
requiredDeltaV(C3, TWR) = Δv_subida(TWR) + escapeBurn(MU_EARTH, R_EARTH + 200 km, √C3 · 1000)
```

Para C3 < 0 (órbitas fechadas) usa a mesma relação de vis-viva; abaixo da energia de órbita circular não há queima. C3 não finito dá ∞. Exemplo medido: C3 9,18 e TWR 1,5 exigem 13.035 m/s.

Teste: em TWR 1,5 o resultado é exatamente 9.400 + escape para C3 0, 9,18 e 30; cai à medida que o TWR sobe (1,1 → 2,5); o TWR é limitado a [1,1; 2,5] (TWR 5 e 8 dão o mesmo que 2,5; TWR 0,5 dá o mesmo que 1,1); `ascentDeltaV(8)` = 8.600 m/s.

### Estágios superiores: TWR ≥ 0,25

`UPPER_STAGE_MIN_TWR` = 0,25 (balanceamento). Todo estágio acima do primeiro precisa acender com TWR de vácuo ≥ 0,25, contando tudo o que carrega, inclusive a carga útil. Uma queima longa e fraca numa trajetória suborbital perde energia para a gravidade, e o orçamento de Δv não modela isso; sem essa regra, estágios superiores com motores minúsculos ganhariam. Estágios superiores reais acendem entre 0,3 e 0,8 (Centaur V ≈ 0,3, Centaur ≈ 0,4, Falcon ≈ 0,8). Se o estágio fica abaixo de 0,25 mesmo sem carga, a pilha é inválida ("Stage 2 thrust too low").

### Capacidade até um C3 (`capacityToC3`)

Bisseção sobre a massa da espaçonave em [0, 200.000] kg (`MAX_PAYLOAD_KG`), com resolução de 1 kg. Uma massa é aceita quando, com ela a bordo:

1. TWR de decolagem ≥ 1,1;
2. todo estágio superior acende com TWR ≥ 0,25;
3. `totalDv ≥ requiredDeltaV(C3, TWR de decolagem)`.

As três condições ficam mais difíceis conforme a carga cresce, então a bisseção é monotônica. Pilha inválida, C3 não finito ou nenhuma massa aceita (nem 0 kg) dá capacidade 0.

### Linha do tempo do lançamento (`launchTimeline`)

Usa os mesmos segmentos de queima em segundos reais. "Órbita" é o instante em que a pilha já entregou `ascentDeltaV`; "departure-burn" é quando completou o escape até o C3. O tempo dentro de um segmento sai de `t = (m0/ṁ)·(1 − e^(−Δv/(Isp·g₀)))`. Falhas: TWR < 1,1 → só `liftoff`, falha `twr`; Δv acaba antes da órbita, ou um estágio superior acende abaixo de 0,25 com essa carga → falha `dv`; em órbita mas sem chegar ao C3 → `reachedOrbit` verdadeiro, falha `dv`.

### Validação contra a NASA LSP

Os três presets com curva da NASA Launch Services Program são montados só com peças do catálogo (ver [DATA.md](DATA.md) para a origem das curvas). O teste "validation: every LSP point within ±15%" calcula `capacityToC3` em cada ponto C3 de cada curva e exige erro relativo ≤ 15%. Cada célula abaixo mostra "modelo x LSP" e o erro medido (modelo − LSP)/LSP:

| Preset | TWR de decolagem (vazio) | C3 0 | C3 10 | C3 20 | C3 30 | Pior ponto |
|---|---|---|---|---|---|---|
| Atlas V 401 (curva AMAT/LSP) | 1,180 | 2.928 x 3.036 kg (−3,6%) | 2.368 x 2.428 kg (−2,5%) | 1.891 x 1.876 kg (+0,8%) | 1.481 x 1.389 kg (+6,6%) | +6,6% em C3 30 |
| Falcon Heavy expendable (LSP ao vivo) | 1,647 | 13.823 x 15.010 kg (−7,9%) | 11.505 x 12.345 kg (−6,8%) | 9.573 x 10.115 kg (−5,4%) | 7.946 x 8.225 kg (−3,4%) | −7,9% em C3 0 |
| Vulcan VC4 (LSP ao vivo) | 1,596 | 8.773 x 8.550 kg (+2,6%) | 7.231 x 7.140 kg (+1,3%) | 5.915 x 5.880 kg (+0,6%) | 4.781 x 4.780 kg (0,0%) | +3,5% em C3 −5 |

Todos os pontos ficam dentro de 8%, bem abaixo da tolerância de ±15% do teste. Ponto de controle real: o MAVEN partiu num Atlas V 401 com 2.454 kg para C3 12,07 km²/s²; a curva LSP dá ≈ 2.309 kg nesse C3 (curvas LSP têm reservas 3-sigma, e missões reais voam alguns por cento acima) e o modelo dá 2.263 kg. `catalog.test.ts` exige que a curva fique a menos de 10% do MAVEN.

Outros testes de `launcher.test.ts`: pilhas inválidas (sem motor, propelente trocado, sem tanques, vazia, quatro estágios, motor de vácuo no estágio 1, 12 motores, boosters no estágio 2, peças desconhecidas) dão `valid` falso, capacidade 0 e nenhum `NaN`/∞ em nenhum campo; Δv total cai a cada 500 kg de carga a mais; dois GEM 63 no Atlas V 401 aumentam TWR, capacidade em C3 10 e custo; capacidade cai com o C3 e é 0 para C3 absurdo; a capacidade é o maior inteiro (em kg) que ainda fecha o orçamento; o preset de referência leva uma espaçonave de 1.500 kg até C3 9,18 dentro de 90% da capacidade; a linha do tempo de cada preset está em ordem, com separações de estágio, coifa, órbita e partida, e a separação do estágio 1 acontece no tempo de queima do estágio 1 (> 200 s).

## 12. Orçamentos da espaçonave

Arquivo: `src/game/spacecraft.ts`, função `analyseSpacecraft(design, vInfArrKms, marsDistanceAU)`. A lista de verificação de lançamento está em `src/game/checklist.ts`, função `launchChecklist`. Testes: `spacecraft.test.ts` e `checklist.test.ts`.

### Massa e propelente

```
massa seca = Σ (cópias × massa da peça)
Δv_MOI    = captureBurn(MU_MARS, R_MARS + 300 km, R_MARS + 33.000 km, v∞ de chegada)
m_prop    = propellantFor(Δv_MOI + reserva de TCM, Isp do sistema de propulsão, massa seca)
          = m_seca·(e^((Δv_MOI + reserva)/(Isp·g₀)) − 1)
massa úmida = massa seca + m_prop
```

A reserva de TCM é escolhida pelo jogador e limitada a 0–150 m/s (`TCM_RESERVE_MAX_MS`). O Isp é 230 s (hidrazina monopropelente) ou 318 s (bipropelente). Sem v∞ escolhido, Δv_MOI = 0. Sem sistema de propulsão, ou com dois, a espaçonave é inválida.

Medido para a espaçonave de referência (`REFERENCE_SPACECRAFT`) na transferência de C3 mínimo: massa seca 972,4 kg, Δv_MOI 938 m/s, reserva 50 m/s, propelente 534,6 kg, massa úmida 1.507 kg, custo US$ 507 M.

### Potência

```
geração em Marte = Σ painéis solares · P(1 UA)/r²  +  Σ RTG (constante)      (solarPowerW, lei do inverso do quadrado)
carga            = Σ |potência| das peças que consomem
bateria cobre    = Wh da bateria / 4 h                                           (BATTERY_COVER_HOURS = 4, balanceamento)
regra            : geração + bateria/4 ≥ carga
```

Na lista de verificação, r é a distância Sol–Marte na data de chegada (`bodyState('mars', arrJd)`); sem transferência escolhida, a distância média de 1,5237 UA. A regra das 4 horas é balanceamento: a bateria é dimensionada para atravessar um eclipse ou pico de carga de 4 h, não para alimentar a nave. Referência medida: 2.524 W a 1,54 UA + 385 W da bateria contra 746 W de carga.

### Margem de lançamento

```
massa úmida ≤ MISSION.launchMargin × capacityToC3(foguete, C3 da transferência)  = 0,9 × capacidade
```

Ou seja, pelo menos 10% de margem. Referência medida: 1.507 kg contra o limite de 2.169 kg (90% de 2.410 kg em C3 9,18). O TWR de decolagem também é recalculado com a massa úmida da espaçonave a bordo (1,17 na referência).

### Lista de verificação

`launchChecklist` recalcula tudo a cada chamada, sem cache: transferência escolhida; pilha válida; TWR de decolagem ≥ 1,1; margem ≥ 10%; custo do foguete + espaçonave ≤ US$ 900 M; espaçonave completa (barramento presente, sem peças desconhecidas, limites de cópias); potência em Marte; pelo menos uma antena; pelo menos um instrumento; propulsão capaz de entregar Δv_MOI + reserva. O botão de lançar só libera quando todos os itens passam (`canLaunch`).

Testes: `spacecraft.test.ts` confere a fórmula de propelente com Isp 230, que o biprop gasta menos propelente por kg seco, somas de massa/custo/ciência/armazenamento/blindagem/taxa, escala solar com 1/r² e RTG sem escala, erros de barramento e propulsão, reserva limitada a 0–150 m/s e ausência de `NaN`. `checklist.test.ts` exige que o `REFERENCE_DESIGN` passe em tudo e que cada item falhe quando deve (C3 mais alto derruba a margem, massa a mais derruba a margem, custo acima de 900, potência insuficiente, sem barramento, sem antena, sem instrumento, sem propulsão, foguete inválido, foguete pesado demais para decolar), sempre sem `NaN`.

## 13. Cruzeiro: erro de injeção, TCMs e chegada

Arquivo: `src/game/cruise.ts`. Teste: `src/game/cruise.test.ts`.

Durante o cruzeiro só o Sol atrai a nave (cônicas concatenadas). `advanceCruise` faz uma única propagação de Kepler (μ = `MU_SUN`) a partir do estado atual e nunca passa da data de chegada planejada.

### Erro de injeção

`startCruise` coloca a nave na posição da Terra na data de partida com a velocidade v1 de Lambert mais um erro de injeção. O erro tem três componentes independentes N(0, 2 m/s) (`INJECTION_ERROR_SIGMA_MS` = 2, balanceamento "típico de estágios superiores"), sorteadas por Box–Muller sobre o gerador semeado `mulberry32` (`src/game/rng.ts`). A mesma semente sempre gera o mesmo erro.

Teste: o erro é determinístico por semente, menor que 20 m/s, e em 400 sementes a média por eixo fica abaixo de 0,3 m/s e o desvio-padrão entre 1,7 e 2,3 m/s.

### Manobras de correção de trajetória (TCM)

Janelas (`TCM_WINDOWS`): TCM-1 no dia 15, TCM-2 no dia 60, TCM-3 30 dias antes da chegada.

Uma TCM resolve um novo Lambert da posição atual da nave até o ponto de mira na data de chegada e troca a velocidade pela nova v1:

```
Δv_TCM = |v1(Lambert: r_nave → ponto de mira, tempo = chegada − agora) − v_nave|
m_prop = propellantFromMass(Δv_TCM, Isp, massa seca + propelente atual)
```

O ponto de mira é o centro de Marte na data de chegada (`bodyState('mars', arrJd)`), não um ponto de periapse ou de entrada na órbita.

Plano quebrado perto de 180° (`NEAR_180_DEG` = 5): quando o ângulo entre a nave e o ponto de mira está a menos de 5° de 180°, o plano r × r_Marte fica mal definido e uma correção fora do plano custa ∝ 1/sin Δθ. O comentário no código cita ≈ 940 m/s na TCM-1 da transferência de referência, cujo arco de ~196° passa por 180° em relação ao ponto de chegada de Marte perto do dia 15, contra ≈ 6 m/s cinco dias depois. Nessa faixa, o ponto de mira é projetado no plano orbital atual da nave e a pequena diferença fora do plano fica para a TCM seguinte, como navegadores fazem em transferências perto de 180°. Com 5°, a amplificação fora do plano fica abaixo de ~11× (sin 5° ≈ 0,087).

Se não houver arco de Lambert, `tcmCost` devolve ∞ (nunca `NaN`); se faltar propelente, `tcmQuote` oferece a TCM desabilitada com o motivo e `applyTcm` devolve `{ error: 'insufficient-propellant' }` sem mudar o estado.

### Chegada e captura

`predictArrival` propaga até a data de chegada e mede a distância até o centro de Marte (km) e a velocidade relativa a Marte (v∞, km/s). `arrive` decide:

```
captura  ⇔  distância ao ponto de mira na data de chegada ≤ 10.000 km   (CAPTURE_MAX_MISS_KM, balanceamento)
          e propellantFromMass(captureBurn(v∞ real), Isp, massa atual) ≤ propelente a bordo
```

Senão é sobrevoo, com motivo `miss` (prioritário) ou `propellant`. A distância é medida na data de chegada, não é a máxima aproximação.

Testes:

- sem erro de injeção, a nave começa exatamente em v1, a previsão erra Marte por menos de 1.000 km, captura, e o Δv de captura fica a 5% do orçamento da espaçonave;
- com o erro da semente 1 e sem TCM, erra por mais de 10.000 km e vira sobrevoo por `miss`;
- uma TCM cedo (dia 15) custa menos que uma tarde (30 dias antes da chegada);
- a TCM-1 leva o erro previsto para menos de 10.000 km, gasta propelente, deixa custo residual < 0,01 m/s e a chegada vira captura;
- com erro só fora do plano (0, 0, 2) m/s, o custo nos dias 10, 14, 15, 16 e 20 fica abaixo de 15 m/s (Lambert puro daria ≈ 750 m/s nesse caso, segundo o teste); depois TCM-1 e TCM-2, a TCM-2 custa < 5 m/s e o erro previsto cai para menos de 1 km;
- sem propelente: TCM recusada, chegada vira sobrevoo, nada lança exceção;
- avançar um dia de cada vez dá o mesmo resultado que um passo longo; passos zero, negativos ou não finitos não mudam o estado.

## 14. Eventos de erupção solar

Arquivo: `src/game/events.ts`. Teste: `src/game/events.test.ts`. As erupções são reais (DONKI, ver [DATA.md](DATA.md)); os efeitos são balanceamento de jogo e aparecem assim na interface.

Agendamento (`scheduleEvents`): 2 ou 3 erupções distintas por cruzeiro, escolhidas da lista DONKI pelo gerador semeado (não pela data do calendário), em dias inteiros ≥ 10 após o lançamento, antes da chegada, separadas por pelo menos 20 dias. Classe M vira gravidade "moderada", classe X "severa". Se o cruzeiro for curto demais para espaçar os eventos, o número cai; abaixo de 11 dias não há evento.

Opções do jogador (`eventOptions`, `resolveEvent`), com `EVENT_RULES`:

| Opção | Probabilidade de dano a um instrumento | Custo | Disponível se |
|---|---|---|---|
| Modo de segurança | 0,02 | 5 dias de ciência de cruzeiro perdidos | bateria ≥ 300 Wh |
| Continuar observando | risco base × (1 − blindagem) | nenhum; +2 (M) ou +4 (X) de ciência de cruzeiro se não houver dano | sempre |
| Virar o lado blindado para o Sol | risco base × (1 − blindagem) × 0,5 | 2 m/s de propelente (`propellantFromMass`) | há propelente para 2 m/s |

Risco base: 0,15 (moderada) e 0,40 (severa). A blindagem contra radiação vale 0,5 (`radiationShield` da peça `shield-radiation`). Um sorteio decide se há dano; se houver, um segundo sorteio escolhe um instrumento intacto, que sai de serviço até o fim da missão.

Teste: valores de `EVENT_RULES`; agendamento determinístico, 2–3 eventos com flares distintos da lista DONKI, dias ≥ 10, < tempo de voo, espaçamento ≥ 20, gravidade conforme a classe (200 sementes × 4 tempos de voo); riscos 0,02 / 0,075 / 0,0375 na referência (com blindagem) e 0,4 sem blindagem em evento severo; modo de segurança indisponível sem bateria; virar indisponível sem propelente; ciência +2/+4; dano desliga um instrumento instalado; opções indisponíveis e eventos já resolvidos não mudam o estado.

## 15. Operações em órbita de Marte

Arquivos: `src/game/ops.ts` e `src/physics/link.ts`. Testes: `ops.test.ts` e `link.test.ts`.

São `MISSION.opsTurns` = 6 turnos de `MISSION.turnDays` = 30 dias, começando na data de chegada. A geometria de cada turno vem da efeméride real (datas fora do intervalo são presas às pontas).

| Grandeza | Fórmula | Função |
|---|---|---|
| potência solar | `P(r) = P(1 UA)/r²`, r = distância Sol–Marte na data do turno | `solarPowerW` |
| taxa de dados | `R(d) = R(1 UA)/d²`, d = distância Terra–Marte | `dataRateMbps` |
| volume por turno | `Gbit = Mbit/s × 3600 × 8 h × dias / 1000` | `dataVolumeGb`, `DSN_CONTACT_HOURS_PER_DAY` = 8 |
| atraso do sinal | `t = d/c` (minutos na tela) | `signalDelayS` |
| conjunção solar | ângulo Sol–Terra–Marte < 3° → sem downlink | `solarConjunction`, `sunEarthMarsAngleDeg` |

O 1/d² vem do enlace: a potência recebida cai com o quadrado da distância e, mantida a taxa de erro de bits, a taxa de dados cai junto. A regra de 3° segue a prática real das missões em Marte, que param de comandar durante a conjunção. As 8 h diárias de contato com a Deep Space Network são balanceamento (um passe por dia, típico de um orbitador em Marte que divide a DSN com outras missões).

Potência em cada turno: geração (solar escalada + RTG) + bateria/4 menos as cargas que não são instrumentos dá a potência livre para instrumentos (`maxLoadW`). Se nem as cargas básicas cabem, é apagão: sem instrumentos e sem downlink. Um plano que pede mais potência do que há lança `RangeError` em vez de ser cortado em silêncio.

Dados e ciência (`runOpsTurn`, regra proporcional do protótipo legado):

```
dados no pool    = dados armazenados + dados coletados no turno            (Gbit)
ciência no pool  = ciência dos dados armazenados + ciência coletada
enviado          = min(dados no pool, capacidade do turno)                  (0 em conjunção ou apagão)
ciência entregue = ciência no pool × enviado / dados no pool
armazenamento    = gravadores instalados + MISSION.bufferGbit (40 Gbit)
```

O que excede o armazenamento é sobrescrito e a ciência correspondente se perde na mesma proporção.

Testes de `ops.test.ts`: distância Terra–Marte, atraso (d/c/60) e conjunção vêm de `bodyState`; a referência com todos os instrumentos entrega ≥ 100 pontos de ciência em 6 turnos; a referência com antena de alto ganho fica limitada pelo enlace nos turnos mais distantes (ruling R27); só com antena de baixo ganho entrega ≤ 60% da referência; um terminal laser remove o limite; um gravador menor transborda e avisa; durante a conjunção de 2028 (≈ 21 Mar 2028) nada desce e os dados ficam a bordo; um gravador pequeno perde ciência numa conjunção em que um grande não perde. Testes de `link.test.ts`: 2.000 W a 1,52 UA ≈ 865,7 W; 0,9 Mbit/s a 0,59 UA ≈ 2,585 Mbit/s (o MRO fazia 2,6 Mbit/s a 0,59 UA); atraso de 1 UA ≈ 499 s; conjunção verdadeira só abaixo de 3°; 1 Mbit/s por 30 dias = 864 Gbit; entradas inválidas dão 0.

## 16. Pontuação

Arquivo: `src/game/scoring.ts`, função `scoreMission`. Teste: `src/game/scoring.test.ts`. Toda a pontuação é balanceamento de jogo (fórmula do protótipo legado, com "turnos em modo de segurança" trocados por dias em modo de segurança / 10).

```
ciência      = ciência entregue nas operações + ciência de cruzeiro
fração       = min(1, max(0, orçamento restante) / 900)
pontos       = ciência × (1 + 0,5 × fração) × 1,5  +  Δv restante / 100  −  5 × dias em modo de segurança / 10
             arredondado, ≥ 0; 0 em caso de falha
Δv restante  = Isp·g₀·ln((seca + propelente restante)/seca)                   (dvLeftMs)
resultado    = sucesso (capturou e ciência ≥ 100) | parcial (capturou, ciência < 100) | falha (não capturou)
estrelas     = falha 0 | parcial 1 | sucesso com ≥ 20% do orçamento sobrando 3 | sucesso 2
```

Falhas de lançamento são mapeadas por `failureFromLaunch`: `pad` (TWR), `orbit` (não chegou à órbita), `departure` (não chegou ao C3).

Teste: sucesso com 120 de ciência, US$ 300 M sobrando e 200 m/s dá `round(120 × (1 + 300/900 × 0,5) × 1,5 + 2)` e 3 estrelas; < 20% sobrando dá 2 estrelas; 10 dias em modo de segurança custam 5 pontos; abaixo da meta é parcial com 1 estrela; sem captura é falha com 0 pontos, mesmo com ciência de cruzeiro; entradas absurdas não geram `NaN`; `dvLeftMs` é a equação do foguete.

## 17. Como o jogo simplifica

Esta lista acompanha `SIMPLIFICATIONS` em `src/data/concepts.ts`, que aparece na tela de fontes de dados, e a seção 6 da [spec](superpowers/specs/2026-10-22-mission-architect-vision-design.md).

1. Cônicas concatenadas de dois corpos: perto de um planeta só ele atrai a nave; longe, só o Sol. No cruzeiro do jogo, Terra e Marte não atraem a nave em momento nenhum; a chegada é avaliada com o v∞ relativo a Marte.
2. As queimas são impulsivas: a velocidade muda num ponto, não ao longo de minutos.
3. Transferências de uma revolução, sem assistência gravitacional.
4. A subida a partir da plataforma não é voada. Chegar à órbita de 200 km custa um orçamento de 9.400 m/s com TWR de decolagem 1,5, mais 3.000 × (1/TWR − 1/1,5) m/s de perdas gravitacionais (balanceamento calibrado nas curvas da NASA LSP).
5. Todo estágio superior precisa acender com TWR ≥ 0,25 (balanceamento), no lugar das perdas gravitacionais de queimas longas e fracas.
6. A taxa de dados cai com 1/d² a partir da taxa de cada antena a 1 UA, com um passe de 8 h da Deep Space Network por dia (balanceamento).
7. As correções de rota miram o centro de Marte; a queima de captura supõe periapse de 300 km.
8. Preços das peças, pontos de ciência, efeitos das erupções e o orçamento de US$ 900 M são balanceamento. Constantes físicas, posições dos planetas, dados de motores e curvas dos lançadores são reais.

Outras simplificações visíveis no código: TDB tratado como UTC (cerca de 69 s); erro de injeção sorteado em vez de vir de uma análise de dispersão; captura decidida pela distância ao centro de Marte na data de chegada, sem modelar a hipérbole de aproximação; o estágio 1 usa a média dos valores de nível do mar e vácuo em vez de um perfil de pressão.

## 18. Física real x balanceamento de jogo

### Real: dados publicados ou física padrão

| Item | Onde |
|---|---|
| Constantes físicas (g₀, AU, c, GM e raios de Sol, Terra e Marte) | `src/physics/constants.ts` |
| Posições e velocidades de Terra e Marte (JPL Horizons DE441/mar099) | `src/data/generated/ephemeris-*.json`, `ephemeris.ts` |
| Kepler, Lambert, vis-viva, escape, captura, Tsiolkovsky | `src/physics/*.ts` |
| C3 e v∞ de cada célula do porkchop, validados contra NASA/TM-2010-216764 | `porkchop.ts`, `porkchop.test.ts` |
| Empuxo, Isp e massa de motores; massas de estágios e boosters (alguns marcados "estimate") | `src/data/engines.ts`, `tanks.ts`, `boosters.ts`, `presetReference.ts` |
| Curvas carga útil x C3 da NASA LSP (validação) | `src/data/lsp.ts` |
| Massa, potência e taxa das peças de espaçonave (MRO, MAVEN, HiRISE, CRISM, DSOC, MMRTG; alguns "estimate") | `src/data/spacecraftParts.ts` |
| Isp da hidrazina (230 s) e do bipropelente (318 s) | `src/data/spacecraftParts.ts` |
| Potência ∝ 1/r², taxa ∝ 1/d², atraso d/c | `src/physics/link.ts` |
| Bloqueio na conjunção solar abaixo de 3° (prática real) | `src/physics/link.ts` |
| Erupções solares M e X (NASA DONKI): data e classe | `src/data/generated/donki-flares.json` |
| Órbita de estacionamento de 200 km e captura 300 × 33.000 km (modeladas na prática de orbitadores de Marte) | `src/data/mission.ts` |

### Balanceamento de jogo

| Valor | Número | Onde |
|---|---|---|
| Orçamento da missão | US$ 900 M | `MISSION.budgetM` |
| Orçamento de subida em TWR 1,5 | 9.400 m/s | `ASCENT_DV` |
| Coeficiente de perda gravitacional | 3.000 m/s | `GRAVITY_LOSS_K` |
| Limite superior do TWR na perda gravitacional | 2,5 | `GRAVITY_LOSS_MAX_TWR` |
| TWR mínimo de decolagem | 1,1 | `MISSION.minLiftoffTwr` |
| TWR mínimo de estágio superior | 0,25 | `UPPER_STAGE_MIN_TWR` |
| Margem de lançamento | massa úmida ≤ 0,9 × capacidade | `MISSION.launchMargin` |
| Massa e custo das coifas | 1.500 kg / US$ 3 M; 2.500 kg / US$ 5 M | `FAIRINGS` |
| Máximo de estágios, motores e boosters | 3, 9, 6 | `launcher.ts` |
| Custos de motores, tanques, boosters e peças | ver [DATA.md](DATA.md) | `src/data/*.ts` |
| Cobertura da bateria | Wh / 4 h | `BATTERY_COVER_HOURS` |
| Reserva de TCM | 0 a 150 m/s | `TCM_RESERVE_MAX_MS` |
| Erro de injeção | N(0, 2 m/s) por eixo | `INJECTION_ERROR_SIGMA_MS` |
| Janelas de TCM | dia 15, dia 60, chegada − 30 dias | `TCM_WINDOWS` |
| Faixa de plano quebrado | 5° de 180° | `NEAR_180_DEG` |
| Distância máxima para captura | 10.000 km | `CAPTURE_MAX_MISS_KM` |
| Regras das erupções (riscos, custos, ciência, espaçamento) | ver [seção 14](#14-eventos-de-erupção-solar) | `EVENT_RULES` |
| Blindagem contra radiação | remove 50% do risco | `shield-radiation` |
| Turnos de operação | 6 de 30 dias | `MISSION.opsTurns`, `turnDays` |
| Contato com a DSN | 8 h por dia | `DSN_CONTACT_HOURS_PER_DAY` |
| Buffer interno de dados | 40 Gbit | `MISSION.bufferGbit` |
| Pontos de ciência e volume de dados dos instrumentos | ver [DATA.md](DATA.md) | `spacecraftParts.ts` |
| Meta de ciência | 100 pontos | `MISSION.scienceTarget` |
| Fórmula de pontuação e estrelas | multiplicador 1,5; −5 por 10 dias em modo de segurança; 3 estrelas com ≥ 20% do orçamento | `scoring.ts` |
| Faixa de tempo de voo do porkchop | 100 a 500 dias | `DEFAULT_PORKCHOP` |
| `maxCruiseDays`, `encounterSoiFactor` | 600 dias; 2× a SOI | `MISSION` (hoje sem uso na lógica do cruzeiro; ver nota abaixo) |

Nota: `MISSION.encounterSoiFactor` só aparece no texto do cartão "Sphere of influence" em `concepts.ts`, que diz que o jogo começa o encontro a 2× a SOI e troca o corpo central ao cruzar a fronteira. A lógica de `cruise.ts` não faz essa troca: propaga só em torno do Sol até a data de chegada e decide a captura pela regra de 10.000 km.
