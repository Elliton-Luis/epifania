// app.js — Cuspir com markdown, export, import, criptografia
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
    btnSort: $("#btn-sort"),
    btnExportMd: $("#btn-export-md"),
    btnExportPdf: $("#btn-export-pdf"),
    btnExportAllMd: $("#btn-export-all-md"),
    btnExportAllPdf: $("#btn-export-all-pdf"),
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
  };

  let notes = [];
  let activeId = null;
  let searchQuery = "";
  let sortAsc = false;
  let saveTimer = null;
  let pendingDeleteId = null;
  let unlockedPassword = null; // kept in memory only
  let mdMode = "write"; // write | preview

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
  function escapeHtml(s){ return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
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
    activeId=note.id; searchQuery=""; els.search.value="";
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
    els.notesCount.textContent=`${filtered.length} ${filtered.length===1?"nota":"notas"}${searchQuery?" • filtradas":""}`;
    els.btnSort.textContent= sortAsc ? "antigas ↓" : "recentes ↓";
    if(notes.length===0){
      els.notesList.innerHTML=""; els.emptyList.classList.remove("hidden"); return;
    }
    els.emptyList.classList.add("hidden");
    if(filtered.length===0){
      els.notesList.innerHTML=`<div class="no-results">nenhuma nota para “${escapeHtml(searchQuery)}”</div>`; return;
    }
    els.notesList.innerHTML=filtered.map(note=>{
      const isActive=note.id===activeId;
      const title=note.title.trim() || "sem título";
      const preview=note.content.trim().slice(0,120).replace(/\n/g," ") || "vazia…";
      const date=formatDate(note.updatedAt);
      return `<article class="note-item ${isActive?"active":""}" data-id="${note.id}" tabindex="0" role="button" aria-label="Abrir nota ${escapeHtml(title)}">
        <div class="note-item-top"><h2 class="note-item-title">${escapeHtml(title)}</h2><time class="note-item-date">${date}</time></div>
        <p class="note-item-preview">${escapeHtml(preview)}</p>
      </article>`;
    }).join("");
    els.notesList.querySelectorAll(".note-item").forEach(el=>{
      const id=el.dataset.id;
      el.addEventListener("click",()=>openEditor(id));
      el.addEventListener("keydown",(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); openEditor(id);} });
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
