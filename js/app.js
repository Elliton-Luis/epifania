// app.js — Epifania com markdown, export, import, criptografia
(() => {
  const $ = (s) => document.querySelector(s);
  const els = {
    search: $("#search-input"),
    notesList: $("#notes-list"),
    notesCount: $("#notes-count"),
    emptyList: $("#empty-list"),
    emptyEditor: $("#empty-editor"),
    editor: $("#editor"),
    editorArea: $("#editor-area"),
    titleInput: $("#note-title"),
    contentInput: $("#note-content"),
    mdPreview: $("#md-preview"),
    tabWrite: $("#tab-write"),
    tabPreview: $("#tab-preview"),
    dates: $("#note-dates"),
    stats: $("#note-stats"),
    saveStatus: $("#save-status"),
    btnNew: $("#btn-new"),
    btnNewEmpty: $("#btn-new-empty"),
    btnBack: $("#btn-back"),
    btnDelete: $("#btn-delete"),
    btnCopy: $("#btn-copy"),
    btnSort: $("#btn-sort"),
    btnExportOpen: $("#btn-export-open"),
    btnExportOne: $("#btn-export-one"),
    dialogExport: $("#export-dialog"),
    btnCancelExport: $("#btn-cancel-export"),
    btnConfirmExport: $("#btn-confirm-export"),
    exportPicker: $("#export-picker"),
    exportSearch: $("#export-search"),
    exportList: $("#export-list"),
    exportCountAll: $("#export-count-all"),
    exportHint: $("#export-hint"),
    btnMenu: $("#btn-menu"),
    menuDropdown: $("#menu-dropdown"),
    toast: $("#toast"),
    dialogDelete: $("#delete-dialog"),
    btnCancelDelete: $("#btn-cancel-delete"),
    btnConfirmDelete: $("#btn-confirm-delete"),
    dialogClear: $("#clear-dialog"),
    btnCancelClear: $("#btn-cancel-clear"),
    btnConfirmClear: $("#btn-confirm-clear"),
    dialogCrypto: $("#crypto-dialog"),
    cryptoStatus: $("#crypto-status"),
    cryptoForm: $("#crypto-form"),
    cryptoPass: $("#crypto-pass"),
    cryptoPass2: $("#crypto-pass2"),
    cryptoError: $("#crypto-error"),
    btnCancelCrypto: $("#btn-cancel-crypto"),
    btnDisableCrypto: $("#btn-disable-crypto"),
    btnEnableCrypto: $("#btn-enable-crypto"),
    lockScreen: $("#lock-screen"),
    unlockForm: $("#unlock-form"),
    unlockInput: $("#unlock-input"),
    unlockError: $("#unlock-error"),
    btnForgetCrypto: $("#btn-forget-crypto"),
    cryptoBadge: $("#crypto-badge"),
    importFile: $("#import-file"),
    menuLock: $("#menu-lock"),
    pagination: $("#pagination"),
    pageInfo: $("#page-info"),
    dialogHelp: $("#help-dialog"),
    btnCloseHelp: $("#btn-close-help"),
    updateToast: $("#update-toast"),
    btnUpdateApp: $("#btn-update-app"),
  };

  let notes = [];
  let activeId = null;
  let searchQuery = "";
  let sortAsc = false;
  let saveTimer = null;
  let pendingDeleteId = null;
  let unlockedPassword = null; // kept in memory only
  let mdMode = "write"; // write | preview
  let currentPage = 1;
  const PAGE_SIZE = 8;

  // -- helpers
  function nowISO() { return new Date().toISOString(); }
  function formatDate(iso) {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff/60000);
    if (mins < 1) return "agora";
    if (mins < 60) return `há ${mins} min`;
    const hours = Math.floor(mins/60);
    if (hours < 24) return `há ${hours}h`;
    if (hours < 48) return "ontem";
    const days = Math.floor(hours/24);
    if (days < 7) return `há ${days}d`;
    return d.toLocaleDateString("pt-BR", { day:"2-digit", month:"short", year: d.getFullYear()!==new Date().getFullYear()?"numeric":undefined });
  }
  function formatFullDate(iso){ return new Date(iso).toLocaleString("pt-BR",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}); }
  function escapeHtml(s){ return EpifaniaValidate.escapeHtml(s); } // escape central (cobre & < > " ')
  function setSaveStatus(t,c=""){ els.saveStatus.textContent=t; els.saveStatus.className="save-status "+c; }
  function showToast(msg){
    els.toast.textContent=msg; els.toast.classList.remove("hidden");
    clearTimeout(els.toast._t); els.toast._t=setTimeout(()=>els.toast.classList.add("hidden"),2300);
  }
  function slugify(s){
    return (s||"sem-titulo").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60) || "nota";
  }
  function downloadFile(filename, content, mime="text/plain"){
    const blob = new Blob([content], {type:mime});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  // -- copiar nota inteira (título + conteúdo) para o clipboard
  // Funciona em PC + celular: tenta Clipboard API (moderno/seguro) e cai para
  // fallback textarea + execCommand (HTTP, WebView, iOS antigo). Sempre indica
  // o resultado e só diz "copiado" após confirmação real de sucesso.
  function buildNoteText(title, content){
    const t = (title || "").replace(/\s+$/,"");
    const c = (content || "").replace(/\s+$/,"");
    if (t && c) return `${t}\n\n${c}`;
    return t || c || "";
  }
  function legacyCopy(text){
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.setAttribute("aria-hidden", "true");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.width = "2px";
    ta.style.height = "2px";
    ta.style.padding = "0";
    ta.style.border = "none";
    ta.style.outline = "none";
    ta.style.boxShadow = "none";
    ta.style.background = "transparent";
    ta.style.opacity = "0";
    ta.style.fontSize = "16px"; // evita zoom no iOS
    document.body.appendChild(ta);
    // iOS exige elemento focável + seleção explícita dentro do gesto do usuário
    ta.focus({ preventScroll: true });
    ta.select();
    try { ta.setSelectionRange(0, ta.value.length); } catch {}
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    if (!ok) {
      // segunda chance: copia via Range/Selection (Safari antigo)
      try {
        const range = document.createRange();
        range.selectNodeContents(ta);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        try { ta.setSelectionRange(0, ta.value.length); } catch {}
        ok = document.execCommand("copy");
        sel.removeAllRanges();
      } catch { ok = false; }
    }
    ta.remove();
    // execCommand retorna true somente se o SO aceitou a cópia
    return ok === true;
  }
  async function copyTextRobust(text){
    if (!text) return { ok: false, reason: "empty" };
    // 1) Clipboard API moderna (PC + mobile em contexto seguro)
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
        // verificação: tenta ler de volta; se leitura for bloqueada por
        // permissão, mantém sucesso (o write já resolveu = SO aceitou).
        try {
          if (typeof navigator.clipboard.readText === "function") {
            const back = await navigator.clipboard.readText();
            if (back === text) return { ok: true, verified: true, method: "clipboard-api" };
            // leu algo diferente: trata como falha para tentar fallback
            throw new Error("verify-mismatch");
          }
        } catch (readErr) {
          if (readErr && readErr.message === "verify-mismatch") throw readErr;
          return { ok: true, verified: false, method: "clipboard-api" };
        }
        return { ok: true, verified: false, method: "clipboard-api" };
      }
    } catch {
      // cai para o fallback legado
    }
    // 2) Fallback legado (HTTP, WebView, iOS antigo)
    try {
      const ok = legacyCopy(text);
      if (ok) {
        // melhor esforço: tenta confirmar lendo de volta quando permitido
        try {
          if (navigator.clipboard && typeof navigator.clipboard.readText === "function") {
            const back = await navigator.clipboard.readText();
            if (back === text) return { ok: true, verified: true, method: "execCommand-verified" };
          }
        } catch {}
        return { ok: true, verified: false, method: "execCommand" };
      }
    } catch {}
    return { ok: false, reason: "unsupported" };
  }
  function flashCopyButton(btn, ok){
    if (!btn) return;
    const original = btn.dataset.label || btn.textContent;
    if (!btn.dataset.label) btn.dataset.label = original;
    btn.classList.toggle("copy-ok", ok);
    btn.classList.toggle("copy-fail", !ok);
    btn.textContent = ok ? "✓ copiado!" : "✕ falhou";
    clearTimeout(btn._copyT);
    btn._copyT = setTimeout(()=>{
      btn.textContent = btn.dataset.label;
      btn.classList.remove("copy-ok", "copy-fail");
    }, 1800);
  }
  async function copyNoteById(id, btn){
    const note = notes.find((n)=>n.id===id);
    if (!note) { showToast("nota não encontrada"); return; }
    // se a nota ativa está no editor (pode ter digitação ainda no debounce),
    // copia o que está na tela — mais fiel ao "tudo" que o usuário vê.
    let title = note.title, content = note.content;
    if (id === activeId && els.editor && !els.editor.classList.contains("hidden")) {
      title = els.titleInput.value;
      content = els.contentInput.value;
    }
    const text = buildNoteText(title, content);
    if (!text) { showToast("nada para copiar — nota vazia"); if (btn) flashCopyButton(btn, false); return; }
    if (btn) { btn.disabled = true; btn.textContent = "copiando…"; }
    const res = await copyTextRobust(text);
    if (btn) btn.disabled = false;
    if (res.ok) {
      flashCopyButton(btn, true);
      showToast(res.verified ? "copiado ✓ (verificado)" : "copiado ✓");
    } else {
      flashCopyButton(btn, false);
      showToast(res.reason === "empty" ? "nada para copiar — nota vazia" : "não foi possível copiar neste navegador");
    }
  }
  function copyActiveNote(btn){
    if (!activeId) { showToast("abra uma nota para copiar"); return; }
    return copyNoteById(activeId, btn || els.btnCopy);
  }

  // -- crypto/persist
  function isEncrypted(){ return CuspirCrypto.isEncrypted(); }
  function isLocked(){ return isEncrypted() && !unlockedPassword; }

  async function persist() {
    if (isEncrypted()) {
      if (!unlockedPassword) return; // shouldn't happen
      setSaveStatus("salvando…","saving");
      try{
        await CuspirCrypto.persistEncrypted(notes, unlockedPassword);
        setSaveStatus("salvo","saved");
      } catch(e){ setSaveStatus("erro",""); showToast("erro ao salvar criptografado"); }
    } else {
      Storage.save(notes);
      setSaveStatus("salvo","saved");
    }
  }

  function debounceSave(fn, delay=500){
    return (...args)=>{
      setSaveStatus("salvando…","saving");
      clearTimeout(saveTimer);
      saveTimer=setTimeout(()=>fn(...args), delay);
    };
  }

  async function initialLoad(){
    try { Storage.migrateIfNeeded(); } catch {}
    if (isEncrypted()){
      els.lockScreen.classList.remove("hidden");
      document.getElementById("app").style.display="none";
      els.cryptoBadge.classList.remove("hidden");
      els.menuLock.textContent="🔐 bloqueado";
      return;
    }
    notes = Storage.loadPlain();
    updateCryptoUI();
    renderList();
    if (window.innerWidth>=860 && notes.length>0){
      const f=getFilteredNotes(); if(f[0]) openEditor(f[0].id);
    }
  }

  async function unlock(password){
    try{
      const loaded = await CuspirCrypto.loadEncrypted(password);
      if (!Array.isArray(loaded)) throw new Error("dados inválidos");
      notes = loaded;
      unlockedPassword = password;
      els.lockScreen.classList.add("hidden");
      document.getElementById("app").style.display="";
      els.cryptoBadge.classList.remove("hidden");
      renderList();
      showToast("desbloqueado");
      if (window.innerWidth>=860 && notes.length>0){
        const f=getFilteredNotes(); if(f[0]) openEditor(f[0].id);
      }
      updateCryptoUI();
      return true;
    } catch(e){
      throw e;
    }
  }

  function lock(){
    if (!isEncrypted()) { showToast("criptografia não ativa"); return; }
    unlockedPassword=null;
    notes=[];
    activeId=null;
    closeEditor();
    els.lockScreen.classList.remove("hidden");
    document.getElementById("app").style.display="none";
    els.unlockInput.value="";
    els.unlockError.classList.add("hidden");
    showToast("bloqueado");
  }

  function updateCryptoUI(){
    const enc = isEncrypted();
    if (enc) {
      els.cryptoBadge.classList.remove("hidden");
      els.cryptoStatus.className="crypto-status on";
      els.cryptoStatus.textContent="✓ criptografia ativa — seus dados estão cifrados em repouso";
      els.btnDisableCrypto.classList.remove("hidden");
      els.btnEnableCrypto.textContent="trocar senha";
      els.menuLock.classList.remove("hidden");
    } else {
      els.cryptoBadge.classList.add("hidden");
      els.cryptoStatus.className="crypto-status off";
      els.cryptoStatus.textContent="✗ criptografia desativada — notas salvas em texto plano";
      els.btnDisableCrypto.classList.add("hidden");
      els.btnEnableCrypto.textContent="ativar criptografia";
      els.menuLock.classList.add("hidden");
    }
  }

  // -- CRUD
  async function createNote(){
    if (isLocked()) return;
    const note={ id:Storage.generateId(), title:"", content:"", createdAt:nowISO(), updatedAt:nowISO() };
    notes.unshift(note);
    await persist();
    activeId=note.id; searchQuery=""; els.search.value=""; currentPage=1;
    renderList(); openEditor(note.id);
    requestAnimationFrame(()=>els.titleInput.focus());
    showToast("nota criada");
  }
  async function updateActiveNote(patch){
    const note=notes.find(n=>n.id===activeId); if(!note) return;
    Object.assign(note, patch, {updatedAt:nowISO()});
    if(!sortAsc){
      const idx=notes.indexOf(note);
      if(idx>0){ notes.splice(idx,1); notes.unshift(note); }
    }
    await persist();
    renderList(); updateEditorMeta(note);
    if(mdMode==="preview") renderPreview();
  }
  const debouncedUpdate=debounceSave((patch)=>{ updateActiveNote(patch); },500);

  async function deleteNote(id){
    notes=notes.filter(n=>n.id!==id);
    await persist();
    if(activeId===id){ activeId=null; closeEditor(); }
    renderList(); showToast("nota excluída");
  }

  // -- render
  function getFilteredNotes(){
    let result=notes;
    if(searchQuery){
      const q=searchQuery.toLowerCase();
      result=result.filter(n=> n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
    }
    result=[...result].sort((a,b)=>{
      const diff=new Date(b.updatedAt)-new Date(a.updatedAt);
      return sortAsc ? -diff : diff;
    });
    return result;
  }
  function renderList(){
    const filtered=getFilteredNotes();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageNotes = filtered.slice(start, start + PAGE_SIZE);

    els.notesCount.textContent=`${filtered.length} ${filtered.length===1?"nota":"notas"}${searchQuery?" • filtradas":""}`;
    els.btnSort.textContent= sortAsc ? "antigas ↓" : "recentes ↓";
    // Limpeza segura: remove nós (sem innerHTML="").
    while (els.notesList.firstChild) els.notesList.removeChild(els.notesList.firstChild);
    if(notes.length===0){
      els.emptyList.classList.remove("hidden");
      els.pagination.classList.add("hidden"); els.pageInfo.classList.add("hidden");
      return;
    }
    els.emptyList.classList.add("hidden");
    if(filtered.length===0){
      // Construído via DOM: a query do usuário entra como texto, nunca como HTML.
      const div=document.createElement("div");
      div.className="no-results";
      div.textContent=`nenhuma nota para “${searchQuery}”`;
      els.notesList.appendChild(div);
      els.pagination.classList.add("hidden"); els.pageInfo.classList.add("hidden");
      return;
    }
    // Itens construídos via DOM API: id vai para dataset (não interpretado como HTML),
    // título/prévia/data entram via textContent. Nenhum dado toca innerHTML aqui.
    const frag=document.createDocumentFragment();
    for (const note of pageNotes) {
      const isActive=note.id===activeId;
      const title=(typeof note.title==="string" ? note.title : "").trim() || "sem título";
      const preview=(typeof note.content==="string" ? note.content : "").trim().slice(0,120).replace(/\n/g," ") || "vazia…";
      const date=formatDate(note.updatedAt);
      const id=String(note.id);
      const article=document.createElement("article");
      article.className="note-item"+(isActive?" active":"");
      article.dataset.id=id;
      article.tabIndex=0;
      article.setAttribute("role","button");
      article.setAttribute("aria-label",`Abrir nota ${title}`);
      const top=document.createElement("div");
      top.className="note-item-top";
      const h2=document.createElement("h2");
      h2.className="note-item-title";
      h2.textContent=title;
      const time=document.createElement("time");
      time.className="note-item-date";
      time.textContent=date;
      top.appendChild(h2); top.appendChild(time);
      const prev=document.createElement("p");
      prev.className="note-item-preview";
      prev.textContent=preview;
      article.appendChild(top); article.appendChild(prev);
      const foot=document.createElement("div");
      foot.className="note-item-foot";
      const copyBtn=document.createElement("button");
      copyBtn.type="button";
      copyBtn.className="note-copy-btn";
      copyBtn.textContent="⧉ copiar";
      copyBtn.setAttribute("aria-label",`Copiar nota ${title} para a área de transferência`);
      copyBtn.setAttribute("title","Copiar nota inteira (título + conteúdo)");
      copyBtn.addEventListener("click",(ev)=>{
        ev.stopPropagation();
        copyNoteById(id, copyBtn);
      });
      copyBtn.addEventListener("keydown",(ev)=>{
        if(ev.key==="Enter"||ev.key===" "){ ev.stopPropagation(); }
      });
      foot.appendChild(copyBtn);
      article.appendChild(foot);
      article.addEventListener("click",()=>openEditor(id));
      article.addEventListener("keydown",(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); openEditor(id);} });
      frag.appendChild(article);
    }
    els.notesList.appendChild(frag);
    renderPagination(filtered.length, totalPages);
  }

  function renderPagination(total, totalPages){
    if (total <= PAGE_SIZE) {
      els.pagination.classList.add("hidden");
      els.pageInfo.classList.add("hidden");
      return;
    }
    els.pagination.classList.remove("hidden");
    els.pageInfo.classList.remove("hidden");
    els.pageInfo.textContent = `página ${currentPage} de ${totalPages} • ${total} notas`;

    let html = "";
    // prev
    html += `<button class="page-btn" data-page="${currentPage-1}" ${currentPage===1?"disabled":""} aria-label="Anterior">‹</button>`;

    // page numbers with ellipsis
    const pages = [];
    for (let i=1; i<=totalPages; i++) {
      if (i===1 || i===totalPages || (i>=currentPage-1 && i<=currentPage+1)) pages.push(i);
      else if (pages[pages.length-1] !== "…") pages.push("…");
    }
    pages.forEach(p=>{
      if (p==="…") html += `<span class="page-ellipsis">…</span>`;
      else html += `<button class="page-btn ${p===currentPage?"active":""}" data-page="${p}">${p}</button>`;
    });

    html += `<button class="page-btn" data-page="${currentPage+1}" ${currentPage===totalPages?"disabled":""} aria-label="Próxima">›</button>`;
    els.pagination.innerHTML = html;
    els.pagination.querySelectorAll(".page-btn[data-page]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const p = parseInt(btn.dataset.page,10);
        if (!isNaN(p) && p>=1 && p<=totalPages) { currentPage = p; renderList(); window.scrollTo({top:0, behavior:"smooth"}); }
      });
    });
  }
  function updateEditorMeta(note){
    els.dates.textContent=`criada ${formatFullDate(note.createdAt)} • editada ${formatFullDate(note.updatedAt)}`;
    const words=note.content.trim()?note.content.trim().split(/\s+/).length:0;
    els.stats.textContent=`${words} palavras • ${note.content.length} caracteres`;
  }
  function renderPreview(){
    const content=els.contentInput.value;
    els.mdPreview.innerHTML=Markdown.toHtml(content);
  }
  function setMdMode(mode){
    mdMode=mode;
    els.tabWrite.classList.toggle("active", mode==="write");
    els.tabPreview.classList.toggle("active", mode==="preview");
    if(mode==="write"){
      els.contentInput.classList.remove("hidden");
      els.mdPreview.classList.add("hidden");
      els.contentInput.focus();
    } else {
      els.contentInput.classList.add("hidden");
      els.mdPreview.classList.remove("hidden");
      renderPreview();
    }
  }
  function openEditor(id){
    const note=notes.find(n=>n.id===id); if(!note) return;
    activeId=id;
    els.titleInput.value=note.title;
    els.contentInput.value=note.content;
    updateEditorMeta(note);
    els.emptyEditor.classList.add("hidden");
    els.editor.classList.remove("hidden");
    setSaveStatus("salvo","saved");
    setMdMode("write");
    renderList();
    document.body.classList.add("editing");
    if(note.title) els.contentInput.focus(); else els.titleInput.focus();
  }
  function closeEditor(){
    if(saveTimer){ clearTimeout(saveTimer); saveTimer=null; }
    els.editor.classList.add("hidden");
    els.emptyEditor.classList.remove("hidden");
    document.body.classList.remove("editing");
    activeId=null; renderList();
  }

  // -- exportação unificada (1 diálogo: quais notas + formato)
  function noteToMd(n){
    return `# ${n.title || "sem título"}\n\n${n.content}\n\n---\n_criada: ${formatFullDate(n.createdAt)}_\n_editada: ${formatFullDate(n.updatedAt)}_\n`;
  }
  function getExportScope(){
    const el = document.querySelector('input[name="export-scope"]:checked');
    return el ? el.value : "current";
  }
  function getExportFormat(){
    const el = document.querySelector('input[name="export-format"]:checked');
    return el ? el.value : "md";
  }
  function getExportSelection(){
    const scope = getExportScope();
    if (scope === "current") {
      const n = notes.find((x) => x.id === activeId);
      return n ? [n] : [];
    }
    if (scope === "all") return [...notes];
    // selected: lê checkboxes
    const checked = els.exportList
      ? [...els.exportList.querySelectorAll('input[type="checkbox"]:checked')].map((c) => c.value)
      : [];
    return notes.filter((n) => checked.includes(n.id));
  }
  function updateExportHint(){
    if (!els.exportHint) return;
    const sel = getExportSelection();
    const fmt = getExportFormat();
    if (!sel.length) { els.exportHint.textContent = "selecione ao menos 1 nota."; return; }
    const label = sel.length === 1 ? "1 nota" : `${sel.length} notas`;
    els.exportHint.textContent = fmt === "pdf"
      ? `${label} → PDF via impressão`
      : fmt === "json"
        ? `${label} → backup .json`
        : `${label} → ${sel.length === 1 ? "1 arquivo .md" : "1 arquivo .md combinado"}`;
  }
  function renderExportPicker(filter=""){
    if (!els.exportList) return;
    while (els.exportList.firstChild) els.exportList.removeChild(els.exportList.firstChild);
    const q = (filter || "").toLowerCase();
    const frag = document.createDocumentFragment();
    for (const n of notes) {
      const title = (n.title || "").trim() || "sem título";
      if (q && !(title.toLowerCase().includes(q) || (n.content || "").toLowerCase().includes(q))) continue;
      const label = document.createElement("label");
      label.className = "export-check";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = n.id;
      cb.checked = true;
      cb.addEventListener("change", updateExportHint);
      const span = document.createElement("span");
      span.textContent = `${title} · ${formatDate(n.updatedAt)}`;
      label.appendChild(cb);
      label.appendChild(span);
      frag.appendChild(label);
    }
    els.exportList.appendChild(frag);
    if (!els.exportList.firstChild) {
      const p = document.createElement("p");
      p.className = "export-empty";
      p.textContent = "nada encontrado";
      els.exportList.appendChild(p);
    }
  }
  function openExportDialog(scope){
    if (!notes.length) { showToast("nada para exportar"); return; }
    if (els.exportCountAll) els.exportCountAll.textContent = String(notes.length);
    const want = scope || (activeId ? "current" : "all");
    const radio = document.querySelector(`input[name="export-scope"][value="${want}"]`);
    if (radio) radio.checked = true;
    else {
      const all = document.querySelector('input[name="export-scope"][value="all"]');
      if (all) all.checked = true;
    }
    // se pediu "current" mas não há nota ativa, cai para "all"
    if (getExportScope() === "current" && !notes.find((n) => n.id === activeId)) {
      const all = document.querySelector('input[name="export-scope"][value="all"]');
      if (all) all.checked = true;
    }
    renderExportPicker(els.exportSearch ? els.exportSearch.value : "");
    syncExportPickerVisibility();
    updateExportHint();
    if (els.dialogExport && typeof els.dialogExport.showModal === "function") els.dialogExport.showModal();
  }
  function syncExportPickerVisibility(){
    if (!els.exportPicker) return;
    els.exportPicker.classList.toggle("hidden", getExportScope() !== "selected");
  }
  function doUnifiedExport(){
    const sel = getExportSelection();
    if (!sel.length) { showToast("selecione ao menos 1 nota"); return; }
    const fmt = getExportFormat();
    const stamp = new Date().toISOString().slice(0, 10);
    if (fmt === "json") {
      downloadFile(`epifania-backup-${stamp}.json`, Storage.exportJson(sel), "application/json");
      showToast(sel.length === 1 ? "nota exportada em .json" : `${sel.length} notas em .json`);
    } else if (fmt === "md") {
      if (sel.length === 1) {
        downloadFile(`${slugify(sel[0].title)}.md`, noteToMd(sel[0]), "text/markdown");
      } else {
        downloadFile(`epifania-${stamp}.md`, sel.map(noteToMd).join("\n\n"), "text/markdown");
      }
      showToast(sel.length === 1 ? "markdown exportado" : `${sel.length} notas em .md`);
    } else if (fmt === "pdf") {
      printNotesPdf(sel);
    }
    if (els.dialogExport && els.dialogExport.open) els.dialogExport.close();
  }
  function printNotesPdf(list){
    const win = window.open("", "_blank");
    if (!win) { showToast("popup bloqueado — permita popups"); return; }
    const single = list.length === 1;
    const body = list.map((n) => {
      const title = escapeHtml(n.title || "sem título");
      const md = Markdown.toHtml(n.content);
      return `<article style="margin-bottom:40px; padding-bottom:30px; border-bottom:1px solid #e7e5e4"><h1>${title}</h1><div style="font-size:12px;color:#a8a29e;margin-bottom:12px">criada ${formatFullDate(n.createdAt)} • editada ${formatFullDate(n.updatedAt)}</div><div>${md}</div></article>`;
    }).join("");
    win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${single ? escapeHtml(list[0].title || "nota") : "Epifania — notas"}</title><style>
      body{font-family:ui-sans-system,-apple-system,BlinkMacSystemFont,Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif; max-width:740px; margin:40px auto; padding:0 20px; color:#1c1917; line-height:1.6}
      h1{font-size:22px} pre{background:#0a0a0a;color:#fafaf9;padding:14px;border-radius:10px;overflow:auto} code{font-family:ui-monospace,monospace;background:#f5f5f4;padding:2px 6px;border-radius:6px} pre code{background:transparent;color:inherit} blockquote{border-left:3px solid #d6d3d1;margin:12px 0;padding:6px 14px;background:#f5f5f4}
      @media print{body{margin:20px}}
    </style></head><body>${single ? "" : `<h1 style="text-align:center">epifania</h1><p style="text-align:center;color:#a8a29e;font-size:12px">${list.length} notas • ${new Date().toLocaleDateString("pt-BR")}</p>`}${body}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  }

  // -- import
  function handleImportFile(file){
    if(!file) return;
    const reader=new FileReader();
    reader.onload= async (e)=>{
      const text=e.target.result;
      try{
        if(file.name.endsWith(".json")){
          // Validação estrita: parse + estrutura + tipos + normalização.
          // IDs externos NUNCA são preservados — cada nota importada recebe
          // um id interno novo (conteúdo de fora, identidade do sistema).
          const { notes: importedNotes, rejectedCount } = EpifaniaValidate.parseBackupFile(text, () => Storage.generateId());
          for (let i = importedNotes.length - 1; i >= 0; i--) notes.unshift(importedNotes[i]);
          await persist(); renderList();
          showToast(rejectedCount ? `${importedNotes.length} notas importadas (${rejectedCount} rejeitadas)` : `${importedNotes.length} notas importadas`);
        } else if(file.name.endsWith(".md")){
          // treat whole file as one note
          const lines=text.split("\n");
          let title="";
          let content=text;
          if(lines[0].startsWith("# ")){ title=lines[0].slice(2).trim(); content=lines.slice(1).join("\n").trim(); }
          else title=file.name.replace(/\.md$/,"");
          const note={ id:Storage.generateId(), title, content, createdAt:nowISO(), updatedAt:nowISO() };
          notes.unshift(note); await persist(); renderList(); openEditor(note.id); showToast("markdown importado");
        }
      } catch(err){
        showToast("erro ao importar: "+err.message);
      }
    };
    reader.readAsText(file);
  }

  // -- events
  els.btnNew.addEventListener("click", createNote);
  els.btnNewEmpty.addEventListener("click", createNote);
  els.btnBack.addEventListener("click", closeEditor);
  if (els.btnCopy) els.btnCopy.addEventListener("click", ()=> copyActiveNote(els.btnCopy));
  els.btnDelete.addEventListener("click", ()=>{
    if(!activeId) return; pendingDeleteId=activeId;
    if(typeof els.dialogDelete.showModal==="function") els.dialogDelete.showModal();
    else if(confirm("excluir nota?")) deleteNote(pendingDeleteId);
  });
  els.btnCancelDelete.addEventListener("click",()=>els.dialogDelete.close());
  els.btnConfirmDelete.addEventListener("click",()=>{ els.dialogDelete.close(); if(pendingDeleteId) deleteNote(pendingDeleteId); pendingDeleteId=null; });
  els.dialogDelete.addEventListener("close",()=> pendingDeleteId=null);

  // clear all
  function openClearDialog(){
    if(typeof els.dialogClear.showModal==="function") els.dialogClear.showModal();
    else if(confirm("apagar tudo?")) doClearAll();
  }
  async function doClearAll(){
    notes=[]; activeId=null; closeEditor();
    Storage.clearAll();
    CuspirCrypto.clearEncrypted();
    unlockedPassword=null;
    // also need to hide lock screen
    els.lockScreen.classList.add("hidden");
    document.getElementById("app").style.display="";
    updateCryptoUI();
    renderList();
    showToast("tudo apagado");
  }
  els.btnCancelClear.addEventListener("click",()=>els.dialogClear.close());
  els.btnConfirmClear.addEventListener("click",()=>{ els.dialogClear.close(); doClearAll(); });

  // help
  function openHelp(panel){
    if (!els.dialogHelp) return;
    const target = panel || "about";
    els.dialogHelp.querySelectorAll(".help-tab").forEach(t=>{
      const a = t.dataset.panel===target;
      t.classList.toggle("active", a);
      t.setAttribute("aria-selected", a ? "true" : "false");
    });
    els.dialogHelp.querySelectorAll(".help-panel").forEach(p=>{
      p.classList.toggle("hidden", p.id !== `help-panel-${target}`);
    });
    if (typeof els.dialogHelp.showModal==="function") els.dialogHelp.showModal();
  }
  function closeHelp(){ if (els.dialogHelp && els.dialogHelp.open) els.dialogHelp.close(); }
  if (els.btnCloseHelp) els.btnCloseHelp.addEventListener("click", closeHelp);
  if (els.dialogHelp) {
    els.dialogHelp.querySelectorAll(".help-tab").forEach(tab=>{
      tab.addEventListener("click", ()=> openHelp(tab.dataset.panel));
    });
    els.dialogHelp.addEventListener("click", (e)=>{
      const rect = els.dialogHelp.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) closeHelp();
    });
  }

  // menu
  els.btnMenu.addEventListener("click",(e)=>{
    e.stopPropagation();
    els.menuDropdown.classList.toggle("hidden");
  });
  document.addEventListener("click",(e)=>{
    if(!els.menuDropdown.classList.contains("hidden") && !els.menuDropdown.contains(e.target) && e.target!==els.btnMenu) els.menuDropdown.classList.add("hidden");
  });
  els.menuDropdown.addEventListener("click",(e)=>{
    const action=e.target.closest && e.target.closest("[data-action]") ? e.target.closest("[data-action]").dataset.action : e.target.dataset.action;
    if(!action) return;
    els.menuDropdown.classList.add("hidden");
    if(action==="help") openHelp("about");
    else if(action==="export") openExportDialog();
    else if(action==="import") els.importFile.click();
    else if(action==="clear-all") openClearDialog();
    else if(action==="crypto") { updateCryptoUI(); els.dialogCrypto.showModal(); }
    else if(action==="lock") lock();
  });

  // crypto dialog
  els.btnCancelCrypto.addEventListener("click",()=> els.dialogCrypto.close());
  els.dialogCrypto.addEventListener("close",()=>{
    els.cryptoError.classList.add("hidden"); els.cryptoPass.value=""; els.cryptoPass2.value="";
  });
  els.cryptoForm.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const p=els.cryptoPass.value;
    const p2=els.cryptoPass2.value;
    els.cryptoError.classList.add("hidden");
    if(p.length<6){ els.cryptoError.textContent="senha muito curta — mínimo 6 caracteres"; els.cryptoError.classList.remove("hidden"); return; }
    if(p!==p2){ els.cryptoError.textContent="senhas não coincidem"; els.cryptoError.classList.remove("hidden"); return; }
    const btn=els.btnEnableCrypto;
    btn.disabled=true; btn.textContent="processando…";
    try{
      if(isEncrypted()){
        // change password: re-encrypt with new
        await CuspirCrypto.persistEncrypted(notes, p);
        unlockedPassword=p;
        showToast("senha alterada");
      } else {
        await CuspirCrypto.enableEncryption(notes, p);
        unlockedPassword=p;
        showToast("criptografia ativada");
      }
      updateCryptoUI();
      els.dialogCrypto.close();
    } catch(err){
      els.cryptoError.textContent=err.message; els.cryptoError.classList.remove("hidden");
    } finally{ btn.disabled=false; btn.textContent=isEncrypted()?"trocar senha":"ativar criptografia"; }
  });
  els.btnDisableCrypto.addEventListener("click", async ()=>{
    const p=els.cryptoPass.value;
    if(!p){ els.cryptoError.textContent="digite a senha atual para desativar"; els.cryptoError.classList.remove("hidden"); return; }
    try{
      // verify by trying to decrypt? we have unlockedPassword, just check p == unlockedPassword or try decrypt
      // For safety, try to decrypt current blob with p
      const blobRaw=localStorage.getItem(CuspirCrypto.ENC_KEY);
      if(blobRaw){
        const blob=JSON.parse(blobRaw);
        await CuspirCrypto.decrypt(blob, p);
      } else if(p!==unlockedPassword) throw new Error("senha incorreta");
      // proceed disable: save plain with current notes
      await CuspirCrypto.disableEncryption(notes, p);
      // after disable, Storage.savePlain already done inside, but ensure
      Storage.savePlain(notes);
      unlockedPassword=null;
      updateCryptoUI();
      els.dialogCrypto.close();
      showToast("criptografia desativada");
    } catch(err){
      els.cryptoError.textContent=err.message; els.cryptoError.classList.remove("hidden");
    }
  });

  // lock screen
  els.unlockForm.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const pw=els.unlockInput.value;
    els.unlockError.classList.add("hidden");
    try{
      await unlock(pw);
    } catch{
      els.unlockError.textContent="senha incorreta";
      els.unlockError.classList.remove("hidden");
    }
  });
  els.btnForgetCrypto.addEventListener("click", ()=>{
    if(confirm("isso apagará TODAS as notas criptografadas para sempre. continuar?")){
      Storage.clearAll(); CuspirCrypto.clearEncrypted();
      unlockedPassword=null; notes=[];
      els.lockScreen.classList.add("hidden");
      document.getElementById("app").style.display="";
      updateCryptoUI(); renderList(); showToast("dados apagados");
    }
  });

  // search/sort
  els.search.addEventListener("input",(e)=>{ searchQuery=e.target.value.trim(); currentPage=1; renderList(); });
  els.btnSort.addEventListener("click",()=>{ sortAsc=!sortAsc; currentPage=1; renderList(); });

  // editor inputs
  els.titleInput.addEventListener("input",(e)=> debouncedUpdate({title:e.target.value}));
  els.contentInput.addEventListener("input",(e)=>{
    debouncedUpdate({content:e.target.value});
    const words=e.target.value.trim()?e.target.value.trim().split(/\s+/).length:0;
    els.stats.textContent=`${words} palavras • ${e.target.value.length} caracteres`;
    if(mdMode==="preview") renderPreview();
  });

  // md toggle
  els.tabWrite.addEventListener("click",()=> setMdMode("write"));
  els.tabPreview.addEventListener("click",()=> setMdMode("preview"));

  // exportação unificada
  if (els.btnExportOpen) els.btnExportOpen.addEventListener("click", ()=> openExportDialog("all"));
  if (els.btnExportOne) els.btnExportOne.addEventListener("click", ()=> openExportDialog("current"));
  if (els.btnCancelExport) els.btnCancelExport.addEventListener("click", ()=> els.dialogExport.close());
  if (els.btnConfirmExport) els.btnConfirmExport.addEventListener("click", doUnifiedExport);
  document.querySelectorAll('input[name="export-scope"]').forEach((r)=>{
    r.addEventListener("change", ()=>{ syncExportPickerVisibility(); updateExportHint(); });
  });
  document.querySelectorAll('input[name="export-format"]').forEach((r)=>{
    r.addEventListener("change", updateExportHint);
  });
  if (els.exportSearch) els.exportSearch.addEventListener("input", (e)=>{
    renderExportPicker(e.target.value); updateExportHint();
  });
  if (els.dialogExport) {
    els.dialogExport.addEventListener("click", (e)=>{
      const rect = els.dialogExport.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) els.dialogExport.close();
    });
  }
  els.importFile.addEventListener("change",(e)=>{
    const f=e.target.files[0]; if(f) handleImportFile(f);
    e.target.value="";
  });

  // also allow drag import
  document.addEventListener("dragover",(e)=> e.preventDefault());
  document.addEventListener("drop",(e)=>{
    e.preventDefault();
    const f=e.dataTransfer.files[0];
    if(f && (f.name.endsWith(".json")||f.name.endsWith(".md"))) handleImportFile(f);
  });

  window.addEventListener("beforeunload", async ()=>{
    if(saveTimer && activeId){
      clearTimeout(saveTimer);
      const note=notes.find(n=>n.id===activeId);
      if(note){
        note.title=els.titleInput.value; note.content=els.contentInput.value; note.updatedAt=nowISO();
        if(isEncrypted() && unlockedPassword) await CuspirCrypto.persistEncrypted(notes, unlockedPassword);
        else Storage.save(notes);
      }
    }
  });

  document.addEventListener("keydown",(e)=>{
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==="n"){ e.preventDefault(); createNote(); }
    if((e.ctrlKey||e.metaKey) && e.shiftKey && e.key.toLowerCase()==="c"){ e.preventDefault(); copyActiveNote(); }
    if(e.key==="Escape"){
      if((els.dialogHelp && els.dialogHelp.open) || els.dialogCrypto.open || els.dialogDelete.open || els.dialogClear.open || (els.dialogExport && els.dialogExport.open)) return;
      if(!els.menuDropdown.classList.contains("hidden")){ els.menuDropdown.classList.add("hidden"); return;}
      if(document.body.classList.contains("editing") && window.innerWidth<860) closeEditor();
    }
  });

  // PWA — registra SW e avisa quando há versão nova
  // Dispositivos com cache antigo recebem a nova versão via network-first (sw.js)
  // + este listener mostra o banner "nova versão disponível".
  let refreshing = false;
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").then((reg) => {
        // checa atualização ao focar/periodicamente (pega versão nova mesmo com aba aberta)
        const check = () => { try { reg.update(); } catch {} };
        document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
        setInterval(check, 60 * 60 * 1000);
        if (reg.waiting) showUpdateToast();
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdateToast();
          });
        });
      }).catch(() => {});
    });
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data && e.data.type === "SW_UPDATED" && navigator.serviceWorker.controller) showUpdateToast();
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }
  function showUpdateToast(){
    if (!els.updateToast) return;
    els.updateToast.classList.remove("hidden");
  }
  if (els.btnUpdateApp) els.btnUpdateApp.addEventListener("click", async ()=>{
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
        return;
      }
      if (reg && reg.installing) {
        reg.installing.postMessage({ type: "SKIP_WAITING" });
        return;
      }
    } catch {}
    window.location.reload();
  });

  // init
  initialLoad();
})();
