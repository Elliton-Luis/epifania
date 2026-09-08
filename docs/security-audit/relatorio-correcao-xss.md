# Relatório de Correção — Stored XSS e Proteção de Dados (Epifania)

Data: 08/09/2026 · Autor: auditoria/correção de código · Escopo: repositório Epifania (sem `.env`/segredos de terceiros — fora de escopo por determinação da tarefa).

## 1. Resumo

| Item | Antes | Depois |
|---|---|---|
| Vulnerabilidade: Stored XSS via `id` importado renderizado sem escape | **Presente** (`js/app.js:268`, fonte `:438-439`) | **Corrigida** — render via DOM API + ids externos nunca preservados |
| Severidade | Alta (execução na origem que guarda `epifania:notes` / `epifania:enc:v1`) | Residual: sem vetor conhecido |
| Importação JSON | Preservava `id` arbitrário; validava só `title`/`content` | Validação estrita + normalização + ids sempre regenerados |
| Backup/migração/versionamento | Inexistentes (schema sem versão) | `DATA_VERSION=1`, backup `epifania:backup:<ts>` (retenção 5), migração com backup-prévio |
| Testes | Nenhum | 27 testes (`node --test tests/*.mjs`), todos passando |

Stack detectada: JavaScript vanilla + HTML + CSS, sem framework/dependências/build; armazenamento `localStorage` (`js/storage.js`); cripto AES-GCM-256 + PBKDF2 (`js/crypto.js`); parser Markdown próprio (`js/markdown.js`); PWA estática (`manifest.json` + `sw.js`); sem suíte de testes prévia; schema de dados sem versão (export usava `version: 1` só no envelope).

## 2. Causa raiz

Fluxo do dado vulnerável:

1. **Fonte** — `js/app.js:438-439` (antigo): no import JSON, `n.id` externo era mantido sempre que único:
   `if(!n.id || existingIds.has(n.id)) n.id=Storage.generateId();`
2. **Persistência** — o `id` arbitrário era salvo em `localStorage` (`epifania:notes` ou blob `epifania:enc:v1`) e recarregado a cada sessão.
3. **Sink** — `js/app.js:268` (antigo): a lista interpolava o `id` sem escape dentro de `innerHTML`:
   `` data-id="${note.id}" `` (título/prévia usavam `escapeHtml`, o `id` não).
4. **Execução** — payload `{"title":"x","content":"y","id":"\" onclick=\"alert(1)"}` quebrava o atributo e executava JS ao clicar na nota, na mesma origem dos dados — permitindo leitura de `epifania:notes` e `epifania:enc:v1`.

## 3. Correções realizadas

```text
js/app.js:86
- escapeHtml local (sem aspas simples) → delega para EpifaniaValidate.escapeHtml (cobre & < > " ')
- motivo: escape central único, sem divergência entre módulos

js/app.js:252-306 (renderList)
- template innerHTML com data-id interpolado → construção via DOM API
  (createElement/textContent + article.dataset.id + setAttribute role/aria-label)
- limpeza via removeChild em vez de innerHTML=""; "nenhuma nota" via textContent
- motivo: dado nunca toca parser HTML — elimina a classe do bug, não só o payload

js/app.js:455-460 (handleImportFile, ramo .json)
- filtro superficial + preservação de id → EpifaniaValidate.parseBackupFile
  (parse, estrutura, tipos, normalização, ids sempre regenerados; conta rejeitadas no toast)
- motivo: arquivo externo é hostil por definição; identidade interna não vem de fora

js/app.js:130 (initialLoad)
- boot agora chama Storage.migrateIfNeeded() (com backup-prévio) antes de tudo
- motivo: migração segura e versionada desde a primeira execução

js/validate.js (NOVO)
- EpifaniaValidate: escapeHtml central, normalizeString (remove C0, limita tamanho),
  normalizeDate, normalizeNote (id sempre regenerado), parseBackupFile
  (limite ~5 MB, formas array ou {notes}, rejeita o resto), limites
  MAX_NOTES=5000, MAX_TITLE=500, MAX_CONTENT=200000
- motivo: validação reutilizável e testável sem DOM

js/storage.js
- DATA_VERSION=1 + VERSION_KEY=epifania:data-version; createBackup/readBackup/
  restoreBackup (pre-restore antes de restaurar); listBackups/pruneBackups (retenção 5);
  migrateIfNeeded (backup → validar → migrar → validar → carimbar; falha preserva o anterior);
  exportJson passa a incluir {app:"epifania", dataVersion, exportedAt};
  migração legada cuspir preserva a chave antiga como redundância
- motivo: proteção contra perda em atualizações/migrações; separação versão-app × versão-dados

js/markdown.js (final)
- guarda module.exports (sem mudar comportamento no navegador)
- motivo: permitir testes Node do parser sem DOM

index.html:186
- inclui js/validate.js antes de js/app.js
- motivo: ordem de carga da dependência nova

sw.js:1-15
- CACHE_NAME v3 → v4 (assets mudaram: +js/validate.js); comentário de garantia:
  worker só gerencia assets, nunca lê/apaga localStorage
- motivo: atualização do PWA entrega o fix sem tocar nos dados
```

## 4. Importação

- **Antes**: `JSON.parse` + filtro `title`/`content` string; `id` externo preservado se único; datas cruas; campos extras persistidos; sem limite de tamanho.
- **Depois** (`EpifaniaValidate.parseBackupFile`): limite ~5 MB → parse → exige array ou `{notes:[...]}` → por item: `title`/`content` devem ser string (senão rejeita), remove controles C0, trunca (500/200k), datas inválidas viram `nowISO`, **id sempre `Storage.generateId()`** (original descartado), extras descartados, teto 5000 notas. Retorna `{notes, rejectedCount}`; zero válidas → erro "nenhuma nota válida". Import `.md` inalterado (já gerava id novo).

## 5. Renderização

Busca sistemática por `innerHTML|outerHTML|insertAdjacentHTML|document.write|eval(|new Function|javascript:` em `js/`, `index.html`, `sw.js`.

| Sink | Arquivo:linha | Status | Justificativa |
|---|---|---|---|
| item da lista `data-id` | js/app.js:281 (novo) | **corrigido** | `article.dataset.id` — nunca interpretado como HTML |
| título/prévia/data lista | js/app.js:285-300 (novo) | **corrigido/endurecido** | `textContent`; `formatDate` só emite strings derivadas de `Date` |
| "nenhuma nota p/ query" | js/app.js:261-265 (novo) | **corrigido** | query via `textContent` (antes: `escapeHtml` em template — era seguro, agora estruturalmente seguro) |
| `els.pagination.innerHTML` | js/app.js:332 | seguro | só inteiros calculados + `…` estático; nenhum dado do usuário/nota |
| `els.mdPreview.innerHTML` | js/app.js:347 | sanitizado por construção | `Markdown.toHtml` escapa HTML antes de tudo (`markdown.js:4-6`), links só `https?` com `rel=noopener` (`:14,16,18`), código escapado (`:57-58`); coberto por testes |
| `document.write` export PDF (nota) | js/app.js:398 | seguro com ressalva | recebe `titleEsc` escapado + HTML do parser escapado; risco residual documentado (§11) |
| `document.write` export PDF (todas) | js/app.js:437 | seguro com ressalva | idem acima |
| `eval` / `new Function` / `javascript:` / `outerHTML` / `insertAdjacentHTML` | — | **ausentes** | grep retorna zero ocorrências (teste estático trava regressão) |

## 6. Proteção de dados

- **Backup automático**: `Storage.createBackup(reason)` fotografa `epifania:notes` (raw), `epifania:enc:v1` (raw), `epifania:enc:meta` + versão + timestamp em `epifania:backup:<ISO>` **antes** de qualquer migração/restauração. Falha de quota lança **sem ter modificado nada** (originais intactos — testado).
- **Retenção**: últimos **5** backups (`pruneBackups`); sem crescimento ilimitado.
- **Schema/versionamento**: `DATA_VERSION=1` em `epifania:data-version`; versão do app separada (não versionada neste projeto — só a dos dados). Migrações explícitas `v0→v1` (atual) com protocolo backup→validar→migrar→validar→carimbar; falha não destrói o anterior (retorna `{migrated:false, error, backup}`).
- **Erro**: `restoreBackup` valida o envelope e faz `pre-restore` antes de escrever; backup inválido lança sem alterar nada. Nenhum ponto do código usa `localStorage.clear()` (verificado por grep).
- **Export/import de backup**: export JSON existente mantido e enriquecido (`{app, dataVersion, exportedAt, version, notes}`); import de backup passa pela mesma validação estrita (§4).

## 7. PWA

- `sw.js`: estratégia **inalterada** (cache-first só de `GET`, `skipWaiting` + `clients.claim`, limpa caches antigos no `activate`). Mudanças: `CACHE_NAME` → `epifania-vintage-v4`, `js/validate.js` no precache, comentário de garantia.
- **Preservação**: worker nunca acessa `localStorage`/`IndexedDB` (só `caches`); atualização troca assets e mantém dados. `manifest.json` inalterado (instalabilidade preservada). Verificado: registro do SW em `app.js` final inalterado; `index.html` continua referenciando `manifest.json`.

## 8. Testes

Suíte nova, sem dependências: `node --test tests/*.mjs` (Node 22, módulo `node:test`).

```text
✓ escapeHtml central (& < > " ')
✓ payloads de id neutralizados (aspas, <, >, espaços, 5000 chars)
✓ Markdown: <script> e <img onerror> viram texto
✓ Markdown: javascript: não vira href executável
✓ Markdown: href com aspas não quebra atributo
✓ import regenera id malicioso (todos os payloads)
✓ import rejeita title/content não-string
✓ auditoria estática: sem data-id interpolado, DOM API em uso, sem eval/new Function, 2+2 sinks restantes
✓ import válido (array e {notes}), normaliza datas e ids
✓ import inválido (JSON quebrado, forma errada, vazio, tipos errados)
✓ campos ausentes preenchidos, extras descartados, limites aplicados, arquivo gigante rejeitado
✓ migração v0→v1 (backup + carimbo + noop)
✓ falha de migração preserva formato anterior
✓ legado cuspir preservado como redundância
✓ retenção máxima 5 backups
✓ restauração recupera estado + pre-restore
✓ restauração inválida não altera nada
✓ quota cheia no backup não apaga originais
✓ export inclui app + dataVersion + timestamp
✓ node --check em js/app|storage|validate|markdown|crypto + sw.js
```

Resultado: **27 testes, 7 suítes, 27 pass, 0 fail**.

## 9. Evidências

```bash
$ node --test tests/*.mjs
# tests 27 # pass 27 # fail 0

$ node --check js/app.js && node --check js/storage.js && node --check js/validate.js \
  && node --check js/markdown.js && node --check js/crypto.js && node --check sw.js
SYNTAX OK

$ rg -n "\.innerHTML\s*=|outerHTML|insertAdjacentHTML|document\.write|new Function|[^a-zA-Z]eval\s*\(" js/ index.html sw.js
js/app.js:332: els.pagination.innerHTML = html;          # só inteiros — seguro
js/app.js:347: els.mdPreview.innerHTML=Markdown.toHtml(content);  # saída escapada — testado
js/app.js:398,437: win.document.write(...)               # título/HTML escapados — §11

$ rg -n "localStorage\.clear" js/ sw.js
# (zero ocorrências)

$ git status --short   # antes: árvore limpa; depois: ver §10
```

## 10. Arquivos alterados

```text
M index.html                 (carrega js/validate.js)
M js/app.js                  (render DOM, import validado, migrate no boot, escape central)
M js/storage.js              (DATA_VERSION, backup/retenção/restore, migrateIfNeeded, export enriquecido)
M js/markdown.js             (guarda module.exports p/ testes; comportamento igual)
M sw.js                      (cache v4 + validate.js + garantia de dados)
A js/validate.js             (validação/normalização/escape central)
A tests/helpers.mjs          (stub localStorage + loader vm)
A tests/xss.test.mjs         (14 asserções XSS/sinks)
A tests/data.test.mjs        (13 asserções dados/migração/backup)
A docs/security-audit/relatorio-correcao-xss.md (este relatório)
```

## 11. Riscos residuais

- `document.write` nos exports PDF (`app.js:398,437`) continua existindo; hoje recebe apenas dados escapados (verificado + testado no parser), mas é um sink latente — migração para DOM API sugerida como hardening futuro, sem urgência.
- `Markdown.toHtml` é sanitização por construção (escape + allowlist `https?`), não uma lib dedicada (ex. DOMPurify); suficiente para a sintaxe suportada, mas qualquer ampliação do parser deve vir acompanhada dos testes em `tests/xss.test.mjs`.
- `escapeHtml` agora cobre `'` além de `&<>"`; nenhum sink restante depende de contexto com aspas simples não escapadas (verificado).
- Backups vivem no mesmo `localStorage` (protegem de bugs de migração, não de limpeza do navegador/dispositivo) — export JSON para fora continua sendo o backup off-device.

## 12. Conclusão

```text
XSS corrigido: SIM
Importação endurecida: SIM
Backup implementado: SIM
Migração segura: SIM
PWA preserva dados: SIM
Testes passando: SIM (27/27)
```
