/* --------------------------------------------------------------------------- *
 * patterns.js — tot „creierul” asistentului.
 *
 * TOATE cunoștințele despre joc sunt în acest singur fișier. Să introduci un
 * tipar real înseamnă: editezi aici, nicăieri altundeva.
 *
 * >>> TIPARELE DE MAI JOS SUNT PLACEHOLDER (date fictive). <<<
 * Arată doar că mecanica funcționează și ce *formă* trebuie să aibă o regulă
 * reală. Fiecare placeholder este marcat cu  // DUMMY.
 *
 * În mod intenționat nu este modul ES: astfel index.html rulează direct de pe
 * disc (file://), peste orice server static și pe GitHub Pages. Publică un
 * global: window.ZP
 * ------------------------------------------------------------------------- */

(function (root) {
  'use strict';

  /* --- Animalele care pot apărea ca Metin ------------------------------- *
   * Cheile sunt intenționat în germană: astfel încât în interfață, în
   * CSV și în exporturi apare peste tot același cuvânt, fără strat
   * de traducere care poate genera erori.
   * --------------------------------------------------------------------- */
  var ANIMALS = {
    affe:   { key: 'affe',   de: 'Maimuță', emoji: '🐒' },
    hund:   { key: 'hund',   de: 'Câine',   emoji: '🐕' },
    // Conform wiki-ului DE, documentat pe nivelurile inferioare de alegere,
    // momentan nealocat niciunui nivel. La nevoie, introdu în `animals` unui nivel.
    ratte:  { key: 'ratte',  de: 'Șobolan', emoji: '🐀' },
    ochse:  { key: 'ochse',  de: 'Bivol',   emoji: '🐂' },
    tiger:  { key: 'tiger',  de: 'Tigru',   emoji: '🐅' },
    drache: { key: 'drache', de: 'Dragon',  emoji: '🐉' }
  };

  /* --- Ce niveluri se înregistrează și ce apare acolo -------------------- *
   *
   * Fiecare nivel este o listă de pași `{hit, ok}` — exact așa cum ai nota
   * pe hârtie („38 Maimuță greșit”). Din ce ai lovit + rezultat rezultă
   * *animalul corect* singur, nimeni nu trebuie să se gândească invers.
   *
   * `maxSteps > 1` = nivel multi-nivel: dacă lovitura a fost corectă, urmează
   *                  pasul următor; dacă a fost greșită, nivelul se termină
   *                  imediat. Nivelul 7 dă bonusul conform wiki-ului după
   *                  două reușite — numărul real de pași rezultă din date,
   *                  deci `maxSteps` este intenționat generos.
   * `maxSteps === 1` = o lovitură, un rezultat.
   *
   * Nivelurile 14 și 28 lipsesc intenționat: acesta este tipul *statuie*
   * (lovește statuia, ucide cele 10 Metin apărute) — nu este nimic de ales.
   *
   * Dacă se dovedește că 35–38 sunt și multi-nivel: crește `maxSteps` aici,
   * altfel nu se schimbă nimic.
   * --------------------------------------------------------------------- */
  var FLOORS = [
    { n: 7,  animals: ['affe', 'hund'], optional: true,  maxSteps: 5 },
    { n: 21, animals: ['affe', 'hund'], optional: true,  maxSteps: 5 },
    { n: 35, animals: ['affe', 'hund'], optional: false, maxSteps: 1 },
    { n: 36, animals: ['affe', 'hund'], optional: false, maxSteps: 1 },
    { n: 37, animals: ['affe', 'hund'], optional: false, maxSteps: 1 },
    { n: 38, animals: ['affe', 'hund'], optional: false, maxSteps: 1 }
  ];

  /** Nivelul pe care îl prezicem. Greșit = fără Nivelul 40, fără Negustor. */
  var TARGET = { n: 39, animals: ['affe', 'hund'] };

  /**
   * De la câte rulări potrivite începem să ne uităm.
   *
   * Rămâne la 5: frâna reală este acum limita Wilson de jos,
   * iar aceasta ia în calcul dimensiunea eșantionului. Un număr minim
   * fix pe deasupra ar face același lucru de două ori și ar dezactiva
   * regula inutil de mult timp.
   */
  var MIN_LEARNED_SAMPLES = 5;

  /** Crește când se schimbă regulile — apare în fiecare rulare. */
  var PATTERN_VERSION = 'dummy-4';

  /* ======================================================================= *
   * Funcții ajutătoare
   * ======================================================================= */

  function seqOf(picks, floors) {
    return floors.map(function (n) { return picks[n] || '?'; }).join(',');
  }
  function other(a) { return a === 'affe' ? 'hund' : 'affe'; }
  function counts(list) {
    var c = {};
    list.forEach(function (v) { if (v) c[v] = (c[v] || 0) + 1; });
    return c;
  }
  /**
   * Limita inferioară Wilson pentru k reușite din n — estimarea *prudentă*
   * a ratei de reușită, nu cea observată.
   *
   * Motivul pentru care e nevoie de ea: k/n nu cunoaște dimensiunea eșantionului.
   * 5 din 5 înseamnă 100 %, indiferent dacă există un tipar sau o monedă a căzut
   * de cinci ori pe aceeași parte. Exact asta a afișat asistentul săptămâni
   * la rând ca „95 %”. Limita Wilson trage eșantioanele mici spre 50 %:
   * 5/5 devin 0,57, 24/30 devin 0,64, și abia câteva sute de rulări
   * permit o cifră ridicată.
   *
   * z = 1,645 (unilateral 95 %).
   */
  function wilsonLower(k, n) {
    if (!n) return 0;
    var z = 1.645, p = k / n, z2 = z * z;
    var mid = p + z2 / (2 * n);
    var margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
    return Math.max(0, (mid - margin) / (1 + z2 / n));
  }

  /** Din pașii unui nivel, secvența animalelor *corecte*. */
  function correctSeq(steps) {
    return (steps || []).map(function (s) { return s.ok ? s.hit : other(s.hit); });
  }

  /**
   * Pași per nivel -> { nivel: animalul corect }, așa cum așteaptă regulile.
   * La nivelurile multi-nivel contează ultimul animal corect.
   */
  function derivePicks(stepsByFloor) {
    var picks = {};
    Object.keys(stepsByFloor || {}).forEach(function (n) {
      var seq = correctSeq(stepsByFloor[n]);
      if (seq.length) picks[n] = seq[seq.length - 1];
    });
    return picks;
  }

  /* ======================================================================= *
   * Regulile.
   *
   * Fiecare primește `ctx` și returnează null (nu se aplică) sau
   *   { pick, confidence, why }
   * `confidence` este probabilitatea de reușită declarată; 0.5 = aruncare cu moneda.
   * Ordinea în array = prioritate, prima non-null câștigă.
   * ======================================================================= */

  var RULES = [

    /* ------------------------------------------------------------------- *
     * 1. ÎNVĂȚAT — nu este placeholder. Citește rulările proprii înregistrate
     *    și caută un dezechilibru condiționat, de la cheia cea mai specifică
     *    la cea mai generală. Regula care deja oferă ceva.
     * ----------------------------------------------------------------- */
    {
      id: 'learned',
      label: 'Rulările tale',
      kind: 'data',
      run: function (ctx) {
        var done = ctx.history.filter(function (r) { return r.actual39; });
        if (!done.length) return null;

        var full = [35, 36, 37, 38].every(function (n) { return ctx.picks[n]; });
        var keys = [
          {
            name: '35–38 exact',
            need: full,
            ok: function (r) {
              return seqOf(r.picks, [35, 36, 37, 38]) === seqOf(ctx.picks, [35, 36, 37, 38]);
            }
          },
          {
            name: '37+38',
            need: !!(ctx.picks[37] && ctx.picks[38]),
            ok: function (r) { return seqOf(r.picks, [37, 38]) === seqOf(ctx.picks, [37, 38]); }
          },
          {
            name: 'doar nivelul 38',
            need: !!ctx.picks[38],
            ok: function (r) { return r.picks[38] === ctx.picks[38]; }
          },
          { name: 'toate rulările', need: true, ok: function () { return true; } }
        ];

        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          if (!k.need) continue;
          var hits = done.filter(k.ok);
          if (hits.length < MIN_LEARNED_SAMPLES) continue;

          var c = counts(hits.map(function (r) { return r.actual39; }));
          var sorted = Object.keys(c).sort(function (a, b) { return c[b] - c[a]; });
          var top = sorted[0], n = c[top];

          /* Dezechilibrul trebuie să bată hazardul, nu doar un prag fix.
           * Înainte era `rate < 0.6` — asta flutura la o monedă cu n mic
           * constant. Acum *limita inferioară* trebuie să fie peste 50 %:
           * doar atunci tendința este mai mult decât o serie aleatorie. */
          var lower = wilsonLower(n, hits.length);
          if (lower <= 0.5) continue; // nu se distinge de hazard — următoarea cheie

          return {
            pick: top,
            confidence: Math.min(0.95, lower),
            why: 'În jurnalul tău, la ' + n + ' din ' + hits.length + ' rulări cu „' +
                 k.name + '” ' + ANIMALS[top].de + ' a fost corect pe 39 — suficiente rulări ' +
                 'încât nu mai este o fluctuație aleatorie.'
          };
        }
        return null;
      }
    },

    /* ------------------------------------------------------------------- *
     * 2. TABEL DE SECVENȚE — forma pe care ar avea-o un tipar real rezolvat:
     *    căutarea de la secvența 35→38 la răspunsul pentru 39.
     *
     *    Tabelul este GOL, și asta intenționat: nu există nicio secvență
     *    cunoscută. Atâta timp cât nu stă nimic aici, regula nu se aplică.
     *
     *    Înainte existau trei intrări inventate, ca să vezi un rezultat
     *    la testare — cu `confidence: 0.9` fixă. Astfel un placeholder
     *    afișa cea mai mare cifră din toată aplicația și suprascria
     *    regula de date reală; acelea au fost cele „90 %” care dădeau
     *    mereu greșit (7 din 13 corect). Verificat împotriva primelor 164
     *    rulări, intrarea „hund,affe,affe,affe → affe” era chiar invers
     *    (1× Maimuță, 7× Câine), celelalte două erau aruncări cu moneda.
     *
     *    Intrări noi deci abia după ce apar în date — și atunci
     *    cu `kind: 'data'` și o încredere potrivită eșantionului,
     *    nu cu o cifră frumos aleasă.
     * ----------------------------------------------------------------- */
    {
      id: 'seq-table',
      label: 'Secvență cunoscută 35→38',
      kind: 'dummy',
      table: {
        // Cheie = animale corecte pe 35,36,37,38  →  corect pe 39
        // (intenționat gol — vezi comentariul de mai sus)
      },
      run: function (ctx) {
        var key = seqOf(ctx.picks, [35, 36, 37, 38]);
        var hit = this.table[key];
        if (!hit) return null;
        return {
          pick: hit,
          confidence: 0.9,
          why: 'Secvența ' + key.split(',').map(function (k) {
            return ANIMALS[k] ? ANIMALS[k].de : k;
          }).join(' → ') + ' figurează în tabelul cunoscut.'
        };
      }
    },

    /* ------------------------------------------------------------------- *
     * 3. ALTERNARE — dacă 37 și 38 au alternat, alternarea continuă.
     *    PLACEHOLDER.
     * ----------------------------------------------------------------- */
    {
      id: 'alternate',
      label: 'Alternarea continuă',
      kind: 'dummy',
      run: function (ctx) {
        var a = ctx.picks[37], b = ctx.picks[38];
        if (!a || !b || a === b) return null;
        return {
          pick: a, // …,a,b → a
          confidence: 0.6, // DUMMY
          why: '37 și 38 au alternat (' + ANIMALS[a].de + ' → ' + ANIMALS[b].de +
               '), deci 39 revine la ' + ANIMALS[a].de + '.'
        };
      }
    },

    /* ------------------------------------------------------------------- *
     * 4. MINORITATE — animalul care a fost corect cel mai rar pe 35–38.
     *    PLACEHOLDER.
     * ----------------------------------------------------------------- */
    {
      id: 'minority',
      label: 'Cel mai rar corect până acum',
      kind: 'dummy',
      run: function (ctx) {
        var seen = [35, 36, 37, 38].map(function (n) { return ctx.picks[n]; })
          .filter(Boolean);
        if (seen.length < 2) return null;
        var c = counts(seen);
        var a = c.affe || 0, h = c.hund || 0;
        if (a === h) return null;
        var pick = a < h ? 'affe' : 'hund';
        return {
          pick: pick,
          confidence: 0.55, // DUMMY
          why: ANIMALS[pick].de + ' a fost corect pe 35–38 doar ' + Math.min(a, h) +
               '× , celălalt ' + Math.max(a, h) + '×.'
        };
      }
    }
  ];

  /** Ultima variantă de rezervă, când nimic nu se aplică. */
  var COIN = {
    id: 'coinflip',
    label: 'Niciun tipar nu se potrivește',
    kind: 'none',
    run: function () {
      return {
        pick: 'affe',
        confidence: 0.5,
        why: 'Nicio regulă nu se potrivește acestei rulări — pur și simplu un pariu 50/50. Înregistrează oricum, exact despre asta este vorba.'
      };
    }
  };

  /* ======================================================================= *
   * API public
   * ======================================================================= */

  /**
   * @param {{picks:Object, history:Array}} ctx
   * @returns {{best:Object, evaluations:Array}}
   */
  function suggest(ctx) {
    var evaluations = [];
    var best = null;

    RULES.concat([COIN]).forEach(function (rule) {
      var out = null;
      try {
        out = rule.run(ctx);
      } catch (e) {
        console.error('[patterns] Regula „' + rule.id + '” a eșuat', e);
      }
      var row = { id: rule.id, label: rule.label, kind: rule.kind, applies: !!out };
      if (out) { row.pick = out.pick; row.confidence = out.confidence; row.why = out.why; }
      evaluations.push(row);
      if (out && !best) best = JSON.parse(JSON.stringify(row));
    });

    return { best: best, evaluations: evaluations };
  }

  var API = {
    ANIMALS: ANIMALS,
    FLOORS: FLOORS,
    TARGET: TARGET,
    MIN_LEARNED_SAMPLES: MIN_LEARNED_SAMPLES,
    PATTERN_VERSION: PATTERN_VERSION,
    RULES: RULES,
    suggest: suggest,
    otherAnimal: other,
    correctSeq: correctSeq,
    derivePicks: derivePicks
  };

  root.ZP = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API; // teste Node
})(typeof window !== 'undefined' ? window : globalThis);
