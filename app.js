/* --------------------------------------------------------------------------- *
 * app.js — Introducere pe o singură pagină, jurnalul și statisticile.
 * Toate cunoștințele despre joc sunt în patterns.js (window.ZP).
 *
 * În mod intenționat nu este modul ES, ca să ruleze și de pe file://.
 * ------------------------------------------------------------------------- */

(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* Niciodată să nu eșueze tăcut într-un panou gol. */
  function boot(fn) {
    try {
      if (!window.ZP) throw new Error('patterns.js nu a fost încărcat (lipsește window.ZP)');
      fn();
    } catch (err) {
      var box = $('bootError');
      if (box) {
        box.hidden = false;
        box.textContent = '⚠ Asistentul nu a putut porni: ' +
          (err && err.message ? err.message : err) + ' — Consola (F12) arată stiva.';
      }
      console.error('[zodiak] Pornire eșuată', err);
    }
  }

  boot(function () {

    var ANIMALS = ZP.ANIMALS, FLOORS = ZP.FLOORS, TARGET = ZP.TARGET;
    var STORE_KEY = 'm2zp.runs.v1';

    var multiFloors  = FLOORS.filter(function (f) { return f.maxSteps > 1; });
    var singleFloors = FLOORS.filter(function (f) { return f.maxSteps === 1; });

    /* =================================================================== *
     * Stocare
     * =================================================================== */

    /** Migrare rulări de la v1 engleză (monkey/dog) la cheile germane. */
    function migrate(list) {
      var map = { monkey: 'affe', dog: 'hund' };
      list.forEach(function (r) {
        Object.keys(r.picks || {}).forEach(function (n) {
          if (map[r.picks[n]]) r.picks[n] = map[r.picks[n]];
        });
        ['suggested', 'hit39', 'actual39'].forEach(function (k) {
          if (map[r[k]]) r[k] = map[r[k]];
        });
        (r.steps ? Object.keys(r.steps) : []).forEach(function (n) {
          r.steps[n].forEach(function (s) { if (map[s.hit]) s.hit = map[s.hit]; });
        });
      });
      return list;
    }

    function loadRuns() {
      try {
        var arr = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
        return Array.isArray(arr) ? migrate(arr) : [];
      } catch (e) { return []; }
    }
    function saveRuns() {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(runs)); }
      catch (e) { console.error('[stocare] Salvare eșuată', e); flash('⚠ Nu s-a putut salva — memorie plină sau blocată.'); }
    }

    var runs = loadRuns();

    /* =================================================================== *
     * Formularul
     * =================================================================== */

    function blankForm() {
      return { steps: {}, hit39: null, worked: null };
    }
    var form = blankForm();
    var suggestion = null;

    /* =================================================================== *
     * Randare
     * =================================================================== */

    function render() {
      renderFloors();
      renderTarget();
      renderRecent();
      renderStats();
      $('btnSave').disabled = !(form.hit39 && form.worked !== null);
    }

    /* --- Niveluri: fiecare este o listă de pași ------------------------- */
    function renderFloors() {
      var host = $('floorRows');
      host.innerHTML = '';
      FLOORS.forEach(function (f) { host.appendChild(floorBlock(f)); });
    }

    /** Un nivel: pas cu pas, la fiecare pas lovit + rezultat. */
    function floorBlock(f) {
      var steps = form.steps[f.n] || [];
      var block = document.createElement('div');
      block.className = 'floor-block';

      var head = document.createElement('div');
      head.className = 'fb-head';
      head.innerHTML =
        '<span class="fb-n">' + f.n + (f.optional ? '<i class="opt">opt</i>' : '') + '</span>' +
        (f.maxSteps > 1 ? '<span class="fb-hint">multi-nivel</span>' : '');
      block.appendChild(head);

      // Pași deja înregistrați + exact un pas deschis, atâta timp cât
      // ultimul a fost corect (unul greșit termină nivelul imediat).
      var lastOk = !steps.length || steps[steps.length - 1].ok;
      var rowCount = steps.length + (lastOk && steps.length < f.maxSteps ? 1 : 0);

      for (var i = 0; i < rowCount; i++) {
        block.appendChild(stepRow(f, i, steps[i]));
      }

      if (steps.length && f.maxSteps > 1) {
        var seq = ZP.correctSeq(steps);
        var sum = document.createElement('div');
        sum.className = 'fb-sum';
        sum.innerHTML = '→ corect a fost: <b>' + seq.map(function (a) {
          return ANIMALS[a].emoji + ' ' + ANIMALS[a].de;
        }).join(' , ') + '</b>' +
          (lastOk ? ' <span class="ok-tag">toți pașii corecți</span>'
                  : ' <span class="fail-tag">eșuat la pasul ' + steps.length + '</span>');
        block.appendChild(sum);
      }

      return block;
    }

    function stepRow(f, idx, step) {
      var row = document.createElement('div');
      row.className = 'step-row';

      var lab = document.createElement('span');
      lab.className = 'st-n';
      lab.textContent = f.maxSteps > 1 ? 'Pas ' + (idx + 1) : '';
      row.appendChild(lab);

      var opts = document.createElement('div');
      opts.className = 'st-opts';
      f.animals.forEach(function (key) {
        [true, false].forEach(function (ok) {
          var a = ANIMALS[key];
          var b = document.createElement('button');
          var active = step && step.hit === key && step.ok === ok;
          b.type = 'button';
          b.className = 'step pick-' + key + (ok ? ' s-ok' : ' s-fail') + (active ? ' on' : '');
          b.title = a.de + ' lovit — ' + (ok ? 'a fost corect, continuă' : 'a fost greșit, nivel terminat');
          b.innerHTML = '<span class="pick-emoji">' + a.emoji + '</span>' +
                        '<span>' + a.de + '</span>' +
                        '<span class="st-mark">' + (ok ? '✔' : '✘') + '</span>';
          b.onclick = function () {
            var list = (form.steps[f.n] || []).slice(0, idx);
            if (!active) list.push({ hit: key, ok: ok });
            if (list.length) form.steps[f.n] = list; else delete form.steps[f.n];
            recompute();
          };
          opts.appendChild(b);
        });
      });
      row.appendChild(opts);

      var clr = document.createElement('button');
      clr.type = 'button';
      clr.className = 'fr-clear' + (step ? '' : ' faded');
      clr.title = 'șterge acest pas și toți următorii';
      clr.textContent = '–';
      clr.onclick = function () {
        var list = (form.steps[f.n] || []).slice(0, idx);
        if (list.length) form.steps[f.n] = list; else delete form.steps[f.n];
        recompute();
      };
      row.appendChild(clr);

      return row;
    }

    /* --- Nivelul 39: sugestie + ce s-a întâmplat ------------------------- */
    function renderTarget() {
      var host = $('targetBox');
      host.innerHTML = '';
      if (!suggestion) return;

      var a = ANIMALS[suggestion.pick];
      var pct = Math.round(suggestion.confidence * 100);

      var card = document.createElement('div');
      card.className = 'rec-card kind-' + suggestion.kind;
      card.innerHTML =
        '<div class="rec-floor">39</div>' +
        '<div class="rec-emoji">' + a.emoji + '</div>' +
        '<div class="rec-body">' +
          '<div class="rec-label">Lovește</div>' +
          '<div class="rec-animal">' + a.de + '</div>' +
          '<div class="rec-conf"><div class="conf-bar"><i style="width:' + pct + '%"></i></div>' +
            '<span>' + pct + '% · ' + suggestion.label + '</span></div>' +
        '</div>';
      host.appendChild(card);

      var why = document.createElement('p');
      why.className = 'rec-why';
      why.textContent = suggestion.why;
      host.appendChild(why);

      if (suggestion.kind === 'dummy') {
        var w = document.createElement('p');
        w.className = 'warn-line';
        w.innerHTML = '⚠ Provine de la o <strong>regulă-placeholder</strong> — tratează-l ca pe o aruncare cu moneda, până când există tipare reale.';
        host.appendChild(w);
      }

      // Exact aceeași introducere ca la toate celelalte niveluri.
      var row39 = document.createElement('div');
      row39.className = 'step-row target-step';
      var lab39 = document.createElement('span');
      lab39.className = 'st-n';
      lab39.textContent = '39';
      row39.appendChild(lab39);
      var opts39 = document.createElement('div');
      opts39.className = 'st-opts';
      TARGET.animals.forEach(function (key) {
        [true, false].forEach(function (okFlag) {
          var a2 = ANIMALS[key];
          var active = form.hit39 === key && form.worked === okFlag;
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'step pick-' + key + (okFlag ? ' s-ok' : ' s-fail') +
                        (active ? ' on' : '') + (key === suggestion.pick ? ' suggested' : '');
          b.title = a2.de + ' lovit — ' + (okFlag ? 'Nivelul 40, Negustor' : 'eliminat');
          b.innerHTML = '<span class="pick-emoji">' + a2.emoji + '</span>' +
                        '<span>' + a2.de + '</span>' +
                        '<span class="st-mark">' + (okFlag ? '✔' : '✘') + '</span>';
          b.onclick = function () {
            if (active) { form.hit39 = null; form.worked = null; }
            else { form.hit39 = key; form.worked = okFlag; }
            recompute();
          };
          opts39.appendChild(b);
        });
      });
      row39.appendChild(opts39);
      host.appendChild(row39);

      if (form.hit39 && form.worked !== null) {
        var actual = form.worked ? form.hit39 : ZP.otherAnimal(form.hit39);
        var d = document.createElement('p');
        d.className = 'derived';
        d.innerHTML = '→ corect pe 39 a fost <b>' + ANIMALS[actual].emoji + ' ' + ANIMALS[actual].de + '</b>';
        host.appendChild(d);
      }

      host.appendChild(rulesTable());
    }

    function rulesTable() {
      var d = document.createElement('details');
      d.className = 'rules-detail';
      var body = '<summary>Ce spune fiecare regulă</summary>' +
        '<table class="rules-table"><thead><tr><th>Regulă</th><th>Zice</th><th>Încredere</th></tr></thead><tbody>';
      suggestion.evaluations.forEach(function (e) {
        body += '<tr class="' + (e.applies ? 'kind-' + e.kind : 'inactive') + '">' +
          '<td>' + e.label +
            (e.kind === 'dummy' ? ' <span class="tag-dummy">placeholder</span>' : '') +
            (e.kind === 'data' ? ' <span class="tag-data">datele tale</span>' : '') + '</td>' +
          '<td>' + (e.applies ? ANIMALS[e.pick].emoji + ' ' + ANIMALS[e.pick].de : '—') + '</td>' +
          '<td>' + (e.applies ? Math.round(e.confidence * 100) + '%' : '') + '</td></tr>';
      });
      d.innerHTML = body + '</tbody></table>';
      return d;
    }

    /* --- Ultimele rulări, cu ștergere pentru greșeli ------------------- */
    function renderRecent() {
      var host = $('recent');
      host.innerHTML = '';
      $('recentCount').textContent = runs.length ? '(' + runs.length + ' total)' : '';

      if (!runs.length) {
        host.innerHTML = '<div class="empty">Nicio rulare încă. Completează formularul de sus și <b>Salvează rularea</b>.</div>';
        return;
      }

      runs.slice(-10).reverse().forEach(function (r) {
        var row = document.createElement('div');
        row.className = 'run-row' + (r.worked ? ' ok' : ' bad');

        var parts = [];
        multiFloors.forEach(function (f) {
          var seq = ZP.correctSeq((r.steps || {})[f.n]);
          parts.push(seq.length ? seq.map(function (a) { return ANIMALS[a].emoji; }).join('') : '·');
        });
        singleFloors.forEach(function (f) {
          parts.push(r.picks[f.n] ? ANIMALS[r.picks[f.n]].emoji : '·');
        });


        row.innerHTML =
          '<span class="rr-time">' + new Date(r.ts).toLocaleString('ro-RO',
            { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) + '</span>' +
          '<span class="rr-seq" title="Niveluri ' + FLOORS.map(function (f) { return f.n; }).join(' · ') + '">' +
            parts.join(' | ') + '</span>' +
          '<span class="rr-39">39: ' + (r.actual39 ? ANIMALS[r.actual39].emoji : '?') + '</span>' +
          '<span class="rr-res">' + (r.worked ? '✅' : '❌') + '</span>';

        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'rr-del';
        del.title = 'șterge această rulare';
        del.textContent = '×';
        del.onclick = function () {
          runs = runs.filter(function (x) { return x.id !== r.id; });
          saveRuns();
          flash('Rulare ștearsă.');
          render();
        };
        row.appendChild(del);

        host.appendChild(row);
      });
    }

    /* --- coloana din dreapta --------------------------------------------- */
    function renderStats() {
      var done = runs.filter(function (r) { return r.actual39; });
      var scored = done.filter(function (r) { return r.suggested; });
      var right = scored.filter(function (r) { return r.suggested === r.actual39; }).length;
      var merch = done.filter(function (r) { return r.worked; }).length;

      $('statRuns').textContent = done.length;
      $('statMerchant').textContent = done.length
        ? merch + '/' + done.length + ' (' + Math.round(merch / done.length * 100) + '%)' : '—';
      $('statAcc').textContent = scored.length
        ? right + '/' + scored.length + ' (' + Math.round(right / scored.length * 100) + '%)' : '—';

      var edge = $('statEdge');
      if (scored.length < 10) {
        edge.textContent = scored.length ? 'mai lipsesc ' + (10 - scored.length) : 'lipsă date';
        edge.className = 'stat-v';
      } else {
        var d = Math.round((right / scored.length - 0.5) * 100);
        edge.textContent = (d > 0 ? '+' : '') + d + ' pp';
        edge.className = 'stat-v ' + (d > 3 ? 'pos' : d < -3 ? 'neg' : '');
      }

      renderDistribution(done);
      renderConditional(done);
    }

    function renderDistribution(done) {
      var host = $('dist');
      host.innerHTML = '';

      // La nivelurile multi-nivel fiecare pas contează ca observație separată.
      FLOORS.concat([TARGET]).forEach(function (f) {
        var vals = [];
        done.forEach(function (r) {
          if (f.n === TARGET.n) { if (r.actual39) vals.push(r.actual39); return; }
          var st = (r.steps || {})[f.n];
          if (st && st.length) vals = vals.concat(ZP.correctSeq(st));
          else if (r.picks[f.n]) vals.push(r.picks[f.n]);
        });
        var a = vals.filter(function (v) { return v === 'affe'; }).length;
        var h = vals.filter(function (v) { return v === 'hund'; }).length;
        var n = a + h;

        var row = document.createElement('div');
        row.className = 'dist-row' + (f.n === TARGET.n ? ' target' : '');
        row.innerHTML =
          '<span class="dr-floor">' + f.n + '</span>' +
          '<span class="dr-bar" title="' + a + '× ' + ANIMALS['affe'].de + ' / ' + h + '× ' + ANIMALS['hund'].de + '">' +
            (n ? '<i class="seg-affe" style="width:' + (a / n * 100) + '%"></i>' +
                 '<i class="seg-hund" style="width:' + (h / n * 100) + '%"></i>' : '') +
          '</span>' +
          '<span class="dr-n">' + (n ? a + '/' + h : '—') + '</span>';
        host.appendChild(row);
      });
    }

    function renderConditional(done) {
      var host = $('cond');
      host.innerHTML = '';
      var any = false;
      ['affe', 'hund'].forEach(function (given) {
        var sub = done.filter(function (r) { return r.picks[38] === given; });
        if (!sub.length) return;
        any = true;
        var a = sub.filter(function (r) { return r.actual39 === 'affe'; }).length;
        var row = document.createElement('div');
        row.className = 'cond-row';
        row.innerHTML = '<span>38 = ' + ANIMALS[given].emoji + '</span>' +
          '<span class="cond-v">→ 39 ' + ANIMALS['affe'].de + ' ' + a + '/' + sub.length + '</span>';
        host.appendChild(row);
      });
      if (!any) host.innerHTML = '<div class="cond-empty">Nimic încă — înregistrează câteva rulări.</div>';
    }

    /* =================================================================== *
     * Recalculare + salvare
     * =================================================================== */

    function recompute() {
      var res = ZP.suggest({ picks: ZP.derivePicks(form.steps), history: runs });
      suggestion = res.best;
      suggestion.evaluations = res.evaluations;
      render();
    }

    function saveRun() {
      if (!form.hit39 || form.worked === null) return;
      var actual39 = form.worked ? form.hit39 : ZP.otherAnimal(form.hit39);

      runs.push({
        id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        ts: new Date().toISOString(),
        user: whoami(),
        picks: ZP.derivePicks(form.steps),           // derivate, pentru reguli
        steps: JSON.parse(JSON.stringify(form.steps)), // datele brute
        suggested: suggestion ? suggestion.pick : null,
        ruleId: suggestion ? suggestion.id : null,
        ruleKind: suggestion ? suggestion.kind : null,
        confidence: suggestion ? suggestion.confidence : null,
        hit39: form.hit39,
        worked: form.worked,
        actual39: actual39,
        patternVersion: ZP.PATTERN_VERSION
      });
      saveRuns();

      flash(form.worked
        ? '✅ Salvat — Negustor atins. (' + runs.length + ' rulări)'
        : '❌ Salvat — deci ' + ANIMALS[actual39].de + ' a fost corect pe 39. (' + runs.length + ' rulări)');

      form = blankForm();
      recompute();
    }

    var flashTimer = null;
    function flash(msg) {
      var el = $('flash');
      el.textContent = msg;
      el.classList.add('on');
      clearTimeout(flashTimer);
      flashTimer = setTimeout(function () { el.classList.remove('on'); }, 4000);
    }

    /* =================================================================== *
     * Export / Import
     * =================================================================== */

    var COLS = ['timp', 'cine'];
    multiFloors.forEach(function (f) { COLS.push('n' + f.n, 'n' + f.n + '_bonus'); });
    singleFloors.forEach(function (f) { COLS.push('n' + f.n); });
    COLS = COLS.concat(['sugestie', 'regula', 'n39_lovit', 'n40_atins', 'n39_corect', 'versiune']);

    function rowOf(r) {
      var out = [r.ts, r.user || ''];
      multiFloors.forEach(function (f) {
        var steps = (r.steps || {})[f.n] || [];
        out.push(ZP.correctSeq(steps).map(function (a) { return ANIMALS[a].de; }).join('>'));
        out.push(steps.length && steps[steps.length - 1].ok ? 'da' : (steps.length ? 'nu' : ''));
      });
      singleFloors.forEach(function (f) {
        out.push(r.picks[f.n] ? ANIMALS[r.picks[f.n]].de : '');
      });
      return out.concat([
        r.suggested ? ANIMALS[r.suggested].de : '',
        r.ruleId || '',
        r.hit39 ? ANIMALS[r.hit39].de : '',
        r.worked ? 'da' : 'nu',
        r.actual39 ? ANIMALS[r.actual39].de : '',
        r.patternVersion || ''
      ]);
    }


    function table(sep) {
      return [COLS.join(sep)]
        .concat(runs.map(function (r) { return rowOf(r).join(sep); }))
        .join('\n');
    }

    function download(name, text, mime) {
      var url = URL.createObjectURL(new Blob([text], { type: mime }));
      var a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    $('btnCopyExcel').onclick = function () {
      if (!runs.length) return flash('Nimic de copiat încă.');
      // Tab delimitat aterizează în Excel celulă cu celulă, fără dialog de import.
      var text = table('\t');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () { flash('📋 ' + runs.length + ' rulări copiate — lipește în Excel cu Ctrl+V.'); },
          function () { fallbackCopy(text); });
      } else fallbackCopy(text);
    };

    function fallbackCopy(text) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); flash('📋 Copiat — lipește în Excel cu Ctrl+V.'); }
      catch (e) { flash('Copiere blocată de browser — folosește export CSV.'); }
      document.body.removeChild(ta);
    }

    // Punct și virgulă + BOM (﻿): astfel Excel deschide fișierul corect
    // la dublu-click, în loc să bage totul în coloana A.
    $('btnExportCsv').onclick = function () {
      download('zodiak-rulari.csv', '﻿' + table(';'), 'text/csv;charset=utf-8');
    };

    $('btnExportJson').onclick = function () {
      download('zodiak-rulari.json', JSON.stringify(runs, null, 2), 'application/json');
    };

    $('btnImport').onclick = function () { $('fileImport').click(); };

    $('fileImport').onchange = function (ev) {
      var file = ev.target.files && ev.target.files[0];
      if (!file) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var arr = JSON.parse(fr.result);
          if (!Array.isArray(arr)) throw new Error('nu este o listă');
          var known = {};
          runs.forEach(function (r) { known[r.id] = 1; });
          var fresh = migrate(arr.filter(function (r) { return r && r.id && !known[r.id]; }));
          runs = runs.concat(fresh);
          runs.sort(function (a, b) { return a.ts < b.ts ? -1 : 1; });
          saveRuns();
          flash(fresh.length + ' rulări noi importate.');
          render();
        } catch (e) {
          flash('Import eșuat — se așteaptă un fișier zodiak-rulari.json.');
          console.error(e);
        }
      };
      fr.readAsText(file);
      ev.target.value = '';
    };

    $('btnReset').onclick = function () {
      if (!runs.length) return;
      if (!confirm('Ștergi toate cele ' + runs.length + ' rulări înregistrate? Exportă sau copiază înainte.')) return;
      runs = [];
      saveRuns();
      flash('Jurnal golit.');
      render();
    };

    /* =================================================================== *
     * Pornire
     * =================================================================== */

    $('btnSave').onclick = function () {
      saveRun();
    };
    $('btnClearForm').onclick = function () { form = blankForm(); recompute(); };

    var USER_KEY = 'm2zp.user';

    function whoami() {
      try { return JSON.parse(localStorage.getItem(USER_KEY) || '""').name || ''; }
      catch (e) { return ''; }
    }

    function saveWhoami(name) {
      try {
        localStorage.setItem(USER_KEY, JSON.stringify({ name: name.trim() }));
        return true;
      } catch (e) {
        flash('⚠ Nu s-a putut salva numele — browser-ul blochează localStorage (mod incognito sau setări de confidențialitate).');
        return false;
      }
    }

    function renderWhoami() {
      var name = whoami();
      var el = $('whoami');
      var btn = $('btnWho');
      if (name) {
        el.textContent = name;
        el.style.cursor = 'default';
        el.classList.remove('whoami-empty');
        btn.textContent = 'schimbă';
        btn.style.display = '';
      } else {
        el.textContent = '⬆ apasă aici ca să-ți pui numele';
        el.style.cursor = 'pointer';
        el.classList.add('whoami-empty');
        btn.style.display = 'none';
      }
    }

    function openNamePrompt() {
      var name = prompt('Sub ce nume să apară rulările tale?', whoami());
      if (name === null) return;
      if (!name.trim()) return flash('Numele nu poate fi gol.');
      if (saveWhoami(name)) {
        renderWhoami();
        flash('Rulările se înregistrează acum ca „' + whoami() + '”.');
      }
    }

    $('btnWho').onclick = openNamePrompt;
    $('whoami').onclick = openNamePrompt;
    renderWhoami();

    /* Primă vizită fără nume: solicită automat după 1s */
    if (!whoami()) {
      setTimeout(function () {
        if (!whoami()) openNamePrompt();
      }, 1000);
    }

    $('patternVersion').textContent = ZP.PATTERN_VERSION;
    recompute();
  });
})();
