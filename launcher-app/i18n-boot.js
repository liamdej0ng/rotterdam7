// Taal-laag voor Rotterdam VII (NL / EN / DE).
// Wordt als inline <script> in de launcher en het spel gezet. Vertaalt alles wat op het scherm komt
// (textContent, innerHTML, kaart-tekst, radio-DJ's) met een woordenboek van Nederlandse tekststukjes.
// Nieuwe Nederlandse teksten die nog niet in het woordenboek staan, blijven gewoon Nederlands.
function R7I18N(D) {
  'use strict';
  var qs = new URLSearchParams(location.search), L = qs.get('lang');
  try { if (L) localStorage.setItem('r7lang', L); else L = localStorage.getItem('r7lang'); } catch (e) {}
  if (!L) { var n = (navigator.language || '').slice(0, 2).toLowerCase(); L = n === 'nl' ? 'nl' : n === 'de' ? 'de' : 'en'; }
  if (L !== 'en' && L !== 'de') L = 'nl';
  window.R7_LANG = L;
  try { document.documentElement.lang = L; } catch (e) {}
  if (L === 'nl') return;

  var SELF = '(' + R7I18N.toString() + ')(' + JSON.stringify(D) + ')';
  var I = L === 'en' ? 0 : 1;
  var esc = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
  var mk = function (list) {
    list.sort(function (a, b) { return b.length - a.length; });
    return new RegExp(list.map(function (k) {
      return (/^[\p{L}\p{N}]/u.test(k) ? '(?<![\\p{L}\\p{N}])' : '') + esc(k) + (/[\p{L}\p{N}]$/u.test(k) ? '(?![\\p{L}\\p{N}])' : '');
    }).join('|'), 'gu');
  };
  var keys = Object.keys(D);
  var RT = mk(keys.filter(function (k) { return k.indexOf('<') >= 0; }));
  var RP = mk(keys.filter(function (k) { return k.indexOf('<') < 0; }));
  var cache = new Map(), done = new Set();
  var plain = function (s) { return s.replace(RP, function (m) { return D[m] ? D[m][I] : m; }); };
  function tr(s) {
    if (typeof s !== 'string' || !/[A-Za-zÀ-ÿ]/.test(s) || done.has(s)) return s;
    var c = cache.get(s); if (c !== undefined) return c;
    var toks = [];
    var r = s.indexOf('<') >= 0 ? s.replace(RT, function (m) { toks.push(D[m][I]); return '\u0001' + (toks.length - 1) + '\u0002'; }) : s;
    r = r.split(/(<[^>]*>|\u0001\d+\u0002)/).map(function (p, i) { return i % 2 ? p : plain(p); }).join('');
    if (toks.length) r = r.replace(/\u0001(\d+)\u0002/g, function (m, k) { return toks[+k]; });
    if (cache.size > 20000) { cache.clear(); done.clear(); }
    cache.set(s, r); done.add(r);
    return r;
  }
  window.R7_T = tr;

  var P = Document.prototype;
  // Nieuwe documenten (het spel schrijft zichzelf met document.write) krijgen deze laag ook.
  if (!P.__r7w) {
    var w = P.write;
    P.write = function (h) {
      if (typeof h === 'string' && h.indexOf('__R7I18N__') < 0) {
        var tag = '<script>/*__R7I18N__*/' + SELF + '<\/script>';
        h = /<head[^>]*>/i.test(h) ? h.replace(/<head[^>]*>/i, function (m) { return m + tag; }) : tag + h;
      }
      return w.apply(this, [h].concat([].slice.call(arguments, 1)));
    };
    P.__r7w = 1;
  }
  if (!Node.prototype.__r7) {
    Node.prototype.__r7 = 1;
    var dT = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
    Object.defineProperty(Node.prototype, 'textContent', { configurable: true, enumerable: dT.enumerable, get: dT.get, set: function (v) { dT.set.call(this, window.R7_T ? window.R7_T(v) : v); } });
    var dH = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    Object.defineProperty(Element.prototype, 'innerHTML', { configurable: true, enumerable: dH.enumerable, get: dH.get, set: function (v) { dH.set.call(this, window.R7_T ? window.R7_T(v) : v); } });
    var iah = Element.prototype.insertAdjacentHTML;
    Element.prototype.insertAdjacentHTML = function (p, h) { return iah.call(this, p, window.R7_T ? window.R7_T(h) : h); };
    var ft = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (s) {
      var a = [].slice.call(arguments);
      if (this.canvas && this.canvas.isConnected && window.R7_T) a[0] = window.R7_T(s); // alleen kaart/HUD, niet de borden in de wereld
      return ft.apply(this, a);
    };
  }
  // Radio-DJ's: tekst vertalen en een Engelse/Duitse stem kiezen.
  try {
    var SS = window.speechSynthesis, O = window.SpeechSynthesisUtterance;
    if (SS && O && !O.__r7) {
      var gv = SS.getVoices.bind(SS);
      var mine = function () { return gv().find(function (v) { return v.lang.toLowerCase().indexOf(L) === 0; }); };
      SS.getVoices = function () { var v = gv(); return mine() ? [{ lang: 'nl-NL', name: 'r7', voiceURI: 'r7', localService: true, default: false }].concat(v) : v; };
      var dV = Object.getOwnPropertyDescriptor(O.prototype, 'voice'), dL = Object.getOwnPropertyDescriptor(O.prototype, 'lang');
      var U = function (t) {
        var u = new O(window.R7_T ? window.R7_T(t) : t), v = mine();
        if (v) { dV.set.call(u, v); dL.set.call(u, v.lang); }
        Object.defineProperty(u, 'voice', { get: function () { return dV.get.call(u); }, set: function () {} });
        Object.defineProperty(u, 'lang', { get: function () { return dL.get.call(u); }, set: function () {} });
        return u;
      };
      U.prototype = O.prototype; U.__r7 = 1;
      window.SpeechSynthesisUtterance = U;
    }
  } catch (e) {}
  // Vaste tekst in de pagina (menu's, besturing, launcher).
  function walk(root) {
    if (!root) return;
    var it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT), n;
    while ((n = it.nextNode())) {
      if (n.nodeType === 3) { var p = n.parentNode && n.parentNode.nodeName; if (p !== 'SCRIPT' && p !== 'STYLE') { var t = tr(n.nodeValue); if (t !== n.nodeValue) n.nodeValue = t; } }
      else {
        ['placeholder', 'title', 'alt'].forEach(function (a) { if (n.hasAttribute(a)) n.setAttribute(a, tr(n.getAttribute(a))); });
        if (n.nodeName === 'TEMPLATE') walk(n.content);
      }
    }
  }
  var go = function () { walk(document.body); if (document.title) document.title = tr(document.title); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true }); else go();
}
module.exports = R7I18N;
