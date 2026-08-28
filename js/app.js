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
  }
  function closeEditor(){
    if(saveTimer){ clearTimeout(saveTimer); saveTimer=null; }
    els.editor.classList.add("hidden");
    els.emptyEditor.classList.remove("hidden");
    document.body.classList.remove("editing");
    activeId=null; renderList();
  }

  // -- exports
  function exportSingleMd(){
    const note=notes.find(n=>n.id===activeId); if(!note) return;
    const md = `# ${note.title || "sem título"}\n\n${note.content}\n\n---\n_criada: ${formatFullDate(note.createdAt)}_\n_editada: ${formatFullDate(note.updatedAt)}_\n`;
    downloadFile(`${slugify(note.title)}.md`, md, "text/markdown");
    showToast("markdown exportado");
  }
  function exportSinglePdf(){
    const note=notes.find(n=>n.id===activeId); if(!note) return;
    const htmlContent = Markdown.toHtml(note.content);
    const titleEsc = escapeHtml(note.title || "sem título");
    const win = window.open("", "_blank");
    if(!win){ showToast("popup bloqueado — permita popups"); return; }
    win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${titleEsc}</title><style>
      body{font-family: ui-sans-system,-apple-system,BlinkMacSystemFont,Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif; max-width:740px; margin:40px auto; padding:0 20px; color:#1c1917; line-height:1.6}
      h1{font-size:28px; border-bottom:1px solid #e7e5e4; padding-bottom:12px}
      pre{background:#0a0a0a;color:#fafaf9;padding:14px;border-radius:10px;overflow:auto}
      code{font-family:ui-monospace,monospace; background:#f5f5f4; padding:2px 6px; border-radius:6px}
      pre code{background:transparent; color:inherit}
      blockquote{border-left:3px solid #d6d3d1; margin:12px 0; padding:6px 14px; background:#f5f5f4}
      a{color:#0a0a0a}
      .meta{font-size:12px;color:#a8a29e; margin-bottom:20px}
      @media print{body{margin:20px}}
    </style></head><body>
      <h1>${titleEsc}</h1>
      <div class="meta">criada ${formatFullDate(note.createdAt)} • editada ${formatFullDate(note.updatedAt)}</div>
      <div>${htmlContent}</div>
    </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(()=> win.print(), 400);
  }
  function exportAllJson(){
    const json=Storage.exportJson(notes);
    downloadFile(`cuspir-backup-${new Date().toISOString().slice(0,10)}.json`, json, "application/json");
    showToast("backup JSON exportado");
  }
  function exportAllMd(){
    if(!notes.length){ showToast("nada para exportar"); return; }
    const all = notes.map(n=> `# ${n.title || "sem título"}\n\n${n.content}\n\n---\n_criada: ${formatFullDate(n.createdAt)}_\n_editada: ${formatFullDate(n.updatedAt)}_\n`).join("\n\n");
    downloadFile(`cuspir-todas-${new Date().toISOString().slice(0,10)}.md`, all, "text/markdown");
    showToast("todas as notas em .md");
  }
  function exportAllPdf(){
    if(!notes.length){ showToast("nada para exportar"); return; }
    const win=window.open("","_blank");
    if(!win){ showToast("popup bloqueado"); return; }
    let body = notes.map(n=>{
      const title=escapeHtml(n.title||"sem título");
      const md=Markdown.toHtml(n.content);
      return `<article style="margin-bottom:40px; padding-bottom:30px; border-bottom:1px solid #e7e5e4"><h1>${title}</h1><div style="font-size:12px;color:#a8a29e;margin-bottom:12px">criada ${formatFullDate(n.createdAt)} • editada ${formatFullDate(n.updatedAt)}</div><div>${md}</div></article>`;
    }).join("");
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Cuspir — todas as notas</title><style>
      body{font-family:ui-sans-system,-apple-system,BlinkMacSystemFont,Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif; max-width:740px; margin:40px auto; padding:0 20px; color:#1c1917; line-height:1.6}
      h1{font-size:22px} pre{background:#0a0a0a;color:#fafaf9;padding:14px;border-radius:10px;overflow:auto} code{font-family:ui-monospace,monospace;background:#f5f5f4;padding:2px 6px;border-radius:6px} pre code{background:transparent;color:inherit} blockquote{border-left:3px solid #d6d3d1;margin:12px 0;padding:6px 14px;background:#f5f5f4}
    </style></head><body><h1 style="text-align:center">cuspir — todas as notas</h1><p style="text-align:center;color:#a8a29e;font-size:12px">${notes.length} notas • ${new Date().toLocaleDateString("pt-BR")}</p>${body}</body></html>`);
    win.document.close(); win.focus(); setTimeout(()=>win.print(),500);
  }

  // -- import
  function handleImportFile(file){
    if(!file) return;
    const reader=new FileReader();
    reader.onload= async (e)=>{
      const text=e.target.result;
      try{
        if(file.name.endsWith(".json")){
          const data=JSON.parse(text);
          let importedNotes=null;
          if(Array.isArray(data)) importedNotes=data;
          else if(Array.isArray(data.notes)) importedNotes=data.notes;
          else throw new Error("JSON inválido");
          // validate notes shape
          importedNotes = importedNotes.filter(n=> n && typeof n.title==="string" && typeof n.content==="string");
          if(!importedNotes.length) throw new Error("nenhuma nota válida");
          // merge: keep existing, prepend imported with new ids if conflict? keep ids but ensure uniqueness
          const existingIds=new Set(notes.map(n=>n.id));
          let added=0;
          importedNotes.forEach(n=>{
            if(!n.id || existingIds.has(n.id)) n.id=Storage.generateId();
            if(!n.createdAt) n.createdAt=nowISO();
            if(!n.updatedAt) n.updatedAt=nowISO();
            notes.unshift(n); added++;
          });
          await persist(); renderList(); showToast(`${added} notas importadas`);
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

  // menu
  els.btnMenu.addEventListener("click",(e)=>{
    e.stopPropagation();
    els.menuDropdown.classList.toggle("hidden");
  });
  document.addEventListener("click",(e)=>{
    if(!els.menuDropdown.classList.contains("hidden") && !els.menuDropdown.contains(e.target) && e.target!==els.btnMenu) els.menuDropdown.classList.add("hidden");
  });
  els.menuDropdown.addEventListener("click",(e)=>{
    const action=e.target.dataset.action;
    if(!action) return;
    els.menuDropdown.classList.add("hidden");
    if(action==="export-json") exportAllJson();
    else if(action==="import-json") els.importFile.click();
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
  els.search.addEventListener("input",(e)=>{ searchQuery=e.target.value.trim(); renderList(); });
  els.btnSort.addEventListener("click",()=>{ sortAsc=!sortAsc; renderList(); });

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

  // exports
  els.btnExportMd.addEventListener("click", exportSingleMd);
  els.btnExportPdf.addEventListener("click", exportSinglePdf);
  els.btnExportAllMd.addEventListener("click", exportAllMd);
  els.btnExportAllPdf.addEventListener("click", exportAllPdf);
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
    if(e.key==="Escape"){
      if(els.dialogCrypto.open || els.dialogDelete.open || els.dialogClear.open) return;
      if(!els.menuDropdown.classList.contains("hidden")){ els.menuDropdown.classList.add("hidden"); return;}
      if(document.body.classList.contains("editing") && window.innerWidth<860) closeEditor();
    }
  });

  // PWA
  if("serviceWorker" in navigator){
    window.addEventListener("load",()=> navigator.serviceWorker.register("./sw.js").catch(()=>{}));
  }

  // init
  initialLoad();
})();
