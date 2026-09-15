// xss.test.mjs — regressão do Stored XSS (F1) e auditoria de sinks equivalentes.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadBrowserModule, readSource } from "./helpers.mjs";

const { exports: Markdown } = loadBrowserModule("js/markdown.js");
const { exports: Validate } = loadBrowserModule("js/validate.js");
const appSrc = readSource("js/app.js");

const XSS_PAYLOADS = [
  `" onclick="alert(1)`,
  `" onmouseover="alert(document.domain)`,
  `"><img src=x onerror=alert(1)>`,
  `<script>alert(1)</script>`,
  `a'b"c<d>e&f`,
  `x`.repeat(5000),
];

describe("escapeHtml central", () => {
  it("escapa & < > \" '", () => {
    assert.equal(Validate.escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
  });
  it("neutraliza todos os payloads de id (vira texto, sem quebrar atributo)", () => {
    for (const p of XSS_PAYLOADS) {
      const e = Validate.escapeHtml(p);
      assert.ok(!e.includes("<") && !e.includes(">") && !e.includes('"'), `payload escapou: ${p.slice(0, 40)}`);
    }
  });
});

describe("Markdown.toHtml não deixa HTML bruto passar", () => {
  it("<script> vira texto", () => {
    const html = Markdown.toHtml("<script>alert(1)</script>");
    assert.ok(!html.includes("<script>"), html);
    assert.ok(html.includes("&lt;script&gt;"), html);
  });
  it("<img onerror> vira texto", () => {
    const html = Markdown.toHtml('<img src=x onerror=alert(1)>');
    assert.ok(!html.includes("<img"), html);
    assert.ok(html.includes("&lt;img"), html);
  });
  it("javascript: URL não vira href executável", () => {
    const html = Markdown.toHtml("[clique](javascript:alert(1))");
    assert.ok(!html.includes('<a href="javascript:'), html);
    assert.ok(!/on\w+\s*=/i.test(html.replace(/&\w+;/g, "")), html);
  });
  it("links https viram <a> com rel=noopener, sem injeção de atributo", () => {
    const html = Markdown.toHtml('[x](https://example.com"onmouseover="alert(1))');
    assert.ok(!html.includes("onmouseover=") || html.includes("&quot;") || html.includes("onmouseover=&quot;"), html);
    // o href continua sendo UM atributo (entidade &quot; não quebra atributo)
    const m = html.match(/<a href="([^"]*)"/);
    assert.ok(m, html);
  });
  it("título/conteúdo com markdown malicioso não gera handler", () => {
    const html = Markdown.toHtml('# t"><svg onload=alert(1)>\n\ntexto **negrito**');
    assert.ok(!html.includes("<svg") && !/<\w+[^>]*(?<![&\w])on\w+\s*=/i.test(html), html);
    assert.ok(html.includes("&lt;svg"), html); // payload virou texto escapado
  });
});

describe("importação nunca preserva id externo", () => {
  const gen = () => "id-interno-novo";
  it("id malicioso é descartado e regenerado", () => {
    const { notes } = Validate.parseBackupFile(
      JSON.stringify([{ title: "t", content: "c", id: `" onclick="alert(1)` }]), gen);
    assert.equal(notes.length, 1);
    assert.equal(notes[0].id, "id-interno-novo");
  });
  it("todos os payloads de id viram identidade nova", () => {
    for (const p of XSS_PAYLOADS) {
      const n = Validate.normalizeNote({ title: "t", content: "c", id: p }, gen);
      assert.ok(n && n.id === "id-interno-novo", p.slice(0, 40));
    }
  });
  it("rejeita title/content não-string", () => {
    assert.equal(Validate.normalizeNote({ title: 1, content: "c" }, gen), null);
    assert.equal(Validate.normalizeNote({ title: "t", content: null }, gen), null);
    assert.equal(Validate.normalizeNote({ title: ["x"], content: "c" }, gen), null);
  });
});

describe("auditoria estática de sinks (app.js)", () => {
  it("render da lista não interpola note.id em innerHTML", () => {
    assert.ok(!appSrc.includes('data-id="${note.id}"'), "interpolação vulnerável ainda presente");
    assert.ok(!appSrc.includes("data-id='${note.id}'"), "interpolação vulnerável ainda presente");
  });
  it("itens da lista usam DOM API (dataset/textContent)", () => {
    assert.ok(appSrc.includes("article.dataset.id"), "dataset.id não usado");
    assert.ok(appSrc.includes("h2.textContent") || appSrc.includes(".textContent=title"), "textContent não usado");
  });
  it("sem eval/new Function", () => {
    assert.ok(!/[^a-zA-Z]eval\s*\(/.test(appSrc), "eval encontrado");
    assert.ok(!appSrc.includes("new Function"), "new Function encontrado");
  });
  it("restam só sinks documentados como seguros (paginação numérica, markdown escapado, export PDF)", () => {
    // ignora comentários: só conta código executável
    const code = appSrc.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    const inner = [...code.matchAll(/\.innerHTML\s*=/g)];
    const dwrites = [...code.matchAll(/document\.write\(/g)];
    assert.equal(inner.length, 2, `innerHTML em código: ${inner.length} (esperado: paginação + preview markdown)`);
    assert.equal(dwrites.length, 1, `document.write em código: ${dwrites.length} (esperado: 1 export PDF unificado)`);
  });
});
