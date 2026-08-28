// crypto.js — criptografia client-side com Web Crypto API
// AES-GCM + PBKDF2, tudo 100% local, sem envio a servidor
const CuspirCrypto = (() => {
  const ENC_KEY = "cuspir:enc:v1";
  const ENC_META = "cuspir:enc:meta";
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
    return !!localStorage.getItem(ENC_KEY);
  }

  function getMeta() {
    try { return JSON.parse(localStorage.getItem(ENC_META) || "null"); } catch { return null; }
  }
  function setMeta(obj) {
    localStorage.setItem(ENC_META, JSON.stringify(obj));
  }

  async function enableEncryption(notes, password) {
    const json = JSON.stringify(notes);
    const blob = await encrypt(json, password);
    localStorage.setItem(ENC_KEY, JSON.stringify(blob));
    // remove plain
    localStorage.removeItem("cuspir:notes");
    setMeta({ enabledAt: new Date().toISOString() });
  }

  async function disableEncryption(notes, password) {
    // if currently encrypted, verify password first by decrypting
    if (isEncrypted()) {
      const blob = JSON.parse(localStorage.getItem(ENC_KEY));
      await decrypt(blob, password); // throws if wrong
    }
    localStorage.removeItem(ENC_KEY);
    localStorage.removeItem(ENC_META);
    localStorage.setItem("cuspir:notes", JSON.stringify(notes));
  }

  async function persistEncrypted(notes, password) {
    const json = JSON.stringify(notes);
    const blob = await encrypt(json, password);
    localStorage.setItem(ENC_KEY, JSON.stringify(blob));
  }

  async function loadEncrypted(password) {
    const raw = localStorage.getItem(ENC_KEY);
    if (!raw) return null;
    const blob = JSON.parse(raw);
    const json = await decrypt(blob, password);
    return JSON.parse(json);
  }

  function clearEncrypted() {
    localStorage.removeItem(ENC_KEY);
    localStorage.removeItem(ENC_META);
  }

  return { encrypt, decrypt, isEncrypted, getMeta, enableEncryption, disableEncryption, persistEncrypted, loadEncrypted, clearEncrypted, ENC_KEY, ENC_META };
})();
