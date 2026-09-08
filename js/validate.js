// validate.js — validação e normalização de dados externos (import JSON/backup)
// Sem dependências. Funciona no navegador (global EpifaniaValidate) e no Node (module.exports).
// Princípio: dados externos fornecem CONTEÚDO, nunca identidade interna (ids sempre regenerados).
const EpifaniaValidate = (() => {
  const MAX_NOTES = 5000;
  const MAX_TITLE_LEN = 500;
  const MAX_CONTENT_LEN = 200000;
  const MAX_FILE_CHARS = 5 * 1024 * 1024; // ~5 MB de texto

  // escapeHtml central: & < > " ' (cobre contexto de texto e de atributo com aspas duplas/simples)
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeString(v, maxLen) {
    if (typeof v !== "string") return null;
    let s = v;
    // remove NULs e caracteres de controle C0 (exceto \n \r \t)
    s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
    if (s.length > maxLen) s = s.slice(0, maxLen);
    return s;
  }

  function normalizeDate(v) {
    if (typeof v === "string" || typeof v === "number") {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    return new Date().toISOString();
  }

  // Normaliza UMA nota externa. O id SEMPRE é regenerado via generateId()
  // (o id original, se existir e for string curta, é descartado — nunca confiável).
  // Retorna a nota normalizada ou null (rejeitada).
  function normalizeNote(raw, generateId) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const title = normalizeString(raw.title, MAX_TITLE_LEN);
    const content = normalizeString(raw.content, MAX_CONTENT_LEN);
    if (title === null || content === null) return null; // campos obrigatórios tipados
    return {
      id: generateId(),
      title,
      content,
      createdAt: normalizeDate(raw.createdAt),
      updatedAt: normalizeDate(raw.updatedAt),
    };
  }

  function normalizeNotesArray(arr, generateId) {
    const out = [];
    const rejected = [];
    if (!Array.isArray(arr)) return { notes: out, rejected: 1 };
    const seen = new Set();
    for (const raw of arr.slice(0, MAX_NOTES)) {
      const n = normalizeNote(raw, generateId);
      if (!n) { rejected.push(raw); continue; }
      if (seen.has(n.id)) continue; // ids recém-gerados nunca colidem; defesa em profundidade
      seen.add(n.id);
      out.push(n);
    }
    if (arr.length > MAX_NOTES) rejected.push({ _truncated: arr.length - MAX_NOTES });
    return { notes: out, rejected };
  }

  // Faz parse + validação estrutural do arquivo. Retorna { notes } normalizado ou lança Error.
  function parseBackupFile(text, generateId) {
    if (typeof text !== "string") throw new Error("arquivo vazio ou ilegível");
    if (text.length > MAX_FILE_CHARS) throw new Error("arquivo grande demais (limite ~5 MB)");
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("JSON inválido");
    }
    let arr = null;
    if (Array.isArray(data)) arr = data;
    else if (data && typeof data === "object" && Array.isArray(data.notes)) arr = data.notes;
    else throw new Error("JSON inválido: esperado array ou { notes: [...] }");
    const { notes, rejected } = normalizeNotesArray(arr, generateId);
    if (!notes.length) throw new Error("nenhuma nota válida no arquivo");
    return { notes, rejectedCount: Array.isArray(rejected) ? rejected.length : rejected };
  }

  return {
    escapeHtml,
    normalizeString,
    normalizeDate,
    normalizeNote,
    normalizeNotesArray,
    parseBackupFile,
    MAX_NOTES,
    MAX_TITLE_LEN,
    MAX_CONTENT_LEN,
    MAX_FILE_CHARS,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = EpifaniaValidate;
}
