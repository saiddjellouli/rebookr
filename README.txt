Calend'Air — réduction des no-shows & optimisation des créneaux
================================================================

Racine du projet (arborescence de travail) :
  c:\Users\mahfo\rebookr

Fait :
  • Stack Node.js 20+ / TypeScript, API Fastify, Prisma + PostgreSQL
  • Schéma multi-tenant aligné fiche produit (sources CSV / image / manuel / calendrier optionnel)
  • Statut initial RDV : PENDING (fiche : « en attente de confirmation »)
  • GET /api/health , GET /api/health/db

Démarrage local :
  1. Copier .env.example vers .env et renseigner DATABASE_URL (PostgreSQL).
  2. npm install
  3. npm run db:migrate:dev
  4. npm run dev              (PORT défaut 3000)

Ordre de développement : Lot 1 (fondations) → Lot 2 import CSV → …

Lot 2 (fait) : import CSV
  POST multipart /api/organizations/:organizationId/imports/csv
 • champ fichier : « file » (CSV, max ~12 Mo, limite partagée avec l’import image)
    • optionnel : « mapping » (JSON) — clés name, email, phone, date, time, datetime, duration, title
      valeurs = libellés EXACTS des colonnes du fichier
    • optionnel : « defaultTime » (ex. 09:00), « defaultDurationMinutes » (défaut 30)
  Détection automatique des colonnes (FR/EN) ; fuseau = Organization.timezone
  Réponse : importBatchId, created, skipped, errors[{ line, message }]
  422 : mapping incomplet → suggestedMapping + csvHeaders

  Créer au moins une Organization (Prisma Studio ou SQL) avant d’importer.

Lot 3 (fait) : emails Resend + confirmation / annulation + timeline multi-étapes
  Migrations : prisma/migrations/20260407120000_reminder_email_fields ; prisma/migrations/20260412120000_reminder_timeline_v2
  Variables : PUBLIC_APP_URL, RESEND_API_KEY, EMAIL_FROM ; optionnel REMINDER_WEBHOOK_URL (WhatsApp / vocal, stub + POST JSON)
  Statuts : PENDING → CONFIRMED (lien) ; AT_RISK après T-6 sans confirmation ; NO_SHOW_PROBABLE après T-1 (rebooking préventif) ;
    CANCELLED / NO_SHOW (final T+15 min après fin de créneau si toujours sans confirmation).
  Cron intégré : toutes les 10 minutes → dispatch relances + finalisation no-show (grace15 min après endsAt)
    • T-24h (~23–25 h avant) : e-mail rappel + Confirmer / Annuler (reminderT24SentAt, doublon reminderJ1SentAt)
    • T-6h (≤7 h avant) : e-mail + webhook WhatsApp (stub) ; passage AT_RISK si encore PENDING ; score −30
    • T-3h (150–200 min avant) : e-mail escalade + webhook « vocal » (stub) ; score −30 ; doublon reminderH3SentAt
    • T-1h (40–75 min avant) : dernier e-mail + WhatsApp stub ; score −30 ; statut NO_SHOW_PROBABLE ; créneau FreeSlot + liste d’attente (sans annuler le RDV source tant que le patient ne confirme pas ou qu’un rebook ne prend pas le créneau)
    • Confirmation patient (lien) : révoque les FreeSlot préventifs non pourvus ; +50 sur confirmationScore (plancher/plafond ±100).
  Rebook : si quelqu’un récupère le créneau préventif, le RDV source est annulé (cancellationReason REBOOK_FILLED).
  Déclenchement manuel : POST /api/internal/run-reminders — JSON de réponse : t24,t6,t3,t1,j1,h3,noShowFinalized, skippedNoResend
    • Si CRON_SECRET est défini dans .env : header Authorization: Bearer <CRON_SECRET>
  Pages publiques (HTML) :
    • GET /api/public/confirm/:token
    • GET /api/public/cancel/:token?reason=... (optionnel)
  Annulation : création d’un FreeSlot pour le lot rebooking

Lot 4 (fait) : rebooking + liste d’attente
  Migration : prisma/migrations/20260408120000_rebooking_tokens (tokenHash, expiresAt sur RebookingOffer)
  POST /api/organizations/:organizationId/waitlist  JSON
    • patientId (UUID) OU { name + email [, phone, serviceType, priority] }
  Après annulation (lien public) : notification automatique des entrées actives avec email,
    max 30 contacts distincts, priorité décroissante puis FIFO ; email « créneau libéré » (Resend).
  GET /api/public/rebook/:token — premier clic valide remplit le FreeSlot, crée un RDV PENDING,
    désactive l’entrée liste d’attente ; les autres reçoivent « déjà pris » si le créneau est filled.

Lot 5 (fait) : dashboard KPI + rapport quotidien
  Migration : prisma/migrations/20260409120000_daily_report_log
  Page web : GET /dashboard/:organizationId (4 cartes KPI, graphique 30 j., événements récents, charte bleu/vert/rouge/gris)
    • Bouton « Importer mon planning » : envoi CSV, analyse image (OCR) puis validation, ou copier-coller texte (extraction puis validation).
    • Bannière onboarding (fermable) + rappel client après 17 h si aucun import enregistré ce jour-là (localStorage).
  API JSON :
    GET /api/organizations/:id/dashboard/summary?from=&to= (défaut 30 j.)
    GET /api/organizations/:id/dashboard/timeseries?days=30
    GET /api/organizations/:id/dashboard/events?limit=20
  KPI principal : phrase « Vous avez récupéré : N rdv, ce qui correspond à : X euros » (N = rebooks sur la période, X = N × tarif séance).
  Champ Organization.sessionPriceCents (tarif séance, centimes). Résumé / graphique / événements : mêmes bornes ?from=&to= (YYYY-MM-DD, fuseau org).
  Taux de confirmation = confirm. / (confirm. + annul.) sur la période.
  Email « Calend'Air — Rapport du jour » : destinataires = utilisateurs role OWNER de l’org ;
    fenêtre = veille calendaire dans Organization.timezone ; anti-doublon DailyReportLog.
  Planificateur : toutes les 5 min, si heure locale = DAILY_REPORT_LOCAL_HOUR (défaut 8), envoi si pas déjà logué.
  Manuel : POST /api/internal/run-daily-reports  JSON { "force": true }  (ignore la fenêtre horaire ; CRON_SECRET si défini)
  E-mail « Pensez à importer votre planning de demain » (OWNER) : PLANNING_IMPORT_EMAIL_LOCAL_HOUR (défaut 18, fuseau org),
    anti-doublon PlanningImportReminderLog ; planificateur toutes les 5 min ; POST /api/internal/run-planning-import-nudges JSON { "force": true }

Lot 6 (fait) : auth cabinet (JWT) + routes protégées
  Variable JWT_SECRET (min. 16 caractères, voir .env.example).
  Pages : GET /register (création org + compte OWNER), GET /login (slug cabinet + email + mot de passe).
  API :
    POST /api/auth/register  JSON { organizationName, organizationSlug, ownerEmail, ownerPassword [, timezone, sessionPriceCents] }
    POST /api/auth/login JSON { organizationSlug, email, password }
    GET  /api/auth/me        header Authorization: Bearer <token>
  Protégées (Bearer + organizationId = tenant du token) :
    POST .../imports/csv , POST .../imports/image/analyze , POST .../imports/image/commit ,
    POST .../waitlist , GET .../dashboard/* ,
    GET/POST .../users , DELETE .../users/:userId (OWNER uniquement pour la gestion des users)
    POST .../appointments/:appointmentId/no-show — marque NO_SHOW, libère le créneau, notifie la liste d’attente (comme après annulation lien public)
  Publics : health, /api/public/*, /api/auth/register|login, /api/internal/* (CRON_SECRET).
  Tableau de bord web : token dans localStorage (calendair_token) après login.

  Import CSV en CLI : curl -H "Authorization: Bearer <token>" -F file=@... http://localhost:3000/api/organizations/<orgId>/imports/csv

Lot 7 (fait) : import image (OCR + validation + persistance)
  Variable optionnelle : OPENAI_API_KEY (meilleure extraction depuis le texte OCR ; sinon heuristique).
  POST multipart /api/organizations/:organizationId/imports/image/analyze
    • champ fichier : « file » (JPEG/PNG/WebP/GIF…, max ~12 Mo)
    • Réponse : ocrText, rows[{ name, email, phone, date, time, datetime, duration, title }], extractionMethod (openai | heuristic), warnings[], skippedInvalid
  POST /api/organizations/:organizationId/imports/image/commit  JSON
    • body : { "rows": [ ... ], "defaultTime"?, "defaultDurationMinutes"? } — mêmes champs qu’une ligne CSV ; source RDV = IMAGE
    • Réponse : importBatchId, created, skipped, errors[{ line, message }] (identique à l’import CSV)
  Les deux routes sont protégées (Bearer + organizationId = tenant), comme l’import CSV.

 Import texte collé (même logique d’extraction qu’après OCR, source MANUAL à l’enregistrement) :
  POST /api/organizations/:organizationId/imports/text/analyze  JSON { "text": "..." } (max 50k car.)
    → previewText, rows[], extractionMethod, warnings[], skippedInvalid
  POST /api/organizations/:organizationId/imports/text/commit  JSON { rows, defaultTime?, defaultDurationMinutes? }

Lot 8 (fait) : durcissement auth + comptes STAFF
  Migration : prisma/migrations/20260411120000_refresh_tokens (table RefreshToken, hash SHA-256)
  Variables : JWT_ACCESS_EXPIRES (défaut 15m), JWT_REFRESH_DAYS (défaut 30), JWT_SECRET inchangé
  Connexion / inscription : réponse { token, refreshToken, user, organization } — JWT court + refresh opaque
    (UI : localStorage calendair_token + calendair_refresh_token sur le tableau de bord)
  POST /api/auth/refresh  JSON { refreshToken } → nouveau token + nouveau refresh (rotation)
  POST /api/auth/logout   JSON { refreshToken } → révocation (204)
  À la connexion, les anciens refresh de l’utilisateur sont révoqués (nouvelle session).
  Réservé OWNER (Bearer + org = tenant), en plus des routes déjà protégées :
    GET    /api/organizations/:id/users  — liste (id, email, role, createdAt)
    POST   /api/organizations/:id/users  JSON { email, password } — crée un STAFF (409 EMAIL_TAKEN)
    DELETE /api/organizations/:id/users/:userId — supprime un STAFF seulement (pas soi-même, pas OWNER)
  Erreur 403 OWNER_ONLY si un STAFF appelle ces routes.

Prochain lot : enrichissements produit, OAuth calendrier, ou durcissements supplémentaires (2FA, rate limit).
