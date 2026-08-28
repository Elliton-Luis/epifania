// markdown.js — parser simples sem dependências
// suporta headings, bold, italic, inline code, code block, blockquote, lists, links, hr, paragraphs
const Markdown = (() => {
  function escapeHtml(s) {
    return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  function parseInline(text) {
    // escape first, then restore markdown tokens
    let t = escapeHtml(text);
    // inline code `code`
    t = t.replace(/`([^`]+?)`/g, '<code>$1</code>');
    // images ![alt](url) -> must before links
    t = t.replace(/!\[([^\]]*?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // links [text](url)
    t = t.replace(/\[([^\]]+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // auto links http(s)
    t = t.replace(/(?<!href=")(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    // bold **text** or __text__
    t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/__(.+?)__/g, '<strong>$1</strong>');
    // italic *text* or _text_ (avoid double)
    t = t.replace(/\*(?!\*)(.+?)\*/g, '<em>$1</em>');
    t = t.replace(/_(?!_)(.+?)_/g, '<em>$1</em>');
    // strikethrough ~~text~~
    t = t.replace(/~~(.+?)~~/g, '<del>$1</del>');
    return t;
  }

  function toHtml(md) {
    if (!md || !md.trim()) return '<p class="md-empty">vazio — nada para pré-visualizar</p>';
    const lines = md.replace(/\r\n/g,"\n").split("\n");
    let html = "";
    let i = 0;
    let inCodeBlock = false;
    let codeLang = "";
    let codeBuf = [];
    let listStack = []; // 'ul' | 'ol'

    function closeLists() {
      while (listStack.length) {
        html += `</${listStack.pop()}>`;
      }
    }

    while (i < lines.length) {
      let line = lines[i];

      // code block ```
      if (line.trim().startsWith("```")) {
        if (!inCodeBlock) {
          closeLists();
          inCodeBlock = true;
          codeLang = line.trim().slice(3).trim();
          codeBuf = [];
        } else {
          const code = escapeHtml(codeBuf.join("\n"));
          html += `<pre><code${codeLang ? ` class="lang-${escapeHtml(codeLang)}"` : ""}>${code}</code></pre>`;
          inCodeBlock = false;
          codeLang = "";
          codeBuf = [];
        }
        i++; continue;
      }
      if (inCodeBlock) { codeBuf.push(line); i++; continue; }

      const trimmed = line.trim();

      if (!trimmed) { // blank line — paragraph break, close lists if needed? keep lists open
        // close paragraph implicit
        i++; continue;
      }

      // hr --- or *** or ___
      if (/^(\*\*\*|---|___)\s*$/.test(trimmed)) {
        closeLists();
        html += "<hr />"; i++; continue;
      }

      // heading # .. ######
      const hMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (hMatch) {
        closeLists();
        const level = hMatch[1].length;
        html += `<h${level}>${parseInline(hMatch[2].trim())}</h${level}>`;
        i++; continue;
      }

      // blockquote >
      if (trimmed.startsWith(">")) {
        closeLists();
        let bqLines = [];
        while (i < lines.length && lines[i].trim().startsWith(">")) {
          bqLines.push(lines[i].replace(/^\s*>\s?/, ""));
          i++;
        }
        html += `<blockquote>${toHtml(bqLines.join("\n"))}</blockquote>`;
        continue;
      }

      // unordered list - , * , +
      const ulMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
      const olMatch = line.match(/^(\s*)\d+\.\s+(.*)$/);
      if (ulMatch || olMatch) {
        const isOl = !!olMatch;
        const content = (isOl ? olMatch[2] : ulMatch[2]);
        const tag = isOl ? "ol" : "ul";
        // if top of stack not this tag, open new
        if (listStack[listStack.length-1] !== tag) {
          html += `<${tag}>`;
          listStack.push(tag);
        }
        html += `<li>${parseInline(content)}</li>`;
        // look ahead: if next line not list, close
        const next = lines[i+1] || "";
        const nextIsList = next.match(/^\s*([-*+]\s+|\d+\.\s+)/);
        if (!nextIsList) {
          // keep closing will be done on next non-list block; but we close now to simplify nesting flat
          // Actually close all for flat lists
          // We'll keep one level; close after sequence ends
          // Check if next block is not list, close
          if (!next.trim() || !next.match(/^\s*([-*+]\s+|\d+\.\s+)/)) {
            // peek further? just close if next is not list
            // close all lists
            while (listStack.length) html += `</${listStack.pop()}>`;
          }
        }
        i++; continue;
      } else {
        // not a list, ensure lists closed
        if (listStack.length) closeLists();
      }

      // paragraph — collect until blank or special
      let paraLines = [line];
      i++;
      while (i < lines.length) {
        const nxt = lines[i];
        const t = nxt.trim();
        if (!t) break;
        if (t.startsWith("#") || t.startsWith(">") || t.startsWith("```") || /^(\*\*\*|---|___)\s*$/.test(t) || nxt.match(/^\s*([-*+]\s+|\d+\.\s+)/)) break;
        paraLines.push(nxt);
        i++;
      }
      const paraText = paraLines.join(" ").trim();
      if (paraText) html += `<p>${parseInline(paraText)}</p>`;
    }

    if (inCodeBlock) {
      html += `<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`;
    }
    closeLists();
    return html;
  }

  return { toHtml, parseInline };
})();
