# Epifania — teve uma ideia? Anote.

Um caderno digital minimalista, legível e sem fricção para capturar epifanias. Inspirado no Cuspir/Cátedra, mas com identidade própria: **abrir, anotar, seguir.**

> Não é um Notion. Não é um Obsidian. É um lugar limpo para pensar.

## Proposta

Epifania prioriza **clareza, velocidade e organização suficiente**. Sem dashboards, gamificação ou menus complexos. O foco é **escrever → salvar → encontrar**.

- Criação instantânea
- Autosave com debounce (~500 ms)
- Busca instantânea
- Leitura em markdown
- Offline e instalável como PWA

## Funcionalidades

- [x] Criar, editar e excluir notas
- [x] Título + conteúdo com **markdown** (headings, negrito, itálico, listas, código, links, citações)
- [x] Abas **escrever / prévia** com renderização instantânea
- [x] Autosave com debounce (persiste ao recarregar)
- [x] Busca instantânea por título e conteúdo
- [x] Ordenação por atualização (recentes/antigas)
- [x] Paginação (8 notas por página) com navegação minimalista
- [x] Timestamps + contador de palavras/caracteres
- [x] Exportar nota em **.md** e **PDF**
- [x] Exportar todas em **.md** e **PDF**
- [x] **Importar** JSON e .md (arraste ou seletor)
- [x] **Exportar** backup JSON
- [x] **Apagar todos os dados**
- [x] **Criptografia client-side** AES-GCM 256 + PBKDF2
- [x] Tela de bloqueio e troca de senha
- [x] `localStorage` (ou cifrado)
- [x] Mobile-first, legível e minimalista
- [x] PWA instalável e offline
- [x] Atalhos: `Ctrl/Cmd + N` nova nota, `Esc` voltar

## Tecnologias

- HTML
- CSS (vanilla, mobile-first, tipografia legível)
- JavaScript vanilla
- `localStorage`
- Web Crypto API (AES-GCM + PBKDF2)
- PWA: Manifest + Service Worker

Sem frameworks, sem dependências.

## Como executar

```bash
# abrir direto
open index.html

# recomendado para PWA
python3 -m http.server 8000
# http://localhost:8000
```

> Service Worker exige `http://localhost` ou HTTPS.

## Como instalar como PWA

1. Rode local ou hospede como site estático.
2. Abra no navegador.
3. Clique em **Instalar** na barra de endereço ou ⋮ → *Instalar app*.
4. Abre em `display: standalone` e funciona offline.

## Estrutura

```
epifania/
├── index.html
├── manifest.json
├── sw.js
├── css/
│   └── style.css
├── js/
│   ├── storage.js   # localStorage + migração cuspir → epifania
│   ├── markdown.js  # parser markdown vanilla
│   ├── crypto.js    # AES-GCM + PBKDF2 (com alias CuspirCrypto)
│   └── app.js       # CRUD, busca, render, export, crypto
└── assets/
    └── icons/
        ├── icon.svg
        ├── icon-192.png
        └── icon-512.png
```

## Onde os dados ficam

- Sem criptografia: `epifania:notes` → `JSON.stringify(Note[])`
- Com criptografia: `epifania:enc:v1` → `{ salt, iv, ct, v }` base64; `epifania:enc:meta`
- Migração automática de `cuspir:notes` / `cuspir:enc:v1` se existirem
- Cada nota: `{ id, title, content, createdAt, updatedAt }`
- `id` via `crypto.randomUUID()` com fallback
- Sem backend — tudo no dispositivo

```
localStorage
├── epifania:notes      # plano
└── epifania:enc:v1     # cifrado
    └── epifania:enc:meta
```

## Criptografia

- AES-GCM 256, chave derivada PBKDF2-SHA256 (120k iterações, salt 16B, iv 12B)
- 100% local, senha só em memória
- Esqueceu a senha → sem recuperação, só *apagar tudo*
- Ative em ⋮ → criptografia

## Import / Export

- **Exportar JSON**: ⋮ → exportar JSON
- **Importar**: ⋮ → importar arquivo ou arraste .json/.md
- **Exportar .md / PDF (nota)**: no editor → `.md` / `PDF`
- **Exportar todas**: rodapé da lista → `.md` / `PDF`

## Markdown

`# ## ###`, **negrito**, *itálico*, `código`, ```bloco```, `- lista`, `1. lista`, `[link](url)`, `> citação`, `---`, `~~riscado~~`.

## Design

Minimalista, tipografia confortável e paleta quente amarelada/avermelhada para leitura prolongada (papel `#fdf6ec`, texto `#1f1a14`). Contraste suave, foco no texto, sombras suaves e cantos arredondados. Mobile-first: lista confortável, editor ocupa a tela, botões com área de toque adequada. Desktop: lista lateral + editor centralizado (máx. 740px). Paginação discreta, transições suaves.

## Limitações

- Sem sincronização entre dispositivos
- Sem categorias/tags
- Limite ~5–10 MB por origem
- PDF via impressão do navegador

## Screenshots

<!-- ![Lista](docs/screenshot-list.png) -->
<!-- ![Editor](docs/screenshot-editor.png) -->
<!-- ![Mobile](docs/screenshot-mobile.png) -->

## Desenvolvimento

Princípios SOLID, KISS, YAGNI com bom senso — sem abstrações desnecessárias.

Fluxo ideal: abrir → nova epifania → escrever em markdown → prévia → salvo sozinho → encontrar pela busca.
