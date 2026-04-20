# Calend’Air — principes d’architecture (réalité terrain)

Document de référence : le produit est **imparfait mais utile**, résilient au chaos, **démontrable**.

Les agents et contributeurs doivent s’y conformer plutôt qu’à un « workflow idéal ».

---

## 1. Principe central

Le système **ne doit jamais dépendre** :

- d’une confirmation utilisateur comme seule vérité ;
- d’un workflow parfait (tous les mails lus, tous les clics faits) ;
- d’une source unique de vérité.

Il **doit fonctionner** avec :

- des données incomplètes ;
- des signaux faibles ;
- des événements asynchrones (e-mail, import, actions humaines).

---

## 2. Changement de paradigme

| Incorrect | Correct |
|-----------|---------|
| Système **centré** sur confirmation / annulation explicite | Système **centré** sur la **détection de risque** et les **actions** (relances, pool, rebook quand un créneau **existe**) |

Les confirmations (liens, Doctolib, téléphone non modélisé) sont des **signaux** qui **ajustent** le risque — pas une condition d’existence du produit.

---

## 3. Modèle réel par rendez-vous

- **`risk_score` (0–100)** : probabilité / gravité de perte (no-show, créneau perdu), recalculée au fil des signaux.
- **Signaux** : silence, proximité du RDV, relances envoyées (sans supposer de réponse), accusés e-mail partiels, clic patient si présent, statut métier (annulé, etc.).

Exemple de lecture produit : *silence prolongé + RDV proche → risque élevé* ; *confirmation explicite reçue → risque faible*.

---

## 4. Relances = signal, pas vérité

Les relances ne garantissent **pas** une réponse. Elles servent à :

- **mesurer** l’engagement (ou l’absence de réponse) ;
- **alimenter** le moteur de risque ;
- **proposer** des actions (pool, priorité, rebook **quand** un créneau est réellement libre).

Ne pas vendre « tout le monde confirme par notre mail ».

---

## 5. Pool = ressource limitée

- Au début, le pool est **petit ou vide** : le système **doit quand même** être cohérent (détection, alertes, préparation).
- Le pool se **construit progressivement** (opt-in, liste d’attente, réponses aux messages d’anticipation).
- Les propositions de **rebook** concernent des **créneaux réels** ; pas de promesse de créneau fictif.

---

## 6. E-mail forwarding = signal partiel

- Les accusés (ex. Doctolib) **ne couvrent pas** tous les patients ni tous les canaux.
- Traiter ces e-mails comme **indices** qui mettent à jour statut / signaux / risque quand le matching est fiable.
- **Ne jamais** supposer que « tout passe par l’e-mail ».

---

## 7. Mode démo = fonctionnalité produit

- Permettre **simulation contrôlée**, scénarios reproductibles, événements déclenchables **sans** données client.
- La démo utilise le **même backend** que la prod pour prouver le comportement (détection, risque, pool, rebook).
- À mettre en avant **commercialement** : montrer le système dans le désordre, pas seulement le bonheur-path.

---

## 8. Objectif produit

Un système qui :

- fonctionne dans le **désordre réel** ;
- **détecte** les risques tôt ;
- **agit** pour limiter la perte (relances, pool, rebook) ;
- reste **facile à démontrer**.

---

## 9. Règle finale

**Calend’Air n’est pas un agenda.**  
C’est un système de **détection** et de **récupération de valeur**, probabiliste, alimenté par des signaux imparfaits.

---

FIN
