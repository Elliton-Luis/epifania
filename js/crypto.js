// crypto.js — criptografia client-side com Web Crypto API
// AES-GCM + PBKDF2, tudo 100% local, sem envio a servidor
const EpifaniaCrypto = (() => {
  const ENC_KEY = "epifania:enc:v1";
  const ENC_META = "epifania:enc:meta";
  const LEGACY_ENC_KEY = "cuspir:enc:v1";
  const LEGACY_META = "cuspir:enc:meta";
  const SALT_LEN = 16;
  const IV_LEN = 12;
  const ITERATIONS = 120000;

  function bufToB64(buf) {
    const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
    let binary = "";
    bytes.forEach(b => binary += String.fromCharCode(b));
    return btoa(binary);
  }
  function b64ToBuf(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
    return bytes.buffer;
  }
  function enc(s) { return new TextEncoder().encode(s); }
  function dec(b) { return new TextDecoder().decode(b); }

  async function deriveKey(password, saltBuf) {
    const baseKey = await crypto.subtle.importKey("raw", enc(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: saltBuf, iterations: ITERATIONS, hash: "SHA-256" },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt","decrypt"]
    );
  }

  function randomBytes(len) {
    const a = new Uint8Array(len);
    crypto.getRandomValues(a);
    return a;
  }

  async function encrypt(plainText, password) {
    const salt = randomBytes(SALT_LEN);
    const iv = randomBytes(IV_LEN);
    const key = await deriveKey(password, salt);
    const ct = await crypto.subtle.encrypt({ name:"AES-GCM", iv }, key, enc(plainText));
    return {
      salt: bufToB64(salt),
      iv: bufToB64(iv),
      ct: bufToB64(ct),
      v: 1
    };
  }

  async function decrypt(blob, password) {
    try {
      const salt = b64ToBuf(blob.salt);
      const iv = b64ToBuf(blob.iv);
      const ct = b64ToBuf(blob.ct);
      const key = await deriveKey(password, salt);
      const pt = await crypto.subtle.decrypt({ name:"AES-GCM", iv }, key, ct);
      return dec(pt);
    } catch (e) {
      throw new Error("senha incorreta ou dados corrompidos");
    }
  }

  function isEncrypted() {
    if (localStorage.getItem(ENC_KEY)) return true;
    // migração legada: se só existe chave antiga, considera criptografado e migra sob demanda
    if (localStorage.getItem(LEGACY_ENC_KEY)) return true;
    return false;
  }

  function getMeta() {
    try { return JSON.parse(localStorage.getItem(ENC_META) || localStorage.getItem(LEGACY_META) || "null"); } catch { return null; }
  }
  function setMeta(obj) {
    localStorage.setItem(ENC_META, JSON.stringify(obj));
  }

  async function enableEncryption(notes, password) {
    const json = JSON.stringify(notes);
    const blob = await encrypt(json, password);
    localStorage.setItem(ENC_KEY, JSON.stringify(blob));
    // remove plain (novo e legado)
    localStorage.removeItem("epifania:notes");
    localStorage.removeItem("cuspir:notes");
    localStorage.removeItem(LEGACY_ENC_KEY);
    localStorage.removeItem(LEGACY_META);
    setMeta({ enabledAt: new Date().toISOString() });
  }

  async function disableEncryption(notes, password) {
    // if currently encrypted, verify password first by decrypting
    if (isEncrypted()) {
      const raw = localStorage.getItem(ENC_KEY) || localStorage.getItem(LEGACY_ENC_KEY);
      const blob = JSON.parse(raw);
      await decrypt(blob, password); // throws if wrong
    }
    localStorage.removeItem(ENC_KEY);
    localStorage.removeItem(ENC_META);
    localStorage.removeItem(LEGACY_ENC_KEY);
    localStorage.removeItem(LEGACY_META);
    localStorage.setItem("epifania:notes", JSON.stringify(notes));
  }

  async function persistEncrypted(notes, password) {
    const json = JSON.stringify(notes);
    const blob = await encrypt(json, password);
    localStorage.setItem(ENC_KEY, JSON.stringify(blob));
    // limpa legado se existir
    localStorage.removeItem(LEGACY_ENC_KEY);
  }

  async function loadEncrypted(password) {
    const raw = localStorage.getItem(ENC_KEY) || localStorage.getItem(LEGACY_ENC_KEY);
    if (!raw) return null;
    const blob = JSON.parse(raw);
    const json = await decrypt(blob, password);
    const data = JSON.parse(json);
    // migra legado para nova chave se necessário
    if (localStorage.getItem(LEGACY_ENC_KEY) && !localStorage.getItem(ENC_KEY)) {
      localStorage.setItem(ENC_KEY, raw);
    }
    return data;
  }

  function clearEncrypted() {
    localStorage.removeItem(ENC_KEY);
    localStorage.removeItem(ENC_META);
    localStorage.removeItem(LEGACY_ENC_KEY);
    localStorage.removeItem(LEGACY_META);
  }

  return { encrypt, decrypt, isEncrypted, getMeta, enableEncryption, disableEncryption, persistEncrypted, loadEncrypted, clearEncrypted, ENC_KEY, ENC_META };
})();
// compat alias
const CuspirCrypto = EpifaniaCrypto;
