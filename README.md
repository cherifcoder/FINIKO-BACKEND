# FINIKO v2 — Blanchisserie & Pressing

> Dossier de conception et de développement de la plateforme FINIKO.
> Application mobile multi-rôles (Client, Livreur, Pressing, Administrateur) pour Bamako, Mali.

---

## 0. Démarrage rapide

**Prérequis** : Node.js ≥ 22.11 (24 LTS recommandé), pnpm ≥ 10, Docker Desktop (MongoDB 7 en replica set + Redis), Android Studio ou un appareil avec Expo Go / dev client.

```bash
pnpm install
cp .env.example .env
cp apps/mobile/.env.example apps/mobile/.env

pnpm db:up          # MongoDB replica set rs0 + Redis
pnpm dev:api        # API sur http://localhost:3000
pnpm dev:mobile     # Expo, puis "a" pour Android
```

**Vérifications**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

**Points d'entrée API** : `GET /health` (liveness), `GET /ready` (MongoDB), `GET /api/v1` (descripteur). Authentification : `/api/v1/auth/register`, `/login`, `/refresh`, `/logout`, `/otp/request`, `/otp/verify`, `/password/forgot`, `/password/reset`, `/password/change`, `/me`. Administration des comptes : `/api/v1/admin/users`.

> En développement, `OTP_EXPOSE_CODE=true` renvoie le code SMS dans la réponse et l'écran de vérification l'affiche. En production, le code part uniquement par SMS et cette option est refusée au démarrage.

> Sur un appareil physique, remplacer `EXPO_PUBLIC_API_URL` par l'IP LAN du poste (`http://192.168.x.x:3000/api/v1`). L'émulateur Android utilise `10.0.2.2`.
>
> Sans Docker, un MongoDB local en mode standalone permet de tester `/health`, `/ready` et l'authentification, mais **pas** les transactions du moteur de quota : il faut un replica set pour les lots 2 et suivants.

**Contenu livré** : monorepo pnpm, contrats Zod partagés, API Express 5 + Mongoose avec santé, erreurs normalisées, logs Pino, rate limit et CORS ; **lot 1 authentification** (inscription client, login email/téléphone, Argon2id, JWT + refresh rotatif par famille, OTP SMS, mot de passe oublié, changement forcé, RBAC, audit, gestion admin des comptes) ; app Expo Router avec accueil, connexion, inscription, OTP, mot de passe oublié, changement de mot de passe et espace authentifié ; CI GitHub Actions ; Docker MongoDB replica set + Redis.

---

## 1. Vision produit

FINIKO connecte en temps réel quatre populations :

| Acteur             | Promesse                                                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| **Client**         | Commander son linge en 3 minutes, suivre chaque étape, payer avec Orange Money ou utiliser son pack mensuel.                     |
| **Livreur**        | Recevoir des missions claires, être guidé par GPS, vérifier la conformité du linge et faire avancer la commande d'un seul geste. |
| **Pressing**       | Réceptionner, traiter et déclarer prêt le linge, article par article, sans ambiguïté sur les prestations.                        |
| **Administrateur** | Piloter le catalogue, les tarifs, les packs, les comptes, les affectations, le chiffre d'affaires et les litiges.                |

Le produit est pensé **mobile-first Android**, en français, avec une connexion parfois instable, des montants en **FCFA entiers** et un paiement dominant **Orange Money Mali**.

---

## 2. Décisions structurantes

| Sujet                | Décision                                                                   | Justification                                                                                                                             |
| -------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Organisation du code | **Monorepo pnpm** : `apps/mobile`, `apps/api`, `packages/contracts`        | Contrats Zod partagés, une seule vérité pour les types et validations.                                                                    |
| Mobile               | **React Native 0.88 + Expo SDK 58 + Expo Router 58 + TypeScript 6 strict** | Continuité avec le v1, OTA updates, builds EAS, grande vitesse d'itération.                                                               |
| UI                   | **StyleSheet + design system maison**                                      | Tokens centralisés, zéro dépendance de styling supplémentaire ; NativeWind est reporté après validation de sa compatibilité avec RN 0.88. |
| État serveur         | **TanStack Query v5**                                                      | Cache, invalidation, retry, offline partiel, mutations optimistes.                                                                        |
| État local           | **Zustand** (auth, panier/brouillon, préférences)                          | Léger, sans boilerplate, adapté à React 19.                                                                                               |
| Formulaires          | **Zod partagé**, puis React Hook Form pour les formulaires métier          | Validation identique mobile/API ; les écrans d'auth du lot 1 utilisent un état local minimal.                                             |
| Backend              | **Node.js 24 LTS + Express 5 + TypeScript 6 strict**                       | Simplicité, écosystème, continuité v1 ; monolithe modulaire suffisant pour le MVP.                                                        |
| Base de données      | **MongoDB 7 (replica set Atlas)**                                          | Flexible pour le catalogue, géo-indexation native, transactions multi-documents.                                                          |
| Cache / files        | **Redis 7 + BullMQ**                                                       | Vérrous/idempotence, jobs de paiement, notifications, expirations.                                                                        |
| Temps réel           | **Socket.IO** + fallback polling                                           | Suivi de commande et tableau de bord pressing/livreur.                                                                                    |
| Paiement             | **Orange Money Mali** via un adaptateur `PaymentProvider`                  | Le reste du code ne dépend pas du fournisseur ; Web Payment + webhook + réconciliation.                                                   |
| Cartes               | **Google Maps** (SDK Android/iOS + Places/Directions via proxy serveur)    | Sélection de points de ramassage/livraison et guidage GPS.                                                                                |
| Notifications        | **Expo Push (FCM)** + SMS de secours                                       | FCM pour le temps réel, SMS pour les événements critiques.                                                                                |
| Fichiers             | **Cloudinary** (signature côté serveur)                                    | Photos de linge, preuves de livraison, litiges.                                                                                           |
| Observabilité        | **Pino + Sentry + OpenTelemetry**                                          | Diagnostic rapide des incidents de paiement et de mission.                                                                                |

> **Pourquoi MongoDB plutôt que SQL ?** Le v1 est déjà MongoDB, le catalogue est naturellement documentaire et les besoins relationnels forts (quota, paiement) sont couverts par des transactions MongoDB sur replica set. Le document [`docs/02-donnees.md`](docs/02-donnees.md) fournit néanmoins un **schéma PostgreSQL complet** si la contrainte d'équipe impose SQL.

---

## 3. Ce qui change par rapport au v1

Le v1 est une bonne base de démonstration, mais il lui manque les briques critiques du cahier des charges :

| Limite v1                                                      | Correction v2                                                                                        |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `Package` = simple produit tarifaire, sans quota ni abonnement | Collections `packs` **et** `subscriptions`, ledger `subscription_usages`, moteur de quota atomique   |
| Aucune déduction de quota                                      | Réservation → consommation → libération/remboursement, avec garde de concurrence                     |
| Paiement `wave`/`mobile_money` simulé, pas d'Orange Money      | Adaptateur Orange Money réel : initiation, redirection, webhook signé, réconciliation, remboursement |
| Pas de suivi article par article au pressing                   | `items[].treatmentStatus` + événements de statut append-only                                         |
| Affectation livreur/pressing absente                           | Champs d'affectation, événements, tableau d'assignation admin, auto-dispatch optionnel               |
| Pas d'audit, pas de litiges, pas de zones de livraison         | `audit_logs`, `disputes`, `delivery_zones`, `promo_banners`                                          |
| Contrôle de rôle uniquement côté navigation                    | RBAC + **ownership** vérifié côté API sur chaque ressource                                           |
| Pas de versioning des prix/packs                               | Snapshot des prix et des conditions du pack dans la commande/abonnement                              |

---

## 4. Structure cible du dépôt

```text
2026_10_21___FINIKO v2/
├── apps/
│   ├── mobile/                  # Expo / React Native
│   │   ├── app/                 # routes Expo Router
│   │   ├── src/
│   │   │   ├── api/             # client HTTP, queries, mutations
│   │   │   ├── components/      # UI kit + composants métier
│   │   │   ├── features/        # auth, catalog, orders, packs, missions...
│   │   │   ├── stores/          # Zustand
│   │   │   ├── theme/           # tokens, typographie, dark mode
│   │   │   ├── lib/             # formatage, geo, validation, storage
│   │   │   └── types/
│   │   ├── assets/
│   │   └── app.json / eas.json
│   └── api/
│       ├── src/
│       │   ├── config/          # env, db, redis, logger, swagger
│       │   ├── modules/         # auth, users, catalog, packs, subscriptions,
│       │   │                    # orders, payments, logistics, pressings,
│       │   │                    # notifications, disputes, admin, uploads
│       │   ├── models/          # schémas Mongoose
│       │   ├── middleware/      # auth, rbac, validate, idempotency, errors
│       │   ├── jobs/            # BullMQ workers
│       │   ├── sockets/         # namespaces et rooms
│       │   ├── utils/
│       │   ├── app.ts
│       │   └── server.ts
│       ├── tests/
│       └── openapi.yaml
├── packages/
│   └── contracts/               # schémas Zod + types + constantes partagés
├── docs/
│   ├── 01-architecture.md
│   ├── 02-donnees.md
│   ├── 03-user-flows.md
│   ├── 04-api.md
│   ├── 05-mobile.md
│   ├── 06-paiements-maps.md
│   ├── 07-securite-exploitation.md
│   └── 08-roadmap.md
├── docker-compose.yml           # MongoDB replica set + Redis + API
├── pnpm-workspace.yaml
└── README.md
```

> Le socle et le **lot 1 (authentification, comptes, profils)** sont scaffoldés et validés (lint, typecheck, tests, build, export web Expo). Le lot 2 (catalogue, packs, moteur de quota transactionnel) est la prochaine étape (voir [`docs/08-roadmap.md`](docs/08-roadmap.md)).

---

## 5. Parcours de lecture recommandé

1. **[Architecture](docs/01-architecture.md)** — vue système, monorepo, modules, événements, déploiement.
2. **[Modèle de données](docs/02-donnees.md)** — ERD, 25 collections, schémas Mongoose, DDL PostgreSQL, invariants de quota.
3. **[User flows](docs/03-user-flows.md)** — parcours des 4 rôles, machine à états, séquences, cas limites.
4. **[Contrat API](docs/04-api.md)** — endpoints, RBAC, payloads, erreurs, Socket.IO.
5. **[Architecture mobile](docs/05-mobile.md)** — routes, écrans, design system, offline, Maps.
6. **[Paiements & cartes](docs/06-paiements-maps.md)** — Orange Money, webhooks, réconciliation, Google Maps.
7. **[Sécurité & exploitation](docs/07-securite-exploitation.md)** — menaces, RGPD/APDP, CI/CD, runbooks.
8. **[Roadmap](docs/08-roadmap.md)** — lots, critères d'acceptation, risques, estimatifs.

---

## 6. Conventions transverses

| Élément      | Convention                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------- |
| Montants     | Entiers en **FCFA** (`amountXOF: 15000`), jamais de flottants.                                    |
| Dates        | ISO 8601 UTC (`2026-11-02T18:30:00.000Z`), affichage local `Africa/Bamako` (UTC+0).               |
| Identifiants | `ObjectId` MongoDB exposé en `id` (string) ; numéros lisibles `#FK-1001`, `FK-L-001`, `FK-P-001`. |
| Téléphone    | Format E.164 (`+22370000000`), unique.                                                            |
| Statuts      | `snake_case` français, source de vérité dans `packages/contracts`.                                |
| Réponse API  | `{ success, data, meta?, message?, error? }`.                                                     |
| Erreurs      | Code métier stable (`QUOTA_EXHAUSTED`, `PAYMENT_FAILED`…) + message français.                     |
| Suppression  | **Soft delete** (`deletedAt`) pour les comptes, articles et packs déjà utilisés.                  |
| Idempotence  | En-tête `Idempotency-Key` obligatoire sur création de commande, abonnement et paiement.           |
| Traçabilité  | Toute transition de commande et toute action admin écrit un événement immuable.                   |

---

## 7. Périmètre du MVP

**Inclus** : auth client, gestion admin des comptes, catalogue 3 tarifs, packs/abonnements, quota, commande avec couverture pack + surplus Orange Money, carte ramassage/livraison, affectation livreur/pressing, conformité, traitement article par article, livraison, suivi temps réel, notifications, dashboard admin, litiges simples, audit.

**Reporté en V1.1** : paiement carte bancaire, multi-pressing automatique par optimisation, fidélité/parrainage, web admin complet, iOS production, langues nationales, facturation PDF, intégration comptable.

---

## 8. État et prochaine étape

Le socle et le lot 1 sont en place et vérifiés :

1. ✅ Monorepo + `packages/contracts` + Docker (Mongo replica set, Redis) + CI.
2. ✅ API : santé, enveloppe de réponse, erreurs, logs, CORS, rate limit.
3. ✅ Mobile : Expo Router, thème, client API, store d'auth, écrans login/register/OTP/mot de passe oublié/changement.
4. ✅ Lot 1 : `users`, auth email/téléphone, Argon2id, JWT + refresh rotatif, OTP, RBAC, audit, admin comptes, tests d'intégration.
5. ⏭️ Lot 2 : `catalog`, `packs`, `subscriptions` + moteur de quota transactionnel.
6. ⏭️ Lot 4 : adaptateur Orange Money sandbox + webhook idempotent.
7. ⏭️ Lot 5 : tunnel de commande mobile, suivi, espaces livreur/pressing.
8. ⏭️ Lot 6 : dashboard admin, litiges, audit, puis pilote fermé sur Bamako.

**Comptes** : l'inscription publique crée uniquement des clients. Les comptes livreur, pressing et administrateur passent par `POST /api/v1/admin/users` ; leur mot de passe est temporaire et un changement est imposé à la première connexion.

**OTP en développement** : le code à 6 chiffres est renvoyé par l'API (`devCode`) et affiché sur l'écran de vérification. Le cooldown de renvoi est de 60 secondes, la validité de 5 minutes et le maximum de 5 tentatives.
