// helpers.mjs — stub de localStorage + carregador de módulos browser-first para testes.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function makeLocalStorage({ quotaBypass = false } = {}) {
  const store = new Map();
  return {
    _map: store,
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) {
      v = String(v);
      if (quotaBypass && k.startsWith("epifania:backup:")) {
        const e = new Error("quota exceeded (simulada)");
        e.name = "QuotaExceededError";
        throw e;
      }
      store.set(k, v);
    },
    removeItem(k) { store.delete(k); },
    key(i) { return [...store.keys()][i] ?? null; },
    get length() { return store.size; },
    clear() { store.clear(); },
  };
}

// Carrega um js browser-first (IIFE global ou com guarda module.exports) num sandbox
// com localStorage/stubs injetados. Retorna o namespace pedido.
export function loadBrowserModule(filename, { localStorageStub, extraGlobals = {} } = {}) {
  const code = readFileSync(path.join(root, filename), "utf8");
  const sandbox = {
    localStorage: localStorageStub ?? makeLocalStorage(),
    crypto: globalThis.crypto,
    module: { exports: {} },
    exports: {},
    console,
    ...extraGlobals,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code + `\n//# sourceURL=${filename}`, sandbox, { filename });
  return { sandbox, exports: sandbox.module.exports };
}

export function readSource(filename) {
  return readFileSync(path.join(root, filename), "utf8");
}
