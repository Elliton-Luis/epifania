# Cuspir — Pensou? Cuspa.

Um caderno digital minimalista para despejar pensamentos sem fricção. Inspirado na experiência de notas do Cátedra, mas com identidade própria: **abrir, cuspir uma ideia, salvar e seguir a vida.**

> Não é um Notion. Não é um Obsidian. É só um lugar para cuspir.

## Proposta

O Cuspir prioriza **velocidade, simplicidade e organização suficiente**. Nada de dashboards, gamificação ou menus complexos. O foco é **escrever → salvar → encontrar**.

- Criação instantânea de notas
- Edição com autosave (debounce ~500ms)
- Busca instantânea por título e conteúdo
- Organização por atualização recente
- Leitura em markdown e prévia renderizada
- Funciona offline e é instalável como PWA
- Criptografia client-side opcional

## Funcionalidades

- [x] Criar, editar e excluir notas
- [x] Título + conteúdo com **suporte a markdown** (headings, negrito, itálico, listas, código, links, citações)
- [x] Abas **escrever / prévia** com renderização instantânea
- [x] Autosave com debounce 500ms (persiste mesmo ao recarregar)
- [x] Busca instantânea por título e conteúdo (sem reload)
- [x] Ordenação por atualização (recentes/antigas)
- [x] Timestamps de criação e última edição + contador de palavras
- [x] Exportar nota em **.md** e **PDF** (via impressão)
- [x] Exportar todas as notas em **.md** e **PDF**
- [x] **Importar** JSON (backup) e .md (arraste ou seletor)
- [x] **Exportar** backup JSON completo
- [x] **Apagar todos os dados** do app
- [x] **Criptografia client-side** AES-GCM 256 com PBKDF2 (senha nunca sai do dispositivo)
- [x] Tela de bloqueio, troca de senha e bloqueio manual
- [x] Persistência em `localStorage` (ou cifrado)
- [x] Layout mobile-first responsivo (lista ↔ editor)
- [x] PWA: manifest, service worker, cache offline, instalável
- [x] Atalhos: `Ctrl/Cmd + N` nova nota, `Esc` voltar (mobile)

## Tecnologias

- HTML
- CSS (vanilla, mobile-first)
- JavaScript vanilla
- `localStorage` para persistência
- Web Crypto API (AES-GCM + PBKDF2) para criptografia
- PWA: Web App Manifest + Service Worker

Sem frameworks, sem dependências externas.

## Como executar localmente

Opção 1 — abrir direto:

```bash
# clone e abra index.html no navegador
open index.html
```

Opção 2 — servidor estático (recomendado para PWA/service worker):

```bash
python3 -m http.server 8000
# depois abra http://localhost:8000

# ou npx
npx serve .
```

> Service workers exigem `http://localhost` ou HTTPS. Abrir via `file://` não ativa o PWA.

## Como instalar como PWA

1. Rode em um servidor local ou hospede como site estático (GitHub Pages, Netlify, Vercel, etc).
2. Abra no Chrome/Edge/Firefox/Safari.
3. Procure por **Instalar** na barra de endereço ou menu (⋮ → Instalar app / Adicionar à tela inicial).
4. O app abrirá em `display: standalone` e continuará funcionando offline.

## Estrutura do projeto

```
cuspir/
├── index.html
├── manifest.json
├── sw.js
├── css/
│   └── style.css
├── js/
│   ├── storage.js   # camada fina sobre localStorage
│   ├── markdown.js  # parser markdown vanilla
│   ├── crypto.js    # AES-GCM + PBKDF2 client-side
│   └── app.js       # CRUD, busca, debounce, render, export, crypto UI
└── assets/
    └── icons/
        ├── icon.svg
        ├── icon-192.png
        └── icon-512.png
```

## Onde os dados são armazenados

- Sem criptografia: chave `cuspir:notes` → `JSON.stringify(Note[])`
- Com criptografia: chave `cuspir:enc:v1` → `{ salt, iv, ct, v }` (base64) cifrado com senha; `cuspir:enc:meta` guarda metadado
- Cada nota: `{ id, title, content, createdAt, updatedAt }`
- `id` via `crypto.randomUUID()` com fallback
- Sem backend — tudo no dispositivo. Limpar dados do site apaga as notas (ou use o botão “apagar tudo” no menu)

Estrutura interna:

```
localStorage
├── cuspir:notes        # quando sem criptografia
└── cuspir:enc:v1       # quando com criptografia (AES-GCM)
    └── cuspir:enc:meta
```

## Criptografia

- Algoritmo: AES-GCM 256, chave derivada via PBKDF2-SHA256 (120k iterações, salt 16 bytes, iv 12 bytes)
- 100% client-side, sem envio a servidor
- Senha mantida apenas em memória enquanto desbloqueado; ao bloquear/fechar, precisa digitar de novo
- Se esquecer a senha, **não há recuperação**: única saída é apagar tudo (botão na tela de bloqueio)
- Ative em ⋮ → criptografia; desative informando a senha atual; troque a senha pelo mesmo fluxo

## Import / Export

- **Exportar JSON**: ⋮ → exportar JSON (backup completo com `version` e `exportedAt`)
- **Importar**: ⋮ → importar arquivo ou arraste .json/.md sobre a janela; JSON mescla com existentes (ids duplicados geram novos)
- **Exportar .md (nota)**: no editor → botão “.md”
- **Exportar PDF (nota)**: no editor → botão “PDF” (abre janela de impressão)
- **Exportar todas .md / PDF**: na sidebar, rodapé da lista

## Markdown suportado

Headings `# ## ###`, **negrito**, *itálico*, `inline code`, ```blocos```, listas `-`/`*`/`1.`, links `[texto](url)`, autolinks, `> citação`, `---` hr, ~~riscado~~.

## Limitações

- Sem sincronização entre dispositivos.
- Sem categorias/tags (pode ser adicionado sem sacrificar velocidade).
- Limite de ~5–10 MB por origem (depende do navegador).
- PDF é gerado via janela de impressão do navegador (sem libs externas).

## Screenshots

<!-- Adicione aqui quando disponíveis -->
<!-- ![Lista de notas](docs/screenshot-list.png) -->
<!-- ![Editor](docs/screenshot-editor.png) -->
<!-- ![Mobile](docs/screenshot-mobile.png) -->

## Desenvolvimento

Princípios: **SOLID, KISS, YAGNI** com bom senso — sem abstrações desnecessárias.

Fluxo ideal: abrir → nova nota → escrever em markdown → autosave → prévia → exportar ou encontrar via busca.
