import type { FastifyPluginAsync } from "fastify";
import { PRODUCT_NAME } from "../product.js";

function shell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title}</title>
  <style>
    body { margin:0; font-family: Inter, system-ui, sans-serif; background:#F3F4F6; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; }
    .box { background:#fff; padding:32px; border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,.08); width:100%; max-width:400px; }
    h1 { margin:0 0 8px; font-size:1.25rem; color:#2563EB; }
    p { margin:0 0 20px; color:#6B7280; font-size:14px; }
    label { display:block; font-size:12px; color:#374151; font-weight:600; margin-bottom:4px; }
    input { width:100%; padding:10px 12px; margin-bottom:14px; border:1px solid #E5E7EB; border-radius:8px; font:inherit; box-sizing:border-box; }
    button { width:100%; padding:12px; background:#2563EB; color:#fff; border:none; border-radius:8px; font-weight:600; cursor:pointer; }
    button:hover { background:#1D4ED8; }
    .err { color:#DC2626; font-size:13px; margin-bottom:12px; display:none; }
    a { color:#2563EB; }
  </style>
</head>
<body>
  <div class="box">
    <h1>${PRODUCT_NAME}</h1>
    ${body}
  </div>
</body>
</html>`;
}

export const authUiRoutes: FastifyPluginAsync = async (app) => {
  app.get("/login", async (_request, reply) => {
    const html = shell(
      `${PRODUCT_NAME} — Connexion`,
      `<p>Connexion au tableau de bord</p>
      <div id="err" class="err"></div>
      <form id="f">
        <label>Identifiant cabinet (slug)</label>
        <input name="organizationSlug" required placeholder="mon-cabinet" autocomplete="organization"/>
        <label>Email</label>
        <input name="email" type="email" required autocomplete="username"/>
        <label>Mot de passe</label>
        <input name="password" type="password" required autocomplete="current-password"/>
        <button type="submit">Se connecter</button>
      </form>
      <p style="margin-top:16px;margin-bottom:0;font-size:13px;">Pas encore de compte ? <a href="/register">Créer un cabinet</a></p>
      <script>
        document.getElementById('f').onsubmit = async function(e) {
          e.preventDefault();
          const err = document.getElementById('err');
          err.style.display = 'none';
          const fd = new FormData(e.target);
          const body = Object.fromEntries(fd.entries());
          const r = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) { err.textContent = j.error === 'INVALID_CREDENTIALS' ? 'Identifiants incorrects.' : (j.error || 'Erreur'); err.style.display = 'block'; return; }
          localStorage.setItem('calendair_token', j.token);
          if (j.refreshToken) localStorage.setItem('calendair_refresh_token', j.refreshToken);
          const red = new URLSearchParams(location.search).get('redirect');
          window.location.href = red || ('/dashboard/' + j.organization.id);
        };
      </script>`,
    );
    return reply.type("text/html; charset=utf-8").send(html);
  });

  app.get("/register", async (_request, reply) => {
    const html = shell(
      `${PRODUCT_NAME} — Inscription`,
      `<p>Créer votre cabinet et un compte administrateur</p>
      <p style="font-size:13px;color:#059669;margin-top:-8px;">Astuce : une fois connecté, importez le planning du lendemain en ~30 s (CSV, photo ou copier-coller) depuis le tableau de bord.</p>
      <div id="err" class="err"></div>
      <form id="f">
        <label>Nom du cabinet</label>
        <input name="organizationName" required placeholder="Cabinet Dupont"/>
        <label>Slug (URL, minuscules)</label>
        <input name="organizationSlug" required placeholder="cabinet-dupont" pattern="[a-z0-9]+(-[a-z0-9]+)*"/>
        <label>Email administrateur</label>
        <input name="ownerEmail" type="email" required autocomplete="email"/>
        <label>Mot de passe (8 caractères min.)</label>
        <input name="ownerPassword" type="password" required minlength="8" autocomplete="new-password"/>
        <label>Fuseau (optionnel)</label>
        <input name="timezone" placeholder="Europe/Paris"/>
        <label>Tarif séance (centimes, optionnel)</label>
        <input name="sessionPriceCents" type="number" min="0" step="1" placeholder="5000 = 50 €"/>
        <button type="submit">Créer le compte</button>
      </form>
      <p style="margin-top:16px;margin-bottom:0;font-size:13px;">Déjà inscrit ? <a href="/login">Connexion</a></p>
      <script>
        document.getElementById('f').onsubmit = async function(e) {
          e.preventDefault();
          const err = document.getElementById('err');
          err.style.display = 'none';
          const fd = new FormData(e.target);
          const o = Object.fromEntries(fd.entries());
          const body = {
            organizationName: o.organizationName,
            organizationSlug: o.organizationSlug,
            ownerEmail: o.ownerEmail,
            ownerPassword: o.ownerPassword,
          };
          if (o.timezone && String(o.timezone).trim()) body.timezone = String(o.timezone).trim();
          if (o.sessionPriceCents !== undefined && String(o.sessionPriceCents).trim() !== '') {
            body.sessionPriceCents = Number(o.sessionPriceCents);
          }
          const r = await fetch('/api/auth/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) {
            err.textContent = j.error === 'ORG_SLUG_TAKEN' ? 'Ce slug est déjà utilisé.' : (j.error || 'Erreur');
            err.style.display = 'block';
            return;
          }
          localStorage.setItem('calendair_token', j.token);
          if (j.refreshToken) localStorage.setItem('calendair_refresh_token', j.refreshToken);
          window.location.href = '/dashboard/' + j.organization.id;
        };
      </script>`,
    );
    return reply.type("text/html; charset=utf-8").send(html);
  });
};
