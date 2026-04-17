import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { PRODUCT_NAME } from "../product.js";

function pageHtml(organizationId: string): string {
  const id = escapeAttr(organizationId);
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${PRODUCT_NAME} — Tableau de bord</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <style>
    * { box-sizing: border-box; }
    body { margin:0; font-family: Inter, system-ui, sans-serif; background:#F3F4F6; color:#111827; }
    header { background:#fff; padding:16px 24px; box-shadow:0 1px 3px rgba(0,0,0,.06); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; }
    header strong { color:#2563EB; }
    main { max-width:1100px; margin:0 auto; padding:24px; }
    .banner { border-radius:12px; padding:14px 18px; margin-bottom:16px; display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap; font-size:14px; line-height:1.45; }
    .banner.onboarding { background:linear-gradient(135deg,#EFF6FF 0%,#DBEAFE 100%); border:1px solid #BFDBFE; }
    .banner.reminder { background:#FFFBEB; border:1px solid #FDE68A; color:#92400E; }
    .banner .actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
    .banner button.linkish { background:#2563EB; color:#fff; border:none; padding:8px 14px; border-radius:8px; font-weight:600; cursor:pointer; font-size:13px; }
    .banner button.linkish:hover { background:#1D4ED8; }
    .banner button.textbtn { background:transparent; border:none; color:#6B7280; cursor:pointer; font-size:13px; text-decoration:underline; }
    .toolbar { display:flex; flex-wrap:wrap; gap:12px; align-items:flex-end; margin-bottom:20px; background:#fff; padding:16px; border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,.08); }
    .toolbar label { display:flex; flex-direction:column; font-size:12px; color:#6B7280; font-weight:600; gap:4px; }
    .toolbar input[type="date"] { padding:8px 10px; border:1px solid #E5E7EB; border-radius:8px; font-family:inherit; }
    .toolbar button { padding:10px 18px; background:#2563EB; color:#fff; border:none; border-radius:8px; font-weight:600; cursor:pointer; }
    .toolbar button:hover { background:#1D4ED8; }
    .toolbar button.secondary { background:#059669; }
    .toolbar button.secondary:hover { background:#047857; }
    .grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(220px,1fr)); gap:16px; margin-bottom:24px; }
    .card { background:#fff; border-radius:12px; padding:20px; box-shadow:0 1px 3px rgba(0,0,0,.08); }
    .card.recovery { grid-column: 1 / -1; }
    .card.recovery .phrase { margin:0; font-size:1.15rem; line-height:1.55; color:#111827; font-weight:600; }
    .card.recovery .sub { margin:8px 0 0; font-size:13px; color:#6B7280; }
    .card h3 { margin:0 0 8px; font-size:13px; color:#6B7280; font-weight:600; text-transform:uppercase; letter-spacing:.02em; }
    .card .kpi { margin:0; font-size:1.75rem; font-weight:700; }
    .card .kpi.green { color:#16A34A; }
    .card .kpi.blue { color:#2563EB; }
    .chart-card { background:#fff; border-radius:12px; padding:20px; box-shadow:0 1px 3px rgba(0,0,0,.08); margin-bottom:24px; }
    .chart-card h2 { margin:0 0 16px; font-size:1rem; }
    .events { background:#fff; border-radius:12px; padding:20px; box-shadow:0 1px 3px rgba(0,0,0,.08); }
    .events h2 { margin:0 0 12px; font-size:1rem; }
    .events ul { list-style:none; margin:0; padding:0; }
    .events li { padding:10px 0; border-bottom:1px solid #E5E7EB; font-size:14px; display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
    .events li:last-child { border-bottom:none; }
    .tag { font-size:11px; font-weight:600; padding:2px 8px; border-radius:6px; }
    .tag.confirmed { background:#DCFCE7; color:#166534; }
    .tag.cancelled { background:#FEE2E2; color:#991B1B; }
    .tag.rebooked { background:#DBEAFE; color:#1E40AF; }
    .err { color:#DC2626; padding:16px; }
    .modal { position:fixed; inset:0; z-index:50; display:flex; align-items:center; justify-content:center; padding:16px; }
    .modal-backdrop { position:absolute; inset:0; background:rgba(17,24,39,.45); }
    .modal-box { position:relative; background:#fff; border-radius:16px; max-width:560px; width:100%; max-height:90vh; overflow:auto; padding:24px; box-shadow:0 20px 40px rgba(0,0,0,.15); }
    .modal-box h2 { margin:0 0 8px; font-size:1.15rem; color:#111827; }
    .modal-box .hint { margin:0 0 16px; font-size:13px; color:#6B7280; }
    .import-tabs { display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap; }
    .import-tabs button { padding:8px 14px; border:1px solid #E5E7EB; background:#F9FAFB; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600; color:#374151; }
    .import-tabs button.active { background:#2563EB; color:#fff; border-color:#2563EB; }
    .import-panel textarea { width:100%; min-height:140px; padding:10px; border:1px solid #E5E7EB; border-radius:8px; font-family:inherit; font-size:14px; resize:vertical; }
    .import-panel input[type="file"] { font-size:13px; margin-top:8px; }
    .import-panel .row-actions { margin-top:12px; display:flex; gap:8px; flex-wrap:wrap; }
    .import-panel button.go { padding:10px 16px; background:#2563EB; color:#fff; border:none; border-radius:8px; font-weight:600; cursor:pointer; }
    .import-panel button.go:disabled { opacity:.5; cursor:not-allowed; }
    .import-panel button.go-secondary { background:#059669; }
    #importStatus { margin-top:14px; font-size:13px; white-space:pre-wrap; }
    #importStatus.ok { color:#059669; }
    #importStatus.warn { color:#B45309; }
    #importStatus.err { color:#DC2626; }
    .preview-block { margin-top:12px; max-height:160px; overflow:auto; background:#F9FAFB; border:1px solid #E5E7EB; border-radius:8px; padding:10px; font-size:12px; }
    .modal-footer { margin-top:20px; display:flex; justify-content:flex-end; gap:8px; }
    .modal-footer button.ghost { background:transparent; border:none; color:#6B7280; cursor:pointer; font-weight:600; }
  </style>
</head>
<body>
  <header>
    <span><strong>${PRODUCT_NAME}</strong> — Tableau de bord</span>
  </header>
  <main>
    <div id="onboardingBanner" class="banner onboarding" style="display:none;">
      <div>
        <strong>En 30 secondes</strong> — importez votre planning du lendemain (CSV, photo ou texte). Vos relances anti no-show suivent automatiquement.
      </div>
      <div class="actions">
        <button type="button" class="linkish" id="btnOnboardingImport">Importer mon planning</button>
        <button type="button" class="textbtn" id="btnOnboardingDismiss">Fermer</button>
      </div>
    </div>
    <div id="smartReminder" class="banner reminder" style="display:none;">
      <div><strong>Rappel</strong> — Pensez à importer votre planning de demain pour que les confirmations partent au bon moment.</div>
      <div class="actions">
        <button type="button" class="linkish" id="btnReminderImport">Importer</button>
      </div>
    </div>

    <div class="toolbar">
      <label>Du <input type="date" id="dFrom" /></label>
      <label>Au <input type="date" id="dTo" /></label>
      <button type="button" id="btnApply">Actualiser</button>
      <button type="button" class="secondary" id="btnImportPlanning">Importer mon planning</button>
    </div>
    <div id="err" class="err" style="display:none;"></div>
    <div class="grid" id="kpis"></div>
    <div class="chart-card"><h2 id="chartTitle">Activité</h2><canvas id="chart" height="100"></canvas></div>
    <div class="events"><h2>Événements (période)</h2><ul id="evlist"></ul></div>
  </main>

  <div id="importModal" class="modal" style="display:none;" aria-hidden="true">
    <div class="modal-backdrop" id="importModalBackdrop"></div>
    <div class="modal-box" role="dialog" aria-labelledby="importModalTitle">
      <h2 id="importModalTitle">Importer mon planning</h2>
      <p class="hint">Choisissez une option — aucun réglage obligatoire pour tester. Vous pouvez corriger les lignes après analyse (image / texte) avant validation.</p>
      <div class="import-tabs">
        <button type="button" class="active" data-tab="csv">Fichier CSV</button>
        <button type="button" data-tab="img">Photo / capture</button>
        <button type="button" data-tab="txt">Copier-coller</button>
      </div>

      <div id="tabCsv" class="import-panel">
        <label style="font-size:13px;font-weight:600;color:#374151;">Fichier exporté (Excel, Doctolib, etc.)</label>
        <input type="file" id="csvFile" accept=".csv,text/csv" />
        <div class="row-actions">
          <button type="button" class="go" id="btnCsvSend">Envoyer le CSV</button>
        </div>
      </div>

      <div id="tabImg" class="import-panel" style="display:none;">
        <label style="font-size:13px;font-weight:600;color:#374151;">Image (JPG, PNG…)</label>
        <input type="file" id="imgFile" accept="image/*" />
        <div class="row-actions">
          <button type="button" class="go" id="btnImgAnalyze">Analyser</button>
          <button type="button" class="go go-secondary" id="btnImgCommit" disabled>Valider l’import</button>
        </div>
        <div id="imgPreview" class="preview-block" style="display:none;"></div>
      </div>

      <div id="tabTxt" class="import-panel" style="display:none;">
        <label style="font-size:13px;font-weight:600;color:#374151;">Collez une liste de rendez-vous (une ligne par RDV si possible)</label>
        <textarea id="pasteArea" placeholder="Ex. 2026-04-06 14:30 Dupont Jean&#10;07/04/2026 9h00 Marie — 0612345678"></textarea>
        <div class="row-actions">
          <button type="button" class="go" id="btnTxtAnalyze">Extraire les lignes</button>
          <button type="button" class="go go-secondary" id="btnTxtCommit" disabled>Valider l’import</button>
        </div>
        <div id="txtPreview" class="preview-block" style="display:none;"></div>
      </div>

      <div id="importStatus"></div>
      <div class="modal-footer">
        <button type="button" class="ghost" id="importModalClose">Fermer</button>
      </div>
    </div>
  </div>

  <script>
    const orgId = "${id}";
    const TOKEN_KEY = 'calendair_token';
    const REFRESH_KEY = 'calendair_refresh_token';
    const LS_ONBOARDING = 'calendair_onboarding_import_v1';
    const LS_LAST_IMPORT_YMD = 'calendair_last_planning_import_ymd';
    let chartInstance = null;
    let pendingRows = null;

    const fmtPct = (x) => x == null ? '—' : (Math.round(x * 1000) / 10) + ' %';

    function authHeaders() {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        window.location.href = '/login?redirect=' + encodeURIComponent(location.pathname);
        return null;
      }
      return { Authorization: 'Bearer ' + token };
    }

    async function tryRefreshToken() {
      const rt = localStorage.getItem(REFRESH_KEY);
      if (!rt) return false;
      const r = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      const j = await r.json().catch(function () { return {}; });
      if (!r.ok) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_KEY);
        return false;
      }
      localStorage.setItem(TOKEN_KEY, j.token);
      if (j.refreshToken) localStorage.setItem(REFRESH_KEY, j.refreshToken);
      return true;
    }

    async function authFetch(url, options) {
      let h = authHeaders();
      if (!h) return null;
      const opts = options || {};
      const headers = Object.assign({}, h, opts.headers || {});
      let r = await fetch(url, Object.assign({}, opts, { headers: headers }));
      if (r.status === 401) {
        if (await tryRefreshToken()) {
          h = authHeaders();
          if (!h) return null;
          const h2 = Object.assign({}, h, opts.headers || {});
          r = await fetch(url, Object.assign({}, opts, { headers: h2 }));
        }
      }
      return r;
    }

    function setImportStatus(text, cls) {
      const el = document.getElementById('importStatus');
      el.textContent = text || '';
      el.className = cls || '';
    }

    function markPlanningImportedOk() {
      localStorage.setItem(LS_LAST_IMPORT_YMD, localYmd(new Date()));
      updateReminderBanners();
    }

    function localYmd(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + da;
    }

    function updateReminderBanners() {
      const onb = document.getElementById('onboardingBanner');
      const rem = document.getElementById('smartReminder');
      if (!localStorage.getItem(LS_ONBOARDING)) {
        onb.style.display = 'flex';
      } else {
        onb.style.display = 'none';
      }
      const last = localStorage.getItem(LS_LAST_IMPORT_YMD);
      const today = localYmd(new Date());
      const h = new Date().getHours();
      if (localStorage.getItem(LS_ONBOARDING)) {
        if (last !== today && h >= 17) {
          rem.style.display = 'flex';
        } else {
          rem.style.display = 'none';
        }
      } else {
        rem.style.display = 'none';
      }
    }

    function openImportModal() {
      pendingRows = null;
      document.getElementById('btnImgCommit').disabled = true;
      document.getElementById('btnTxtCommit').disabled = true;
      document.getElementById('imgPreview').style.display = 'none';
      document.getElementById('txtPreview').style.display = 'none';
      setImportStatus('');
      document.getElementById('importModal').style.display = 'flex';
      document.getElementById('importModal').setAttribute('aria-hidden', 'false');
    }

    function closeImportModal() {
      document.getElementById('importModal').style.display = 'none';
      document.getElementById('importModal').setAttribute('aria-hidden', 'true');
    }

    function switchTab(name) {
      document.querySelectorAll('.import-tabs button').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-tab') === name);
      });
      document.getElementById('tabCsv').style.display = name === 'csv' ? 'block' : 'none';
      document.getElementById('tabImg').style.display = name === 'img' ? 'block' : 'none';
      document.getElementById('tabTxt').style.display = name === 'txt' ? 'block' : 'none';
      setImportStatus('');
    }

    function defaultRange() {
      const to = new Date();
      const from = new Date(to);
      from.setDate(from.getDate() - 30);
      return { from: localYmd(from), to: localYmd(to) };
    }

    function qs() {
      const from = document.getElementById('dFrom').value;
      const to = document.getElementById('dTo').value;
      return 'from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to);
    }

    async function load() {
      const errEl = document.getElementById('err');
      errEl.style.display = 'none';
      const h = authHeaders();
      if (!h) return;
      try {
        const q = qs();
        async function getJson(url) {
          let r = await fetch(url, { headers: h });
          if (r.status === 401) {
            const ok = await tryRefreshToken();
            if (ok) {
              const h2 = authHeaders();
              if (!h2) throw new Error('401');
              r = await fetch(url, { headers: h2 });
            }
          }
          if (r.status === 401) {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(REFRESH_KEY);
            window.location.href = '/login?redirect=' + encodeURIComponent(location.pathname);
            throw new Error('401');
          }
          if (!r.ok) throw new Error(String(r.status));
          return r.json();
        }
        const [sum, ts, ev] = await Promise.all([
          getJson('/api/organizations/' + orgId + '/dashboard/summary?' + q),
          getJson('/api/organizations/' + orgId + '/dashboard/timeseries?' + q),
          getJson('/api/organizations/' + orgId + '/dashboard/events?limit=25&' + q),
        ]);

        document.getElementById('kpis').innerHTML =
          '<div class="card recovery"><p class="phrase">' + escapeHtml(sum.recoveryKpiSentence) + '</p>' +
          '<p class="sub">Période sélectionnée · tarif séance : ' + sum.sessionPriceEuros.toFixed(2).replace('.', ',') + ' €</p></div>' +
          '<div class="card"><h3>Engagements</h3><p class="kpi blue">' + sum.noShowsAvoidedProxy + '</p></div>' +
          '<div class="card"><h3>RDV rebookés</h3><p class="kpi blue">' + sum.rebookedCount + '</p></div>' +
          '<div class="card"><h3>Taux de confirmation</h3><p class="kpi">' + fmtPct(sum.confirmationRate) + '</p></div>';

        document.getElementById('chartTitle').textContent = 'Activité du ' + ts.from + ' au ' + ts.to;

        const pts = ts.points;
        if (chartInstance) chartInstance.destroy();
        chartInstance = new Chart(document.getElementById('chart'), {
          type: 'line',
          data: {
            labels: pts.map(p => p.day),
            datasets: [
              { label: 'Confirmations', data: pts.map(p => p.confirmed), borderColor: '#16A34A', tension: 0.2 },
              { label: 'Annulations', data: pts.map(p => p.cancelled), borderColor: '#DC2626', tension: 0.2 },
              { label: 'Rebooks', data: pts.map(p => p.rebooked), borderColor: '#2563EB', tension: 0.2 },
            ],
          },
          options: {
            responsive: true,
            plugins: { legend: { position: 'bottom' } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
          },
        });

        const ul = document.getElementById('evlist');
        ul.innerHTML = ev.events.map(function(e) {
          const t = e.type === 'confirmed' ? 'confirmé' : e.type === 'cancelled' ? 'annulé' : 'rebook';
          const cls = e.type === 'confirmed' ? 'confirmed' : e.type === 'cancelled' ? 'cancelled' : 'rebooked';
          const d = new Date(e.at);
          return '<li><span><span class="tag ' + cls + '">' + t + '</span> ' + escapeHtml(e.title) +
            (e.detail ? ' — <span style="color:#6B7280">' + escapeHtml(e.detail) + '</span>' : '') +
            '</span><span style="color:#9CA3AF;font-size:12px">' + d.toLocaleString('fr-FR') + '</span></li>';
        }).join('') || '<li style="border:none;color:#6B7280">Aucun événement sur cette période.</li>';
      } catch (e) {
        if (e instanceof Error && e.message === '401') return;
        errEl.style.display = 'block';
        errEl.textContent = 'Impossible de charger le tableau de bord (droits, UUID ou dates).';
      }
    }

    function escapeHtml(s) {
      const d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
    }

    document.getElementById('btnImportPlanning').addEventListener('click', openImportModal);
    document.getElementById('btnOnboardingImport').addEventListener('click', openImportModal);
    document.getElementById('btnReminderImport').addEventListener('click', openImportModal);
    document.getElementById('btnOnboardingDismiss').addEventListener('click', function () {
      localStorage.setItem(LS_ONBOARDING, '1');
      updateReminderBanners();
    });
    document.getElementById('importModalClose').addEventListener('click', closeImportModal);
    document.getElementById('importModalBackdrop').addEventListener('click', closeImportModal);

    document.querySelectorAll('.import-tabs button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchTab(btn.getAttribute('data-tab'));
      });
    });

    document.getElementById('btnCsvSend').addEventListener('click', async function () {
      const f = document.getElementById('csvFile').files[0];
      if (!f) { setImportStatus('Choisissez un fichier CSV.', 'err'); return; }
      const fd = new FormData();
      fd.append('file', f);
      setImportStatus('Envoi…', '');
      const r = await authFetch('/api/organizations/' + orgId + '/imports/csv', { method: 'POST', body: fd });
      if (!r) { setImportStatus('Session expirée.', 'err'); return; }
      const j = await r.json().catch(function () { return {}; });
      if (r.status === 422) {
        setImportStatus('Colonnes non détectées automatiquement. Réessayez depuis l’API avec le champ « mapping » (voir README) ou un export aux en-têtes plus explicites.', 'warn');
        return;
      }
      if (!r.ok) {
        setImportStatus('Erreur ' + r.status + (j.error ? ' : ' + j.error : ''), 'err');
        return;
      }
      setImportStatus('Import terminé : ' + j.created + ' créé(s), ' + j.skipped + ' ignoré(s).', 'ok');
      if (j.errors && j.errors.length) {
        setImportStatus(document.getElementById('importStatus').textContent + '\\n' + j.errors.slice(0,5).map(function(e){ return 'L.' + e.line + ' ' + e.message; }).join('\\n'), 'ok');
      }
      markPlanningImportedOk();
      load();
    });

    document.getElementById('btnImgAnalyze').addEventListener('click', async function () {
      const f = document.getElementById('imgFile').files[0];
      if (!f) { setImportStatus('Choisissez une image.', 'err'); return; }
      const fd = new FormData();
      fd.append('file', f);
      setImportStatus('Analyse OCR…', '');
      const r = await authFetch('/api/organizations/' + orgId + '/imports/image/analyze', { method: 'POST', body: fd });
      if (!r) { setImportStatus('Session expirée.', 'err'); return; }
      const j = await r.json().catch(function () { return {}; });
      if (!r.ok) {
        setImportStatus('Erreur ' + r.status + (j.error ? ' : ' + j.error : ''), 'err');
        return;
      }
      pendingRows = j.rows || [];
      const prev = document.getElementById('imgPreview');
      prev.style.display = 'block';
      prev.textContent = (j.warnings && j.warnings.length ? j.warnings.join('\\n') + '\\n\\n' : '') +
        'Lignes détectées : ' + pendingRows.length + '\\n' + JSON.stringify(pendingRows.slice(0, 20), null, 2) + (pendingRows.length > 20 ? '\\n…' : '');
      setImportStatus(pendingRows.length ? 'Vérifiez l’aperçu puis validez.' : 'Aucune ligne — essayez une image plus nette ou le collage texte.', pendingRows.length ? 'ok' : 'warn');
      document.getElementById('btnImgCommit').disabled = !pendingRows.length;
    });

    document.getElementById('btnImgCommit').addEventListener('click', async function () {
      if (!pendingRows || !pendingRows.length) return;
      setImportStatus('Enregistrement…', '');
      const r = await authFetch('/api/organizations/' + orgId + '/imports/image/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: pendingRows }),
      });
      if (!r) { setImportStatus('Session expirée.', 'err'); return; }
      const j = await r.json().catch(function () { return {}; });
      if (!r.ok) {
        setImportStatus('Erreur ' + r.status + (j.error ? ' : ' + j.error : ''), 'err');
        return;
      }
      setImportStatus('OK : ' + j.created + ' RDV créé(s), ' + j.skipped + ' ignoré(s).', 'ok');
      markPlanningImportedOk();
      load();
    });

    document.getElementById('btnTxtAnalyze').addEventListener('click', async function () {
      const text = document.getElementById('pasteArea').value.trim();
      if (!text) { setImportStatus('Collez du texte.', 'err'); return; }
      setImportStatus('Analyse…', '');
      const r = await authFetch('/api/organizations/' + orgId + '/imports/text/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text }),
      });
      if (!r) { setImportStatus('Session expirée.', 'err'); return; }
      const j = await r.json().catch(function () { return {}; });
      if (!r.ok) {
        setImportStatus('Erreur ' + r.status + (j.error ? ' : ' + j.error : ''), 'err');
        return;
      }
      pendingRows = j.rows || [];
      const prev = document.getElementById('txtPreview');
      prev.style.display = 'block';
      prev.textContent = (j.warnings && j.warnings.length ? j.warnings.join('\\n') + '\\n\\n' : '') +
        'Lignes : ' + pendingRows.length + '\\n' + JSON.stringify(pendingRows.slice(0, 20), null, 2) + (pendingRows.length > 20 ? '\\n…' : '');
      setImportStatus(pendingRows.length ? 'Vérifiez puis validez l’import.' : 'Aucune ligne reconnue — ajoutez dates + nom (et idéalement e-mail ou téléphone) par ligne.', pendingRows.length ? 'ok' : 'warn');
      document.getElementById('btnTxtCommit').disabled = !pendingRows.length;
    });

    document.getElementById('btnTxtCommit').addEventListener('click', async function () {
      if (!pendingRows || !pendingRows.length) return;
      setImportStatus('Enregistrement…', '');
      const r = await authFetch('/api/organizations/' + orgId + '/imports/text/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: pendingRows }),
      });
      if (!r) { setImportStatus('Session expirée.', 'err'); return; }
      const j = await r.json().catch(function () { return {}; });
      if (!r.ok) {
        setImportStatus('Erreur ' + r.status + (j.error ? ' : ' + j.error : ''), 'err');
        return;
      }
      setImportStatus('OK : ' + j.created + ' RDV créé(s), ' + j.skipped + ' ignoré(s).', 'ok');
      markPlanningImportedOk();
      load();
    });

    const r = defaultRange();
    document.getElementById('dFrom').value = r.from;
    document.getElementById('dTo').value = r.to;
    document.getElementById('btnApply').addEventListener('click', load);
    updateReminderBanners();
    load();
  </script>
</body>
</html>`;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export const dashboardUiRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { organizationId: string } }>(
    "/dashboard/:organizationId",
    async (request, reply) => {
      const orgId = z.string().uuid().safeParse(request.params.organizationId);
      if (!orgId.success) {
        return reply.code(400).type("text/html; charset=utf-8").send("<p>UUID organisation invalide.</p>");
      }
      return reply.type("text/html; charset=utf-8").send(pageHtml(orgId.data));
    },
  );
};
