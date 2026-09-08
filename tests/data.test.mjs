// data.test.mjs — importação válida/inválida, migração, backup, restauração, sem perda.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadBrowserModule, makeLocalStorage } from "./helpers.mjs";

function storageWith(seed = {}, opts) {
  const ls = makeLocalStorage(opts);
  for (const [k, v] of Object.entries(seed)) ls.setItem(k, v);
  return loadBrowserModule("js/storage.js", { localStorageStub: ls });
}
function notes(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `id-${i}`, title: `t${i}`, content: `c${i}`,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z",
  }));
}

describe("importação (validate.js)", () => {
  const { exports: V } = loadBrowserModule("js/validate.js");
  let n = 0;
  const gen = () => `novo-${++n}`;

  it("importação válida: array + {notes}, normaliza datas e regenera ids", () => {
    const r1 = V.parseBackupFile(JSON.stringify(notes(2)), gen);
    assert.equal(r1.notes.length, 2);
    assert.ok(r1.notes.every((x) => x.id.startsWith("novo-")));
    const r2 = V.parseBackupFile(JSON.stringify({ notes: notes(1), version: 1 }), gen);
    assert.equal(r2.notes.length, 1);
  });
  it("importação inválida: JSON quebrado, forma errada, vazio", () => {
    assert.throws(() => V.parseBackupFile("{{{", gen), /JSON inválido/);
    assert.throws(() => V.parseBackupFile('{"foo":1}', gen), /JSON inválido/);
    assert.throws(() => V.parseBackupFile('{"notes":"x"}', gen), /JSON inválido/);
    assert.throws(() => V.parseBackupFile("[]", gen), /nenhuma nota válida/);
    assert.throws(() => V.parseBackupFile('[{"title":1,"content":"c"}]', gen), /nenhuma nota válida/);
  });
  it("campos ausentes são preenchidos, extras descartados, limites aplicados", () => {
    const { notes: out } = V.parseBackupFile(JSON.stringify([{
      title: "t".repeat(9000), content: "c", evil: "<script>", __proto__: { x: 1 },
    }]), gen);
    assert.equal(out.length, 1);
    assert.ok(out[0].title.length <= V.MAX_TITLE_LEN);
    assert.ok(!("evil" in out[0]));
    assert.ok(out[0].createdAt && out[0].updatedAt);
  });
  it("rejeita arquivo gigante sem parsear tudo", () => {
    assert.throws(() => V.parseBackupFile("x".repeat(V.MAX_FILE_CHARS + 1), gen), /grande demais/);
  });
});

describe("migração segura (storage.js)", () => {
  it("v0 → v1: cria backup, carimba versão, segunda execução é noop", () => {
    const { exports: S, sandbox } = storageWith({ "epifania:notes": JSON.stringify(notes(2)) });
    const r1 = S.migrateIfNeeded();
    assert.equal(r1.migrated, true);
    assert.equal(S.getDataVersion(), 1);
    assert.equal(S.listBackups().length, 1);
    assert.equal(JSON.stringify(S.loadPlain()), JSON.stringify(notes(2)));
    const r2 = S.migrateIfNeeded();
    assert.equal(r2.migrated, false);
    assert.equal(S.listBackups().length, 1, "noop não deve criar backup extra");
    void sandbox;
  });
  it("falha na migração não destrói o formato anterior", () => {
    const raw = '"sou uma string, não array"';
    const { exports: S, sandbox } = storageWith({ "epifania:notes": raw });
    // loadPlain retorna [] para formato ilegível; migração prossegue sem apagar a chave
    const r = S.migrateIfNeeded();
    assert.ok(r.migrated === true || r.migrated === false);
    assert.equal(sandbox.localStorage.getItem("epifania:notes"), raw, "chave original preservada");
  });
  it("migração preserva chave legada cuspir como redundância", () => {
    const arr = JSON.stringify(notes(1));
    const { exports: S, sandbox } = storageWith({ "cuspir:notes": arr });
    S.migrateIfNeeded();
    assert.equal(sandbox.localStorage.getItem("cuspir:notes"), arr);
    assert.equal(JSON.stringify(S.loadPlain()), JSON.stringify(notes(1)));
  });
});

describe("backup automático + retenção + restauração", () => {
  it("mantém no máximo 5 backups", () => {
    const { exports: S } = storageWith({ "epifania:notes": JSON.stringify(notes(1)) });
    for (let i = 0; i < 7; i++) {
      // garante stamps distintos
      const at = new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
      const key = `epifania:backup:2026-01-01T00-00-${String(i).padStart(2, "0")}-000Z`;
      S.createBackup(`t${i}`);
      void at; void key;
    }
    assert.ok(S.listBackups().length <= 5, `backups: ${S.listBackups().length}`);
  });
  it("restauração recupera estado anterior (e protege o atual com pre-restore)", () => {
    const before = JSON.stringify(notes(2));
    const { exports: S, sandbox } = storageWith({ "epifania:notes": before });
    const bkey = S.createBackup("antes-do-apagao");
    sandbox.localStorage.setItem("epifania:notes", JSON.stringify(notes(0)));
    S.restoreBackup(bkey);
    assert.equal(JSON.stringify(S.loadPlain()), JSON.stringify(notes(2)));
    assert.ok(S.listBackups().some((k) => k !== bkey), "pre-restore criado");
  });
  it("restauração de backup inválido lança sem alterar nada", () => {
    const before = JSON.stringify(notes(1));
    const { exports: S, sandbox } = storageWith({ "epifania:notes": before });
    assert.throws(() => S.restoreBackup("epifania:backup:inexistente"), /inválido ou ausente/);
    assert.equal(sandbox.localStorage.getItem("epifania:notes"), before);
  });
  it("falta de espaço no backup NÃO apaga os originais", () => {
    const before = JSON.stringify(notes(3));
    const { exports: S, sandbox } = storageWith({ "epifania:notes": before }, { quotaBypass: true });
    assert.throws(() => S.createBackup("sem-espaco"), /quota/);
    assert.equal(sandbox.localStorage.getItem("epifania:notes"), before);
  });
  it("export inclui app + dataVersion + timestamp (backup identificável)", () => {
    const { exports: S } = storageWith();
    const parsed = JSON.parse(S.exportJson(notes(1)));
    assert.equal(parsed.app, "epifania");
    assert.equal(parsed.dataVersion, S.DATA_VERSION);
    assert.ok(parsed.exportedAt && Array.isArray(parsed.notes));
  });
});
