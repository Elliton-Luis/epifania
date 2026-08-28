// storage.js — camada fina sobre localStorage com suporte opcional a criptografia
const Storage = (() => {
  const KEY = "cuspir:notes";
  const ENC_KEY = "cuspir:enc:v1";
  const LEGACY_KEY = "cuspir";

  function loadPlain() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
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

  function exportJson(notes) {
    return JSON.stringify({ exportedAt: new Date().toISOString(), version: 1, notes }, null, 2);
  }

  function clearAll() {
    localStorage.removeItem(KEY);
    localStorage.removeItem(ENC_KEY);
    localStorage.removeItem("cuspir:enc:meta");
    localStorage.removeItem(LEGACY_KEY);
  }

  return { load, loadPlain, save, savePlain, generateId, exportJson, clearAll, KEY, ENC_KEY };
})();
