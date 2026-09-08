// storage.js — camada fina sobre localStorage com suporte opcional a criptografia,
// versionamento de dados (DATA_VERSION), backup automático e migração segura.
// Regra: migração SEMPRE faz backup antes de alterar qualquer chave; em erro, o formato anterior é preservado.
const Storage = (() => {
  const KEY = "epifania:notes";
  const ENC_KEY = "epifania:enc:v1";
  const ENC_META = "epifania:enc:meta";
  const LEGACY_KEY = "epifania";
  const LEGACY_CUSPIR_KEY = "cuspir:notes";
  const LEGACY_CUSPIR_ENC = "cuspir:enc:v1";

  // Versão do FORMATO DOS DADOS (não confundir com versão do app).
  // v1: notas como [{ id, title, content, createdAt, updatedAt }].
  const DATA_VERSION = 1;
  const VERSION_KEY = "epifania:data-version";
  const BACKUP_PREFIX = "epifania:backup:";
  const BACKUP_RETENTION = 5;

  function safeGet(k) {
    try { return localStorage.getItem(k); } catch { return null; }
  }
  function safeSet(k, v) {
    localStorage.setItem(k, v); // pode lançar QuotaExceededError — chamador trata
  }

  function getDataVersion() {
    const raw = safeGet(VERSION_KEY);
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0; // 0 = nunca versionado (dados legados)
  }

  function listBackups() {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(BACKUP_PREFIX)) out.push(k);
      }
    } catch { return []; }
    return out.sort(); // sufixo ISO-8601 => ordem cronológica
  }

  function pruneBackups() {
    const keys = listBackups();
    const excess = keys.length - BACKUP_RETENTION;
    for (let i = 0; i < excess; i++) {
      try { localStorage.removeItem(keys[i]); } catch {}
    }
    return listBackups();
  }

  // Fotografa o estado atual SEM interpretar nem alterar os dados.
  // Em falta de espaço, lança sem ter modificado nada (originais intactos).
  function createBackup(reason) {
    const payload = {
      v: 1, // versão do envelope de backup
      reason: String(reason || "manual"),
      at: new Date().toISOString(),
      dataVersion: getDataVersion(),
      plain: safeGet(KEY),
      enc: safeGet(ENC_KEY),
      meta: safeGet(ENC_META),
    };
    const stamp = payload.at.replace(/[:.]/g, "-");
    // Chaves únicas mesmo com 2 backups no mesmo milissegundo (sufixo crescente).
    let bkey = BACKUP_PREFIX + stamp;
    for (let i = 1; safeGet(bkey) !== null; i++) bkey = BACKUP_PREFIX + stamp + "-" + i;
    safeSet(bkey, JSON.stringify(payload)); // throws em quota cheia — nada foi apagado
    pruneBackups();
    return bkey;
  }

  function readBackup(bkey) {
    const raw = safeGet(bkey);
    if (!raw) return null;
    try {
      const b = JSON.parse(raw);
      if (!b || typeof b !== "object" || !("plain" in b) || !("enc" in b)) return null;
      return b;
    } catch { return null; }
  }

  // Restaura um backup na íntegra (escreve os valores brutos de volta).
  function restoreBackup(bkey) {
    const b = readBackup(bkey);
    if (!b) throw new Error("backup inválido ou ausente");
    createBackup("pre-restore"); // protege o estado atual antes de restaurar
    if (b.plain === null) { try { localStorage.removeItem(KEY); } catch {} }
    else safeSet(KEY, b.plain);
    if (b.enc === null) { try { localStorage.removeItem(ENC_KEY); } catch {} }
    else safeSet(ENC_KEY, b.enc);
    if (b.meta === null) { try { localStorage.removeItem(ENC_META); } catch {} }
    else safeSet(ENC_META, b.meta);
    if (b.dataVersion) safeSet(VERSION_KEY, String(b.dataVersion));
    return true;
  }

  function isValidNotesArray(v) {
    return Array.isArray(v) && v.every(n =>
      n && typeof n === "object" &&
      typeof n.id === "string" && typeof n.title === "string" && typeof n.content === "string"
    );
  }

  // Migração v0 -> v1: carimba a versão dos dados já existentes (inclui legado Cuspir).
  // Ordem segura: backup -> validar -> migrar -> validar -> carimbar. Falha não destrói nada.
  function migrateIfNeeded() {
    if (getDataVersion() >= DATA_VERSION) return { migrated: false, version: getDataVersion() };
    let backupKey = null;
    try {
      backupKey = createBackup("migrate-to-v1");
    } catch (e) {
      return { migrated: false, version: 0, error: "backup indisponível: " + e.message };
    }
    try {
      const notes = loadPlain(); // inclui caminho legado Cuspir (copia para a chave nova, não apaga a antiga)
      if (!Array.isArray(notes)) throw new Error("dados existentes ilegíveis");
      // valida o resultado antes de carimbar
      if (!notes.every(n => n && typeof n.id === "string")) throw new Error("notas fora do schema v1");
      safeSet(VERSION_KEY, String(DATA_VERSION));
      return { migrated: true, version: DATA_VERSION, backup: backupKey };
    } catch (e) {
      // NÃO apaga nada: apenas registra que a migração não concluiu (backup preservado)
      return { migrated: false, version: 0, error: e.message, backup: backupKey };
    }
  }

  function loadPlain() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && Array.isArray(parsed.notes)) return parsed.notes;
        return [];
      }
      // migração de Cuspir -> Epifania (cópia; a chave antiga é preservada como redundância)
      const old = localStorage.getItem(LEGACY_CUSPIR_KEY);
      if (old) {
        try { const arr = JSON.parse(old); if (Array.isArray(arr)) { localStorage.setItem(KEY, old); return arr; } } catch {}
      }
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const parsed = JSON.parse(legacy);
        if (parsed && Array.isArray(parsed.notes)) return parsed.notes;
      }
      return [];
    } catch { return []; }
  }

  function load() {
    // se está criptografado, não retornar plain — app deve chamar loadEncrypted após unlock
    if (localStorage.getItem(ENC_KEY)) return null; // indica bloqueado
    return loadPlain();
  }

  function save(notes) {
    // se criptografado, não salvar plain; app deve usar persistEncrypted
    if (localStorage.getItem(ENC_KEY)) {
      // noop — segurança: não deixar plain vazar
      return;
    }
    localStorage.setItem(KEY, JSON.stringify(notes));
  }

  // salva direto sem checar criptografia (usado no disable)
  function savePlain(notes) {
    localStorage.setItem(KEY, JSON.stringify(notes));
  }

  function generateId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  function exportJson(notes, opts) {
    const o = opts || {};
    return JSON.stringify({
      app: "epifania",
      dataVersion: DATA_VERSION,
      exportedAt: new Date().toISOString(),
      version: 1,
      notes,
    }, null, 2);
  }

  function clearAll() {
    localStorage.removeItem(KEY);
    localStorage.removeItem(ENC_KEY);
    localStorage.removeItem("epifania:enc:meta");
    localStorage.removeItem(LEGACY_KEY);
    // limpa chaves legadas do Cuspir
    localStorage.removeItem(LEGACY_CUSPIR_KEY);
    localStorage.removeItem(LEGACY_CUSPIR_ENC);
    localStorage.removeItem("cuspir:enc:meta");
    localStorage.removeItem("cuspir");
  }

  return {
    load, loadPlain, save, savePlain, generateId, exportJson, clearAll, KEY, ENC_KEY,
    DATA_VERSION, VERSION_KEY, BACKUP_PREFIX, BACKUP_RETENTION,
    getDataVersion, listBackups, pruneBackups, createBackup, readBackup, restoreBackup,
    isValidNotesArray, migrateIfNeeded,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = Storage;
}
