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
    body { margin:0; font-family: Inter, system-ui, sans-serif; background:#F6F7FB; color:#111827; }
    a { color: inherit; }
    header { background:#fff; padding:14px 28px; box-shadow:0 1px 2px rgba(0,0,0,.04); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px; }
    header .brand { font-weight:700; color:#2563EB; letter-spacing:-.01em; }
    header .right { display:flex; align-items:center; gap:10px; }
    header button { border:1px solid #E5E7EB; background:#fff; color:#111827; padding:8px 14px; border-radius:10px; font-weight:600; font-size:13px; cursor:pointer; }
    header button.primary { background:#2563EB; border-color:#2563EB; color:#fff; }
    header button.primary:hover { background:#1D4ED8; }
    header button.ghost:hover { background:#F3F4F6; }
    header .demoChip { display:none; background:#FEF3C7; color:#92400E; font-size:12px; padding:6px 12px; border-radius:999px; font-weight:600; border:1px solid #FCD34D; }
    main { max-width:1280px; margin:0 auto; padding:24px 28px; }

    .demoBar { display:none; background:linear-gradient(135deg,#FEF3C7 0%,#FDE68A 100%); border:1px solid #FCD34D; border-radius:14px; padding:14px 18px; margin-bottom:20px; font-size:14px; color:#78350F; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap; }
    .demoBar strong { color:#78350F; }
    .demoBar .presets { display:flex; gap:6px; flex-wrap:wrap; }
    .demoBar .presets button { font-size:12px; padding:6px 10px; background:#fff; border:1px solid #F59E0B; color:#92400E; border-radius:8px; cursor:pointer; font-weight:600; }
    .demoBar .presets button.current { background:#F59E0B; color:#fff; }
    .demoBar .presets button:hover:not(.current) { background:#FFFBEB; }
    .demoBar .exit { background:transparent; border:none; color:#78350F; text-decoration:underline; cursor:pointer; font-size:13px; }

    .scenarioCard { display:none; background:#fff; border:1px solid #E5E7EB; border-left:5px solid #7C3AED; border-radius:12px; padding:18px 22px; margin-bottom:20px; }
    .scenarioCard h3 { margin:0 0 4px; font-size:15px; color:#111827; letter-spacing:.2px; }
    .scenarioCard h3 .badge { display:inline-block; background:#EDE9FE; color:#5B21B6; font-size:11px; padding:3px 8px; border-radius:999px; margin-right:8px; vertical-align:middle; font-weight:700; letter-spacing:.04em; }
    .scenarioCard .lead { margin:0 0 14px; color:#6B7280; font-size:13px; line-height:1.5; }
    .scenarioCard ol { margin:0; padding-left:20px; counter-reset:wow; list-style:none; }
    .scenarioCard ol li { position:relative; padding:10px 0 10px 30px; font-size:13.5px; color:#1F2937; line-height:1.5; border-top:1px dashed #E5E7EB; }
    .scenarioCard ol li:first-child { border-top:none; }
    .scenarioCard ol li::before { counter-increment:wow; content:counter(wow); position:absolute; left:0; top:10px; width:22px; height:22px; border-radius:50%; background:#7C3AED; color:#fff; text-align:center; font-size:12px; font-weight:700; line-height:22px; }
    .scenarioCard ol li b { color:#111827; }
    .scenarioCard ol li em { color:#5B21B6; font-style:normal; font-weight:600; }
    .scenarioCard .promise { margin:14px 0 0; padding:12px 14px; background:#F5F3FF; border-radius:8px; color:#4C1D95; font-size:13px; line-height:1.5; }
    .scenarioCard .promise strong { color:#5B21B6; }

    .kpiRow { display:grid; grid-template-columns: repeat(auto-fit, minmax(220px,1fr)); gap:16px; margin-bottom:22px; }
    .kpi { background:#fff; border-radius:14px; padding:20px 22px; box-shadow:0 1px 2px rgba(0,0,0,.04); }
    .kpi .label { font-size:12px; font-weight:600; color:#6B7280; text-transform:uppercase; letter-spacing:.04em; margin:0 0 10px; }
    .kpi .value { font-size:2rem; font-weight:700; margin:0; letter-spacing:-.02em; }
    .kpi .sub { margin:6px 0 0; font-size:13px; color:#6B7280; }
    .kpi.accent .value { color:#059669; }
    .kpi.risk .value { color:#DC2626; }

    .sectionHeader { display:flex; align-items:center; justify-content:space-between; margin:0 0 12px; gap:10px; flex-wrap:wrap; }
    .sectionHeader h2 { margin:0; font-size:15px; font-weight:700; color:#111827; letter-spacing:-.01em; }
    .sectionHeader .meta { font-size:13px; color:#6B7280; }

    .panel { background:#fff; border-radius:14px; padding:18px 20px; box-shadow:0 1px 2px rgba(0,0,0,.04); margin-bottom:20px; }

    /* Planning hebdomadaire */
    .weekNav { display:flex; align-items:center; gap:6px; }
    .weekNav button { background:#fff; border:1px solid #E5E7EB; border-radius:8px; padding:4px 10px; font-size:14px; cursor:pointer; }
    .weekNav button:hover { background:#F3F4F6; }
    .weekGrid { display:grid; grid-template-columns: 56px repeat(7, 1fr); gap:1px; background:#E5E7EB; border-radius:10px; overflow:hidden; border:1px solid #E5E7EB; }
    .weekGrid .head { background:#F9FAFB; padding:8px 6px; font-size:12px; font-weight:700; color:#374151; text-align:center; }
    .weekGrid .head.today { background:#EFF6FF; color:#1D4ED8; }
    .weekGrid .hourLabel { background:#F9FAFB; padding:4px 6px; text-align:right; font-size:11px; color:#9CA3AF; font-variant-numeric: tabular-nums; border-top:1px solid #F3F4F6; }
    .weekGrid .cell { background:#fff; min-height:44px; padding:3px; position:relative; border-top:1px solid #F3F4F6; }
    .weekGrid .cell.today { background:#FAFCFF; }
    .appt { display:block; padding:4px 6px; margin-bottom:3px; border-radius:6px; font-size:11px; line-height:1.2; cursor:pointer; border-left:3px solid #6B7280; background:#F3F4F6; color:#111827; transition:transform .08s ease; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .appt:hover { transform:translateY(-1px); box-shadow:0 2px 6px rgba(0,0,0,.08); }
    .appt.low { border-left-color:#16A34A; background:#ECFDF5; }
    .appt.medium { border-left-color:#F59E0B; background:#FFFBEB; }
    .appt.high { border-left-color:#DC2626; background:#FEF2F2; }
    .appt.done { opacity:.55; text-decoration:line-through; }
    .appt .time { font-weight:600; }
    .weekLegend { display:flex; gap:12px; margin-top:10px; font-size:12px; color:#6B7280; flex-wrap:wrap; }
    .weekLegend .dot { display:inline-block; width:10px; height:10px; border-radius:3px; margin-right:5px; vertical-align:middle; }
    .weekEmpty { text-align:center; color:#9CA3AF; font-size:13px; padding:24px 0; }

    /* Chart simplifié */
    .chartToolbar { display:flex; gap:6px; align-items:center; }
    .chartToolbar button { font-size:12px; padding:5px 12px; border:1px solid #E5E7EB; background:#fff; border-radius:8px; cursor:pointer; color:#374151; font-weight:600; }
    .chartToolbar button.current { background:#2563EB; color:#fff; border-color:#2563EB; }
    #chartWrap { position:relative; height:220px; }

    /* Événements */
    .events { list-style:none; margin:0; padding:0; }
    .events li { padding:10px 0; border-bottom:1px solid #F3F4F6; font-size:13px; display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
    .events li:last-child { border-bottom:none; }
    .events .when { color:#9CA3AF; font-size:12px; }
    .tag { font-size:10px; font-weight:700; padding:2px 8px; border-radius:6px; letter-spacing:.02em; text-transform:uppercase; }
    .tag.confirmed { background:#DCFCE7; color:#166534; }
    .tag.cancelled { background:#FEE2E2; color:#991B1B; }
    .tag.rebooked { background:#DBEAFE; color:#1E40AF; }

    /* Menu démo (dropdown) */
    .demoMenu { position:relative; }
    .demoMenu .dropdown { position:absolute; right:0; top:110%; background:#fff; border:1px solid #E5E7EB; border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,.10); min-width:260px; padding:8px; display:none; z-index:30; }
    .demoMenu.open .dropdown { display:block; }
    .demoMenu .dropdown p { margin:4px 8px 8px; font-size:12px; color:#6B7280; }
    .demoMenu .dropdown button { display:block; width:100%; text-align:left; background:transparent; border:none; padding:9px 10px; font-size:13px; border-radius:8px; cursor:pointer; color:#111827; }
    .demoMenu .dropdown button:hover { background:#F3F4F6; }
    .demoMenu .dropdown .meta { display:block; font-size:11px; color:#9CA3AF; margin-top:2px; }
    .demoMenu .dropdown hr { border:none; border-top:1px solid #E5E7EB; margin:6px 0; }

    /* Side panel RDV */
    .sidepanel { position:fixed; top:0; right:0; height:100%; width:min(420px,100%); background:#fff; box-shadow:-10px 0 30px rgba(0,0,0,.12); transform:translateX(100%); transition:transform .22s ease; z-index:40; display:flex; flex-direction:column; }
    .sidepanel.open { transform:translateX(0); }
    .sidepanel header { box-shadow:none; padding:20px 22px 14px; border-bottom:1px solid #F3F4F6; justify-content:space-between; }
    .sidepanel .body { padding:18px 22px; overflow-y:auto; flex:1; }
    .sidepanel h3 { margin:0 0 6px; font-size:17px; font-weight:700; }
    .sidepanel .when { color:#6B7280; font-size:13px; margin:0 0 14px; }
    .sidepanel .riskLine { display:flex; align-items:center; gap:10px; margin:0 0 10px; font-size:14px; }
    .sidepanel .riskDot { width:12px; height:12px; border-radius:50%; }
    .sidepanel .riskDot.low { background:#16A34A; }
    .sidepanel .riskDot.medium { background:#F59E0B; }
    .sidepanel .riskDot.high { background:#DC2626; }
    .sidepanel .meta { background:#F9FAFB; padding:10px 12px; border-radius:8px; font-size:12px; color:#374151; margin:0 0 14px; line-height:1.6; }
    .sidepanel .actions { display:flex; flex-direction:column; gap:8px; margin-top:10px; }
    .sidepanel .actions button { padding:11px 14px; border-radius:10px; border:none; font-weight:600; font-size:14px; cursor:pointer; }
    .sidepanel .actions .btn-confirm { background:#059669; color:#fff; }
    .sidepanel .actions .btn-cancel { background:#DC2626; color:#fff; }
    .sidepanel .actions .btn-noshow { background:#F59E0B; color:#78350F; }
    .sidepanel .actions .btn-silence { background:#7C3AED; color:#fff; }
    .sidepanel .actions .btn-silence:hover { background:#6D28D9; }
    .sidepanel .actions .btn-pool { background:#2563EB; color:#fff; }
    .sidepanel .actions .btn-pool:hover { background:#1D4ED8; }
    .sidepanel .silenceHint { font-size:12px; color:#6B7280; margin:8px 0 0; line-height:1.45; }
    .sidepanel .poolHint { font-size:12px; color:#1E3A8A; background:#EFF6FF; border:1px solid #BFDBFE; border-radius:8px; padding:10px 12px; margin:10px 0 0; line-height:1.5; }
    .sidepanel .irrecBadge { display:inline-block; background:#FEE2E2; color:#991B1B; border:1px solid #FCA5A5; border-radius:999px; padding:4px 10px; font-size:11px; font-weight:700; margin-left:8px; }
    .sidepanel .timelineBlock { background:#F9FAFB; border:1px solid #E5E7EB; border-radius:10px; padding:14px; margin:14px 0 0; }
    .sidepanel .timelineBlock h4 { margin:0 0 4px; font-size:13px; color:#111827; font-weight:700; letter-spacing:.2px; text-transform:uppercase; }
    .sidepanel .timelineBlock p.lead { margin:0 0 12px; color:#6B7280; font-size:12px; line-height:1.5; }
    .sidepanel .windowRow { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-bottom:10px; }
    .sidepanel .windowRow button { padding:8px 0; border-radius:8px; border:1px solid #D1D5DB; background:#fff; font-size:13px; font-weight:600; cursor:pointer; color:#111827; }
    .sidepanel .windowRow button:hover { background:#F3F4F6; }
    .sidepanel .windowRow button.active { background:#1F2937; color:#fff; border-color:#1F2937; }
    .sidepanel .choiceRow { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; }
    .sidepanel .choiceRow button { padding:9px 4px; border-radius:8px; border:none; font-size:12.5px; font-weight:600; cursor:pointer; color:#fff; line-height:1.25; }
    .sidepanel .choiceRow .ch-confirm { background:#16A34A; }
    .sidepanel .choiceRow .ch-cancel { background:#DC2626; }
    .sidepanel .choiceRow .ch-silence { background:#6B7280; }
    .sidepanel .choiceRow button:hover { filter:brightness(.92); }
    .sidepanel .choiceRow button:disabled { opacity:.5; cursor:not-allowed; }
    .sidepanel .choiceWarn { font-size:11.5px; color:#7C2D12; margin:8px 0 0; line-height:1.4; }
    .sidepanel .actions button:hover { filter:brightness(.95); }
    .sidepanel .actions button:disabled { opacity:.55; cursor:not-allowed; }
    .sidepanel .backdrop { position:fixed; inset:0; background:rgba(17,24,39,.3); opacity:0; pointer-events:none; transition:opacity .22s ease; z-index:35; }
    .sidepanel.open + .spBackdrop { opacity:1; pointer-events:auto; }
    .spBackdrop { position:fixed; inset:0; background:rgba(17,24,39,.3); opacity:0; pointer-events:none; transition:opacity .22s ease; z-index:35; }
    .spMsg { font-size:13px; color:#374151; margin:12px 0 0; }
    .spMsg.ok { color:#065F46; }
    .spMsg.err { color:#991B1B; }

    .toolbar { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:16px; font-size:13px; color:#6B7280; }
    .toolbar input[type="date"] { padding:6px 10px; border:1px solid #E5E7EB; border-radius:8px; font-family:inherit; font-size:13px; }
    .toolbar button.apply { background:#fff; border:1px solid #E5E7EB; border-radius:8px; padding:6px 14px; cursor:pointer; font-weight:600; color:#111827; }
    .toolbar button.apply:hover { background:#F3F4F6; }

    .err { color:#DC2626; padding:16px; }

    /* Modal import (inchangé, version simplifiée) */
    .modal { position:fixed; inset:0; z-index:60; display:flex; align-items:center; justify-content:center; padding:16px; }
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
    <span class="brand">${PRODUCT_NAME}</span>
    <span id="demoChip" class="demoChip">Mode démo actif</span>
    <div class="right">
      <button type="button" class="ghost" id="btnImport">Importer planning</button>
      <div class="demoMenu" id="demoMenu">
        <button type="button" class="primary" id="btnDemoToggle">Mode démo</button>
        <div class="dropdown" id="demoDropdown">
          <p>Charger un scénario simulé :</p>
          <button type="button" data-preset="wow_rebook">⭐ Scénario WOW rebooking<span class="meta">3 RDV PENDING — narration guidée</span></button>
          <button type="button" data-preset="calm">Cabinet calme<span class="meta">4 RDV, signal léger</span></button>
          <button type="button" data-preset="busy_normal">Journée normale<span class="meta">7 RDV répartis sur 4 jours</span></button>
          <button type="button" data-preset="chaotic">Vendredi tendu<span class="meta">9 RDV PENDING serrés</span></button>
          <button type="button" data-preset="noshow_wave">Vague de no-shows<span class="meta">3 absences hier + 3 RDV futurs</span></button>
          <hr/>
          <button type="button" id="btnDemoExit">Sortir du mode démo</button>
        </div>
      </div>
    </div>
  </header>

  <main>
    <div id="demoBar" class="demoBar">
      <div>
        <strong>Mode démo actif</strong> — <span id="demoPresetLabel">—</span>. Cliquez sur un RDV pour déclencher des actions.
      </div>
      <div class="presets" id="demoPresetRow"></div>
      <button type="button" class="exit" id="btnDemoExitInline">Sortir du mode démo</button>
    </div>

    <div id="scenarioCard" class="scenarioCard">
      <h3><span class="badge">Scénario WOW</span>Du planning Doctolib brut au rebooking automatique</h3>
      <p class="lead">Tous les RDV partent de <b>PENDING</b> — c’est l’état que vous voyez en ouvrant Doctolib le matin. Suivez les 4 étapes : la couleur et le rebook vont apparaître <em>tout seuls</em>, sans qu’aucune main n’y touche après.</p>
      <ol>
        <li>Ouvrez le RDV <b>Alice 14h</b>, cliquez <em>« Patient confirme via lien Calend’Air »</em>. Statut → CONFIRMED + Alice rejoint le pool « créneau plus tôt » (HOT 24 h).</li>
        <li>Ouvrez le RDV <b>Bob 10h</b>, cliquez <em>« → T-6 h »</em> puis <em>« Patient inactif »</em>. Le système attend, les relances tombent.</li>
        <li>Cliquez <em>« → T-1 h »</em> sur Bob. Détection automatique <b>NO_SHOW_PROBABLE</b> → un <em>FreeSlot</em> est publié et une proposition part au pool HOT.</li>
        <li>Sur le RDV Bob, le bouton dynamique apparaît : <b>« Alice (pool HOT) a accepté — confirmer à sa place ? »</b>. Cliquez : Alice prend la place de Bob, Bob est annulé. <strong>Le créneau a été redistribué tout seul.</strong></li>
      </ol>
      <p class="promise">💡 <strong>Promesse Calend’Air :</strong> sans rien faire d’autre que forwarder vos e-mails Doctolib, vous récupérez les créneaux qui auraient été perdus. Le praticien observe ; le système redistribue.</p>
    </div>

    <div id="err" class="err" style="display:none;"></div>

    <div class="kpiRow" id="kpis"></div>

    <div class="panel">
      <div class="sectionHeader">
        <h2>Planning de la semaine</h2>
        <div class="weekNav">
          <button type="button" id="prevWeek">◂</button>
          <span class="meta" id="weekRange">—</span>
          <button type="button" id="nextWeek">▸</button>
        </div>
      </div>
      <div id="weekGrid"></div>
      <div class="weekLegend">
        <span><span class="dot" style="background:#16A34A"></span>Risque faible</span>
        <span><span class="dot" style="background:#F59E0B"></span>Risque moyen</span>
        <span><span class="dot" style="background:#DC2626"></span>Risque élevé</span>
        <span><span class="dot" style="background:#6B7280"></span>Autre / terminé</span>
      </div>
    </div>

    <div class="panel">
      <div class="sectionHeader">
        <h2>Évolution (14 derniers jours)</h2>
        <div class="chartToolbar">
          <button type="button" class="current" data-metric="confirmed">Engagements</button>
          <button type="button" data-metric="rebooked">Rebooks</button>
          <button type="button" data-metric="cancelled">Annulations</button>
        </div>
      </div>
      <div id="chartWrap"><canvas id="chart"></canvas></div>
    </div>

    <div class="panel">
      <div class="sectionHeader">
        <h2>Derniers événements</h2>
        <div class="toolbar" style="margin:0;">
          <label>Du <input type="date" id="dFrom" /></label>
          <label>Au <input type="date" id="dTo" /></label>
          <button type="button" class="apply" id="btnApply">Actualiser</button>
        </div>
      </div>
      <ul class="events" id="evlist"></ul>
    </div>
  </main>

  <!-- Side panel RDV -->
  <div class="sidepanel" id="sp">
    <header>
      <div>
        <h3 id="spTitle">—</h3>
        <p class="when" id="spWhen">—</p>
      </div>
      <button type="button" class="ghost" id="spClose" style="background:transparent;border:none;font-size:20px;cursor:pointer;line-height:1;">✕</button>
    </header>
    <div class="body">
      <div class="riskLine">
        <span class="riskDot" id="spRiskDot"></span>
        <span id="spRiskLabel">—</span>
        <span id="spIrrecBadge" class="irrecBadge" style="display:none;" title="Créneau matinal réservé tardivement : aucun rebook tenté.">Zone irrécupérable</span>
      </div>
      <div class="meta" id="spMeta">—</div>
      <div id="spActionsArea" style="display:none;">
        <div class="timelineBlock">
          <h4>Démo guidée — Fenêtres temporelles</h4>
          <p class="lead">Avancez le temps jusqu’à une fenêtre puis appliquez le choix patient. Le pipeline (relances, escalade, rebook) tourne réellement.</p>
          <div class="windowRow">
            <button type="button" data-win="T-24" id="spWinT24">→ T-24 h</button>
            <button type="button" data-win="T-6" id="spWinT6">→ T-6 h</button>
            <button type="button" data-win="T-1" id="spWinT1">→ T-1 h</button>
          </div>
          <div class="choiceRow">
            <button type="button" class="ch-confirm" id="spChConfirm">Patient confirme<br/><small style="font-weight:400;">via lien Calend’Air</small></button>
            <button type="button" class="ch-cancel" id="spChCancel">Patient annule<br/><small style="font-weight:400;">via lien Calend’Air</small></button>
            <button type="button" class="ch-silence" id="spChSilence">Patient inactif<br/><small style="font-weight:400;">silence persistant</small></button>
          </div>
          <p class="choiceWarn">⚠ Confirmer à T-24 ne garantit pas que le patient viendra : un risque résiduel reste suivi par le système.</p>
        </div>
        <p style="font-size:12px;color:#6B7280;margin:14px 0 8px;">Cycle de vie & rebook (mode démo) :</p>
        <div class="actions">
          <button type="button" class="btn-confirm" id="spActConfirm">Transfert e-mail Doctolib « confirmé » (signal)</button>
          <button type="button" class="btn-cancel" id="spActCancel">Transfert e-mail Doctolib « annulé » (libère le créneau)</button>
          <button type="button" class="btn-silence" id="spActSilence">Patient ne répond pas (+6 h)</button>
          <button type="button" class="btn-noshow" id="spActNoShow">Marquer no-show maintenant</button>
          <button type="button" class="btn-pool" id="spActPoolAccept">Un patient du pool accepte la proposition</button>
        </div>
        <p class="silenceHint">« Patient ne répond pas » avance le temps de 6 h (cliquable plusieurs fois). Le système simule la prochaine relance, fait évoluer le statut (PENDING → AT_RISK → NO_SHOW_PROBABLE → NO_SHOW), et dès « NO_SHOW_PROBABLE » (T-1) il <strong>envoie automatiquement des propositions de rebook</strong> au pool de patients en attente.</p>
        <p class="poolHint">Cœur du produit : dès qu’un no-show est détecté en avance, une proposition est envoyée à la liste d’attente / aux patients du pool. Cliquez « Un patient du pool accepte » pour simuler le premier volontaire qui clique son lien — le créneau est alors comblé.</p>
      </div>
      <p class="spMsg" id="spMsg"></p>
    </div>
  </div>
  <div class="spBackdrop" id="spBackdrop"></div>

  <!-- Import modal (inchangé fonctionnellement) -->
  <div id="importModal" class="modal" style="display:none;">
    <div class="modal-backdrop" id="importModalBackdrop"></div>
    <div class="modal-box">
      <h2>Importer mon planning</h2>
      <p class="hint">Choisissez une option — aucun réglage obligatoire pour tester.</p>
      <div class="import-tabs">
        <button type="button" class="active" data-tab="csv">Fichier CSV</button>
        <button type="button" data-tab="img">Photo / capture</button>
        <button type="button" data-tab="txt">Copier-coller</button>
      </div>
      <div id="tabCsv" class="import-panel">
        <label style="font-size:13px;font-weight:600;color:#374151;">Fichier exporté (Excel, Doctolib, etc.)</label>
        <input type="file" id="csvFile" accept=".csv,text/csv" />
        <div class="row-actions"><button type="button" class="go" id="btnCsvSend">Envoyer le CSV</button></div>
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
        <label style="font-size:13px;font-weight:600;color:#374151;">Collez des rendez-vous (une ligne par RDV)</label>
        <textarea id="pasteArea" placeholder="Ex. 2026-04-06 14:30 Dupont Jean"></textarea>
        <div class="row-actions">
          <button type="button" class="go" id="btnTxtAnalyze">Extraire</button>
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
    let chart = null;
    let currentMetric = 'confirmed';
    let weekAnchor = startOfIsoWeek(new Date()); // lundi de la semaine affichée
    let currentWeekAppts = [];
    let currentDemoState = null;
    let openAppt = null;
    let pendingRows = null;

    // ------------ Auth ------------
    function authHeaders() {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) { window.location.href = '/login?redirect=' + encodeURIComponent(location.pathname); return null; }
      return { Authorization: 'Bearer ' + token };
    }
    async function tryRefreshToken() {
      const rt = localStorage.getItem(REFRESH_KEY);
      if (!rt) return false;
      const r = await fetch('/api/auth/refresh', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ refreshToken: rt }) });
      const j = await r.json().catch(()=>({}));
      if (!r.ok) { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(REFRESH_KEY); return false; }
      localStorage.setItem(TOKEN_KEY, j.token);
      if (j.refreshToken) localStorage.setItem(REFRESH_KEY, j.refreshToken);
      return true;
    }
    async function api(url, opts) {
      const h = authHeaders(); if (!h) return null;
      const o = Object.assign({}, opts || {}, { headers: Object.assign({}, h, (opts && opts.headers) || {}) });
      let r = await fetch(url, o);
      if (r.status === 401 && await tryRefreshToken()) {
        const h2 = authHeaders(); if (!h2) return null;
        r = await fetch(url, Object.assign({}, opts || {}, { headers: Object.assign({}, h2, (opts && opts.headers) || {}) }));
      }
      return r;
    }

    // ------------ Helpers ------------
    function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s==null?'':String(s); return d.innerHTML; }
    function localYmd(d) { const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), a=String(d.getDate()).padStart(2,'0'); return y+'-'+m+'-'+a; }
    function startOfIsoWeek(d) {
      const c = new Date(d); c.setHours(0,0,0,0);
      const day = (c.getDay() + 6) % 7; c.setDate(c.getDate() - day); return c;
    }
    function endOfIsoWeek(d) { const e = new Date(startOfIsoWeek(d)); e.setDate(e.getDate()+6); e.setHours(23,59,59,999); return e; }
    function addDays(d, n) { const c = new Date(d); c.setDate(c.getDate()+n); return c; }
    function fmtFr(d) { return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short' }); }
    function fmtFrLong(d) { return d.toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'long' }); }
    function hhmm(d) { return d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' }); }
    function fmtPct(x) { return x==null ? '—' : (Math.round(x*1000)/10)+' %'; }
    function eurStr(e) { return (Math.round(e*100)/100).toLocaleString('fr-FR',{minimumFractionDigits:0,maximumFractionDigits:2})+' €'; }
    function sinceLabel(iso) { const d=new Date(iso), s=Math.round((Date.now()-d.getTime())/60000); if (s<1) return "à l’instant"; if (s<60) return 'il y a '+s+' min'; const h=Math.floor(s/60); if (h<24) return 'il y a '+h+' h'; return d.toLocaleString('fr-FR'); }

    // ------------ KPIs ------------
    async function loadKpis() {
      const to = localYmd(new Date()); const from = localYmd(addDays(new Date(), -30));
      const q = 'from=' + from + '&to=' + to;
      const rSum = await api('/api/organizations/' + orgId + '/dashboard/summary?' + q);
      const rRisk = await api('/api/organizations/' + orgId + '/appointments?riskMin=60&from=' + new Date().toISOString().slice(0,10) + 'T00:00:00Z&to=' + new Date().toISOString().slice(0,10) + 'T23:59:59Z&limit=50');
      if (!rSum || !rRisk) return;
      const sum = rSum.ok ? await rSum.json() : null;
      const risk = rRisk.ok ? await rRisk.json() : { count: 0 };
      const kpis = document.getElementById('kpis');
      if (!sum) { kpis.innerHTML = '<div class="kpi"><p class="label">Erreur</p><p class="value">—</p></div>'; return; }
      kpis.innerHTML =
        '<div class="kpi accent"><p class="label">Récupéré (30 j)</p><p class="value">' + eurStr(sum.recoveredFromRebooksEuros || 0) + '</p><p class="sub">' + (sum.rebookedCount||0) + ' RDV rebookés · tarif séance ' + eurStr(sum.sessionPriceEuros||0) + '</p></div>' +
        '<div class="kpi"><p class="label">Taux de confirmation</p><p class="value">' + fmtPct(sum.confirmationRate) + '</p><p class="sub">' + (sum.confirmedCount||0) + ' confirmés · ' + (sum.cancelledCount||0) + ' annulés</p></div>' +
        '<div class="kpi risk"><p class="label">RDV à risque aujourd’hui</p><p class="value">' + (risk.count||0) + '</p><p class="sub">Score ≥ 60 (voir planning)</p></div>';
    }

    // ------------ Planning semaine ------------
    function formatWeekRange() {
      const s = weekAnchor; const e = addDays(s, 6);
      document.getElementById('weekRange').textContent = 'Semaine du ' + fmtFr(s) + ' au ' + fmtFr(e);
    }
    async function loadWeek() {
      formatWeekRange();
      const from = new Date(weekAnchor); from.setHours(0,0,0,0);
      const to = addDays(from, 7); to.setSeconds(-1);
      const q = 'from=' + from.toISOString() + '&to=' + to.toISOString() + '&limit=200&sort=time';
      const r = await api('/api/organizations/' + orgId + '/appointments?' + q);
      if (!r) return;
      if (!r.ok) { document.getElementById('weekGrid').innerHTML = '<p class="weekEmpty">Impossible de charger le planning.</p>'; return; }
      const j = await r.json();
      currentWeekAppts = j.appointments || [];
      renderWeek();
    }
    function renderWeek() {
      const grid = document.getElementById('weekGrid');
      if (currentWeekAppts.length === 0) {
        grid.className = '';
        grid.innerHTML = '<p class="weekEmpty">Aucun rendez-vous sur cette semaine — importez votre planning ou lancez le mode démo.</p>';
        return;
      }
      grid.className = 'weekGrid';

      const byDayHour = new Map();
      let minHour = 23, maxHour = 8;
      for (const a of currentWeekAppts) {
        const d = new Date(a.startsAt);
        const dayIdx = Math.max(0, Math.min(6, Math.round((new Date(d.getFullYear(),d.getMonth(),d.getDate()) - new Date(weekAnchor.getFullYear(),weekAnchor.getMonth(),weekAnchor.getDate())) / 86400000)));
        const h = d.getHours();
        if (h < minHour) minHour = h;
        if (h >= maxHour) maxHour = h + 1;
        const k = dayIdx + ':' + h;
        if (!byDayHour.has(k)) byDayHour.set(k, []);
        byDayHour.get(k).push(a);
      }
      if (minHour > maxHour) { minHour = 8; maxHour = 19; }
      minHour = Math.max(6, Math.min(minHour, 22));
      maxHour = Math.min(23, Math.max(maxHour, minHour + 2));

      const today = new Date(); today.setHours(0,0,0,0);
      let html = '<div class="head"></div>';
      for (let di=0; di<7; di++) {
        const dd = addDays(weekAnchor, di);
        const isToday = dd.getTime() === today.getTime();
        html += '<div class="head' + (isToday?' today':'') + '">' + dd.toLocaleDateString('fr-FR',{weekday:'short'}) + '<br/><span style="font-size:11px;color:#9CA3AF;">' + dd.getDate() + '</span></div>';
      }
      for (let h=minHour; h<=maxHour; h++) {
        html += '<div class="hourLabel">' + String(h).padStart(2,'0') + ':00</div>';
        for (let di=0; di<7; di++) {
          const dd = addDays(weekAnchor, di);
          const isToday = dd.getTime() === today.getTime();
          html += '<div class="cell' + (isToday?' today':'') + '">';
          const list = byDayHour.get(di + ':' + h) || [];
          for (const a of list) {
            const d = new Date(a.startsAt);
            const band = (a.riskBand || 'low').toLowerCase();
            const statusClass = (a.status === 'CANCELLED' || a.status === 'COMPLETED' || a.status === 'NO_SHOW') ? ' done' : '';
            const name = a.patient && (a.patient.name || a.patient.email) || a.title || 'RDV';
            html += '<a class="appt ' + band + statusClass + '" data-id="' + escapeHtml(a.id) + '" title="' + escapeHtml(name) + ' · ' + a.status + ' · risque ' + a.riskScore + '/100"><span class="time">' + hhmm(d) + '</span> ' + escapeHtml(shortName(name)) + '</a>';
          }
          html += '</div>';
        }
      }
      grid.innerHTML = html;
      grid.querySelectorAll('.appt').forEach(function(el) {
        el.addEventListener('click', function(e) { e.preventDefault(); openAppointmentPanel(el.getAttribute('data-id')); });
      });
    }
    function shortName(n) { return n.length > 18 ? n.slice(0, 17) + '…' : n; }

    // ------------ Chart ------------
    async function loadChart() {
      const to = localYmd(new Date()); const from = localYmd(addDays(new Date(), -13));
      const r = await api('/api/organizations/' + orgId + '/dashboard/timeseries?from=' + from + '&to=' + to);
      if (!r || !r.ok) return;
      const j = await r.json();
      renderChart(j.points || []);
    }
    const METRIC_CFG = {
      confirmed: { label: 'Engagements', color: '#16A34A', fill: 'rgba(22,163,74,.10)' },
      rebooked: { label: 'Rebooks', color: '#2563EB', fill: 'rgba(37,99,235,.10)' },
      cancelled: { label: 'Annulations', color: '#DC2626', fill: 'rgba(220,38,38,.10)' },
    };
    function renderChart(points) {
      const cfg = METRIC_CFG[currentMetric];
      const ctx = document.getElementById('chart');
      if (chart) chart.destroy();
      chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: points.map(function(p){ return new Date(p.day).toLocaleDateString('fr-FR',{day:'2-digit',month:'short'}); }),
          datasets: [{
            label: cfg.label,
            data: points.map(function(p){ return p[currentMetric] || 0; }),
            borderColor: cfg.color,
            backgroundColor: cfg.fill,
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            pointBackgroundColor: cfg.color,
            pointHoverRadius: 5,
            borderWidth: 2.5,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
          scales: {
            x: { grid: { display: false }, ticks: { maxTicksLimit: 7, color: '#9CA3AF' } },
            y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0, color: '#9CA3AF' }, grid: { color: '#F3F4F6' } },
          },
          interaction: { mode: 'nearest', axis: 'x', intersect: false },
        },
      });
    }

    // ------------ Événements ------------
    async function loadEvents() {
      const to = localYmd(new Date()); const from = localYmd(addDays(new Date(), -30));
      const r = await api('/api/organizations/' + orgId + '/dashboard/events?limit=8&from=' + from + '&to=' + to);
      if (!r || !r.ok) return;
      const j = await r.json();
      const ul = document.getElementById('evlist');
      ul.innerHTML = (j.events || []).map(function(e) {
        const t = e.type === 'confirmed' ? 'Confirmé' : e.type === 'cancelled' ? 'Annulé' : 'Rebook';
        return '<li><span><span class="tag ' + e.type + '">' + t + '</span> ' + escapeHtml(e.title) +
          (e.detail ? ' — <span style="color:#6B7280">' + escapeHtml(e.detail) + '</span>' : '') +
          '</span><span class="when">' + sinceLabel(e.at) + '</span></li>';
      }).join('') || '<li style="color:#9CA3AF">Aucun événement récent.</li>';
    }

    // ------------ Mode démo ------------
    async function loadDemoState() {
      const r = await api('/api/organizations/' + orgId + '/demo/state');
      if (!r) return;
      if (!r.ok) { currentDemoState = null; updateDemoUI(); return; }
      currentDemoState = await r.json();
      updateDemoUI();
    }
    function updateDemoUI() {
      const active = currentDemoState && (currentDemoState.demoScenarioAppointmentCount || 0) > 0;
      document.getElementById('demoChip').style.display = active ? 'inline-block' : 'none';
      const bar = document.getElementById('demoBar');
      bar.style.display = active ? 'flex' : 'none';
      if (!active) {
        document.getElementById('scenarioCard').style.display = 'none';
      }
      if (active) {
        const presets = currentDemoState.availablePresets || [];
        const current = currentDemoState.currentPreset || 'busy_normal';
        const row = document.getElementById('demoPresetRow');
        row.innerHTML = presets.map(function(p){ return '<button type="button" data-preset="' + p.name + '"' + (p.name===current?' class="current"':'') + '>' + escapeHtml(p.description.split(' — ')[0]) + '</button>'; }).join('');
        row.querySelectorAll('button').forEach(function(b){ b.addEventListener('click', function(){ switchDemoPreset(b.getAttribute('data-preset')); }); });
        const label = (presets.find(function(p){ return p.name === current; }) || {}).description || current;
        document.getElementById('demoPresetLabel').textContent = label;
        document.getElementById('scenarioCard').style.display = (current === 'wow_rebook') ? 'block' : 'none';
      }
    }
    async function switchDemoPreset(name) {
      const r = await api('/api/organizations/' + orgId + '/demo/scenario/preset/' + encodeURIComponent(name), { method: 'POST' });
      if (!r || !r.ok) return alert('Impossible de charger le scénario démo.');
      await loadDemoState();
      await Promise.all([loadKpis(), loadWeek(), loadChart(), loadEvents()]);
    }
    async function exitDemo() {
      if (!confirm('Sortir du mode démo ? Les RDV simulés seront supprimés.')) return;
      const r = await api('/api/organizations/' + orgId + '/demo/scenario', { method: 'DELETE' });
      if (!r || !r.ok) return alert('Impossible de sortir du mode démo.');
      await loadDemoState();
      await Promise.all([loadKpis(), loadWeek(), loadChart(), loadEvents()]);
      closeSp();
    }

    // ------------ Side panel RDV ------------
    function openAppointmentPanel(aptId) {
      const a = currentWeekAppts.find(function(x){ return x.id === aptId; });
      if (!a) return;
      openAppt = a;
      const d = new Date(a.startsAt);
      const name = a.patient && (a.patient.name || a.patient.email) || a.title;
      document.getElementById('spTitle').textContent = name;
      document.getElementById('spWhen').textContent = fmtFrLong(d) + ' · ' + hhmm(d);
      const band = (a.riskBand || 'low').toLowerCase();
      const dot = document.getElementById('spRiskDot');
      dot.className = 'riskDot ' + band;
      document.getElementById('spRiskLabel').textContent = 'Risque ' + band.toUpperCase() + ' · ' + a.riskScore + '/100';
      var irrecBadge = document.getElementById('spIrrecBadge');
      irrecBadge.style.display = a.irrecoverableZone ? 'inline-block' : 'none';
      const metaParts = [
        'Statut : <strong>' + a.status + '</strong>',
        'Dernière MAJ : ' + (a.planningLastUpdateSource || '—') + ' (silence ' + (a.silenceDurationHours || 0) + ' h)',
        'Signaux de confirmation : ' + (a.confirmationSignalCount || 0),
      ];
      if (a.irrecoverableZone) {
        metaParts.push('<strong style="color:#991B1B;">Zone irrécupérable</strong> — créneau matinal réservé tardivement, aucun rebook tenté en cas de no-show.');
      }
      if (a.patient && a.patient.email) metaParts.push('Email : ' + a.patient.email);
      document.getElementById('spMeta').innerHTML = metaParts.join('<br/>');
      // Marquer la fenêtre la plus proche comme suggestion (visuel "active")
      try {
        const hoursToStart = (new Date(a.startsAt).getTime() - Date.now()) / 3600000;
        ['T24','T6','T1'].forEach(function(k){ document.getElementById('spWin'+k).classList.remove('active'); });
        if (hoursToStart > 12) document.getElementById('spWinT24').classList.add('active');
        else if (hoursToStart > 3) document.getElementById('spWinT6').classList.add('active');
        else if (hoursToStart > -1) document.getElementById('spWinT1').classList.add('active');
      } catch(_e) {}

      const isDemoPatient = a.patient && a.patient.email && a.patient.email.endsWith('@calendair.invalid');
      const demoActive = currentDemoState && (currentDemoState.demoScenarioAppointmentCount || 0) > 0;
      const area = document.getElementById('spActionsArea');
      area.style.display = (isDemoPatient && demoActive) ? 'block' : 'none';
      document.getElementById('spMsg').textContent = '';
      document.getElementById('spMsg').className = 'spMsg';
      // Reset du bouton pool-accept, sera enrichi par loadPoolProposal()
      var btnPool = document.getElementById('spActPoolAccept');
      btnPool.textContent = 'Un patient du pool accepte la proposition';
      btnPool.disabled = true;
      btnPool.title = 'Aucune proposition publiée pour ce RDV — cliquez d’abord « Patient ne répond pas ».';
      document.getElementById('sp').classList.add('open');
      document.getElementById('spBackdrop').style.opacity = '1';
      document.getElementById('spBackdrop').style.pointerEvents = 'auto';
      if (isDemoPatient && demoActive) loadPoolProposal(a.id);
    }
    async function loadPoolProposal(aptId) {
      var btn = document.getElementById('spActPoolAccept');
      try {
        const r = await api('/api/organizations/' + orgId + '/demo/appointments/' + aptId + '/pool-proposal');
        if (!r || !r.ok) { btn.disabled = true; return; }
        const j = await r.json();
        if (!openAppt || openAppt.id !== aptId) return; // panneau changé pendant le fetch
        if (j.filledAt) {
          btn.textContent = 'Créneau déjà comblé ✓';
          btn.disabled = true;
          btn.title = 'Le créneau a déjà été pris par un patient du pool.';
          return;
        }
        if (!j.firstCandidate) {
          btn.textContent = 'Aucun patient en attente pour l’instant';
          btn.disabled = true;
          btn.title = j.freeSlotId
            ? 'Le créneau est publié mais aucun patient éligible dans le pool / liste d’attente.'
            : 'Aucune proposition publiée — cliquez « Patient ne répond pas » jusqu’à NO_SHOW_PROBABLE.';
          return;
        }
        var name = j.firstCandidate.name || j.firstCandidate.email || 'Un patient';
        var kindLabel = j.firstCandidate.kind === 'hot_list' ? 'pool HOT'
          : j.firstCandidate.kind === 'waitlist' ? 'liste d’attente'
          : 'RDV futur';
        btn.textContent = name + ' (' + kindLabel + ') a accepté — confirmer à sa place ?';
        btn.disabled = false;
        btn.title = j.totalPendingOffers + ' proposition(s) en attente de clic.';
      } catch (_e) { btn.disabled = true; }
    }
    function closeSp() {
      openAppt = null;
      document.getElementById('sp').classList.remove('open');
      document.getElementById('spBackdrop').style.opacity = '0';
      document.getElementById('spBackdrop').style.pointerEvents = 'none';
    }
    function setSpMsg(text, cls) {
      const el = document.getElementById('spMsg');
      el.textContent = text || '';
      el.className = 'spMsg ' + (cls || '');
    }
    async function spConfirm() {
      if (!openAppt || !openAppt.patient || !openAppt.patient.email) return;
      setSpMsg('Transfert e-mail Doctolib « confirmé » en cours…');
      const dateLine = buildDateLine(new Date(openAppt.startsAt));
      const r = await api('/api/organizations/' + orgId + '/demo/simulate/inbound-email', {
        method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ action:'confirm', patientEmail: openAppt.patient.email, dateLine: dateLine }),
      });
      const j = r ? await r.json().catch(()=>({})) : {};
      if (!r || !r.ok) { setSpMsg('Erreur : ' + (j.error || 'inconnue'), 'err'); return; }
      setSpMsg('Signal Doctolib enregistré (statut reste PENDING — seule notre système juge la fiabilité). ' + (j.detail || ''), 'ok');
      await Promise.all([loadKpis(), loadWeek(), loadEvents()]);
      if (openAppt) loadPoolProposal(openAppt.id);
    }
    async function spCancel() {
      if (!openAppt || !openAppt.patient || !openAppt.patient.email) return;
      setSpMsg('Transfert e-mail Doctolib « annulé » en cours…');
      const dateLine = buildDateLine(new Date(openAppt.startsAt));
      const r = await api('/api/organizations/' + orgId + '/demo/simulate/inbound-email', {
        method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ action:'cancel', patientEmail: openAppt.patient.email, dateLine: dateLine }),
      });
      const j = r ? await r.json().catch(()=>({})) : {};
      if (!r || !r.ok) { setSpMsg('Erreur : ' + (j.error || 'inconnue'), 'err'); return; }
      setSpMsg('Annulation Doctolib enregistrée — créneau libéré, liste d’attente notifiée.', 'ok');
      await Promise.all([loadKpis(), loadWeek(), loadEvents()]);
    }
    async function spNoShow() {
      if (!openAppt) return;
      setSpMsg('Marquage no-show…');
      const r = await api('/api/organizations/' + orgId + '/demo/appointments/' + openAppt.id + '/simulate-no-show', { method: 'POST' });
      const j = r ? await r.json().catch(()=>({})) : {};
      if (!r || !r.ok) { setSpMsg('Erreur : ' + (j.error || 'inconnue'), 'err'); return; }
      setSpMsg('No-show enregistré — créneau publié (FreeSlot : ' + (j.freeSlotId || '—') + ')', 'ok');
      await Promise.all([loadKpis(), loadWeek(), loadEvents()]);
    }
    async function spAdvanceSilence() {
      if (!openAppt) return;
      setSpMsg('Simulation du silence (+6 h)…');
      const r = await api('/api/organizations/' + orgId + '/demo/appointments/' + openAppt.id + '/advance-silence', {
        method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ hours: 6 }),
      });
      const j = r ? await r.json().catch(()=>({})) : {};
      if (!r || !r.ok) { setSpMsg('Erreur : ' + (j.error || 'inconnue'), 'err'); return; }
      setSpMsg(j.message || 'Silence simulé.', 'ok');
      // Recharger le planning, puis rouvrir le panneau (qui redéclenche loadPoolProposal).
      const movedId = openAppt.id;
      await Promise.all([loadKpis(), loadWeek(), loadEvents()]);
      const moved = currentWeekAppts.find(function(x){ return x.id === movedId; });
      if (moved) openAppointmentPanel(moved.id);
    }
    async function spJumpWindow(win) {
      if (!openAppt) return;
      setSpMsg('Translation du temps vers ' + win + '…');
      const r = await api('/api/organizations/' + orgId + '/demo/appointments/' + openAppt.id + '/jump-to-window', {
        method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ window: win }),
      });
      const j = r ? await r.json().catch(()=>({})) : {};
      if (!r || !r.ok) {
        var errMap = {
          TARGET_IN_PAST: 'Le RDV est déjà passé cette fenêtre — choisissez une fenêtre plus proche.',
          TERMINAL_STATUS: 'RDV en statut terminal (annulé/no-show/complété).',
        };
        setSpMsg('Impossible : ' + (errMap[j.error] || j.error || 'erreur inconnue'), 'err');
        return;
      }
      var advMsg = j.advanceResult && j.advanceResult.message ? ' · ' + j.advanceResult.message : '';
      setSpMsg(j.message + advMsg, 'ok');
      const movedId = openAppt.id;
      await Promise.all([loadKpis(), loadWeek(), loadEvents()]);
      const moved = currentWeekAppts.find(function(x){ return x.id === movedId; });
      if (moved) openAppointmentPanel(moved.id);
    }
    async function spChoice(choice) {
      if (!openAppt) return;
      var labels = { confirm: 'Patient confirme via lien…', cancel: 'Patient annule via lien…', silence: 'Patient inactif…' };
      setSpMsg(labels[choice] || '…');
      const r = await api('/api/organizations/' + orgId + '/demo/appointments/' + openAppt.id + '/apply-choice', {
        method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ choice: choice }),
      });
      const j = r ? await r.json().catch(()=>({})) : {};
      if (!r || !r.ok) { setSpMsg('Impossible : ' + (j.error || 'inconnue') + (j.detail?(' · '+j.detail):''), 'err'); return; }
      setSpMsg(j.message || 'Choix appliqué.', 'ok');
      const movedId = openAppt.id;
      await Promise.all([loadKpis(), loadWeek(), loadEvents()]);
      const moved = currentWeekAppts.find(function(x){ return x.id === movedId; });
      if (moved) openAppointmentPanel(moved.id);
    }
    async function spPoolAccept() {
      if (!openAppt) return;
      setSpMsg('Un patient du pool clique son lien de rebook…');
      const r = await api('/api/organizations/' + orgId + '/demo/appointments/' + openAppt.id + '/simulate-pool-accept', {
        method: 'POST',
      });
      const j = r ? await r.json().catch(()=>({})) : {};
      if (!r || !r.ok) {
        var errMap = {
          NO_FREE_SLOT: 'Aucune proposition n’a encore été publiée pour ce RDV. Cliquez d’abord « Patient ne répond pas » jusqu’à atteindre NO_SHOW_PROBABLE.',
          NO_PENDING_OFFER: 'Aucun patient en attente n’a reçu de proposition (liste d’attente vide et pas de RDV futurs éligibles).',
          SLOT_ALREADY_FILLED: 'Le créneau a déjà été comblé.',
          RACE_LOST: 'Un autre patient a cliqué en même temps.',
          FORBIDDEN_ORG: 'Accès refusé.',
          APPOINTMENT_NOT_FOUND: 'RDV introuvable.',
        };
        setSpMsg('Impossible : ' + (errMap[j.error] || j.error || 'erreur inconnue'), 'err');
        return;
      }
      setSpMsg(j.message || 'Créneau comblé.', 'ok');
      await Promise.all([loadKpis(), loadWeek(), loadEvents()]);
      // On garde le panneau ouvert sur le RDV source (désormais CANCELLED) pour voir l’effet.
      const moved = currentWeekAppts.find(function(x){ return x.id === openAppt.id; });
      if (moved) openAppointmentPanel(moved.id);
    }
    function buildDateLine(d) {
      const dd = String(d.getDate()).padStart(2,'0'); const mm = String(d.getMonth()+1).padStart(2,'0'); const yy = d.getFullYear();
      const hh = String(d.getHours()).padStart(2,'0'); const mi = String(d.getMinutes()).padStart(2,'0');
      return 'du ' + dd + '/' + mm + '/' + yy + ' à ' + hh + ':' + mi;
    }

    // ------------ Import modal ------------
    function openImportModal() { pendingRows = null; document.getElementById('btnImgCommit').disabled = true; document.getElementById('btnTxtCommit').disabled = true; document.getElementById('imgPreview').style.display='none'; document.getElementById('txtPreview').style.display='none'; setImportStatus(''); document.getElementById('importModal').style.display='flex'; }
    function closeImportModal() { document.getElementById('importModal').style.display='none'; }
    function setImportStatus(t, c) { const el=document.getElementById('importStatus'); el.textContent = t||''; el.className = c||''; }
    function switchTab(name) { document.querySelectorAll('.import-tabs button').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-tab')===name); }); document.getElementById('tabCsv').style.display=name==='csv'?'block':'none'; document.getElementById('tabImg').style.display=name==='img'?'block':'none'; document.getElementById('tabTxt').style.display=name==='txt'?'block':'none'; setImportStatus(''); }

    document.getElementById('btnImport').addEventListener('click', openImportModal);
    document.getElementById('importModalClose').addEventListener('click', closeImportModal);
    document.getElementById('importModalBackdrop').addEventListener('click', closeImportModal);
    document.querySelectorAll('.import-tabs button').forEach(function(b){ b.addEventListener('click', function(){ switchTab(b.getAttribute('data-tab')); }); });

    document.getElementById('btnCsvSend').addEventListener('click', async function () {
      const f = document.getElementById('csvFile').files[0];
      if (!f) return setImportStatus('Choisissez un fichier CSV.', 'err');
      const fd = new FormData(); fd.append('file', f); setImportStatus('Envoi…');
      const r = await api('/api/organizations/' + orgId + '/imports/csv', { method:'POST', body: fd });
      const j = r ? await r.json().catch(()=>({})) : {};
      if (!r || !r.ok) return setImportStatus('Erreur ' + (r?r.status:'?') + (j.error?' : '+j.error:''), 'err');
      setImportStatus('OK : ' + j.created + ' créé(s), ' + j.skipped + ' ignoré(s).', 'ok');
      await Promise.all([loadKpis(), loadWeek(), loadChart(), loadEvents()]);
    });
    document.getElementById('btnImgAnalyze').addEventListener('click', async function () {
      const f = document.getElementById('imgFile').files[0]; if (!f) return setImportStatus('Choisissez une image.', 'err');
      const fd = new FormData(); fd.append('file', f); setImportStatus('Analyse OCR…');
      const r = await api('/api/organizations/' + orgId + '/imports/image/analyze', { method:'POST', body: fd });
      const j = r ? await r.json().catch(()=>({})) : {}; if (!r || !r.ok) return setImportStatus('Erreur ' + (r?r.status:'?') + (j.error?' : '+j.error:''), 'err');
      pendingRows = j.rows || [];
      document.getElementById('imgPreview').style.display='block';
      document.getElementById('imgPreview').textContent = 'Lignes : ' + pendingRows.length + '\\n' + JSON.stringify(pendingRows.slice(0,20), null, 2);
      document.getElementById('btnImgCommit').disabled = !pendingRows.length;
      setImportStatus(pendingRows.length ? 'Vérifiez puis validez.' : 'Aucune ligne — retry.', pendingRows.length?'ok':'warn');
    });
    document.getElementById('btnImgCommit').addEventListener('click', async function () {
      if (!pendingRows || !pendingRows.length) return;
      setImportStatus('Enregistrement…');
      const r = await api('/api/organizations/' + orgId + '/imports/image/commit', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ rows: pendingRows }) });
      const j = r ? await r.json().catch(()=>({})) : {}; if (!r || !r.ok) return setImportStatus('Erreur ' + (r?r.status:'?') + (j.error?' : '+j.error:''), 'err');
      setImportStatus('OK : ' + j.created + ' créé(s).', 'ok');
      await Promise.all([loadKpis(), loadWeek(), loadChart(), loadEvents()]);
    });
    document.getElementById('btnTxtAnalyze').addEventListener('click', async function () {
      const t = document.getElementById('pasteArea').value.trim(); if (!t) return setImportStatus('Collez du texte.', 'err');
      setImportStatus('Analyse…');
      const r = await api('/api/organizations/' + orgId + '/imports/text/analyze', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text: t }) });
      const j = r ? await r.json().catch(()=>({})) : {}; if (!r || !r.ok) return setImportStatus('Erreur ' + (r?r.status:'?') + (j.error?' : '+j.error:''), 'err');
      pendingRows = j.rows || [];
      document.getElementById('txtPreview').style.display='block';
      document.getElementById('txtPreview').textContent = 'Lignes : ' + pendingRows.length + '\\n' + JSON.stringify(pendingRows.slice(0,20), null, 2);
      document.getElementById('btnTxtCommit').disabled = !pendingRows.length;
      setImportStatus(pendingRows.length ? 'Vérifiez puis validez.' : 'Aucune ligne reconnue.', pendingRows.length?'ok':'warn');
    });
    document.getElementById('btnTxtCommit').addEventListener('click', async function () {
      if (!pendingRows || !pendingRows.length) return;
      setImportStatus('Enregistrement…');
      const r = await api('/api/organizations/' + orgId + '/imports/text/commit', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ rows: pendingRows }) });
      const j = r ? await r.json().catch(()=>({})) : {}; if (!r || !r.ok) return setImportStatus('Erreur ' + (r?r.status:'?') + (j.error?' : '+j.error:''), 'err');
      setImportStatus('OK : ' + j.created + ' créé(s).', 'ok');
      await Promise.all([loadKpis(), loadWeek(), loadChart(), loadEvents()]);
    });

    // ------------ Wiring ------------
    document.getElementById('prevWeek').addEventListener('click', function(){ weekAnchor = addDays(weekAnchor, -7); loadWeek(); });
    document.getElementById('nextWeek').addEventListener('click', function(){ weekAnchor = addDays(weekAnchor, 7); loadWeek(); });

    document.querySelectorAll('.chartToolbar button').forEach(function(b) {
      b.addEventListener('click', function() {
        document.querySelectorAll('.chartToolbar button').forEach(function(x){ x.classList.remove('current'); });
        b.classList.add('current');
        currentMetric = b.getAttribute('data-metric');
        loadChart();
      });
    });

    const demoMenu = document.getElementById('demoMenu');
    document.getElementById('btnDemoToggle').addEventListener('click', function(e){ e.stopPropagation(); demoMenu.classList.toggle('open'); });
    document.addEventListener('click', function(){ demoMenu.classList.remove('open'); });
    document.getElementById('demoDropdown').addEventListener('click', function(e){ e.stopPropagation(); });
    document.querySelectorAll('#demoDropdown button[data-preset]').forEach(function(b) {
      b.addEventListener('click', function(){ demoMenu.classList.remove('open'); switchDemoPreset(b.getAttribute('data-preset')); });
    });
    document.getElementById('btnDemoExit').addEventListener('click', function(){ demoMenu.classList.remove('open'); exitDemo(); });
    document.getElementById('btnDemoExitInline').addEventListener('click', exitDemo);

    document.getElementById('spClose').addEventListener('click', closeSp);
    document.getElementById('spBackdrop').addEventListener('click', closeSp);
    document.getElementById('spActConfirm').addEventListener('click', spConfirm);
    document.getElementById('spActCancel').addEventListener('click', spCancel);
    document.getElementById('spActSilence').addEventListener('click', spAdvanceSilence);
    document.getElementById('spActNoShow').addEventListener('click', spNoShow);
    document.getElementById('spActPoolAccept').addEventListener('click', spPoolAccept);
    document.getElementById('spWinT24').addEventListener('click', function(){ spJumpWindow('T-24'); });
    document.getElementById('spWinT6').addEventListener('click', function(){ spJumpWindow('T-6'); });
    document.getElementById('spWinT1').addEventListener('click', function(){ spJumpWindow('T-1'); });
    document.getElementById('spChConfirm').addEventListener('click', function(){ spChoice('confirm'); });
    document.getElementById('spChCancel').addEventListener('click', function(){ spChoice('cancel'); });
    document.getElementById('spChSilence').addEventListener('click', function(){ spChoice('silence'); });

    document.getElementById('btnApply').addEventListener('click', loadEvents);
    const today = new Date(); document.getElementById('dTo').value = localYmd(today); document.getElementById('dFrom').value = localYmd(addDays(today,-30));

    // First paint
    (async function() {
      await loadDemoState();
      await Promise.all([loadKpis(), loadWeek(), loadChart(), loadEvents()]);
    })();
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
