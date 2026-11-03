# 04 — Contrat API REST

Base URL : `/api/v1`
Format : JSON UTF-8. Toutes les dates sont en ISO 8601 UTC.

---

## 1. Conventions

### 1.1 Enveloppe de réponse

**Succès**

```json
{
  "success": true,
  "data": {},
  "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 }
}
```

**Erreur**

```json
{
  "success": false,
  "error": {
    "code": "QUOTA_EXHAUSTED",
    "message": "Votre quota est épuisé. Les articles restants seront facturés au tarif catalogue.",
    "details": { "availableUnits": 0, "requestedUnits": 3 },
    "requestId": "req_01J9..."
  }
}
```

- `meta` est présent uniquement sur les listes paginées.
- `message` de succès optionnel pour les actions (`"Commande annulée."`).
- Aucun champ technique interne (`__v`, `passwordHash`, `providerSecret`) n'est exposé.

### 1.2 Pagination, tri, filtres

| Paramètre | Défaut       | Limite                          |
| --------- | ------------ | ------------------------------- |
| `page`    | 1            | ≥ 1                             |
| `limit`   | 20           | 1–100                           |
| `sort`    | `-createdAt` | liste blanche par endpoint      |
| `q`       | —            | recherche plein texte/partielle |

Exemple : `GET /orders?status=prete&page=2&limit=20&sort=-createdAt`.

### 1.3 Codes HTTP

| Code  | Usage                                                    |
| ----- | -------------------------------------------------------- |
| `200` | Lecture/action réussie                                   |
| `201` | Ressource créée                                          |
| `202` | Action asynchrone acceptée (paiement initié)             |
| `204` | Suppression logique sans contenu                         |
| `400` | Validation de forme                                      |
| `401` | Token absent/expiré                                      |
| `403` | Rôle ou propriété insuffisante                           |
| `404` | Ressource inexistante ou non visible                     |
| `409` | Conflit métier (quota, idempotence, transition invalide) |
| `422` | Règle métier non respectée                               |
| `429` | Trop de requêtes                                         |
| `500` | Erreur interne                                           |
| `502` | Fournisseur externe (OM, Maps, FCM) en échec             |

### 1.4 Idempotence

En-tête obligatoire sur :

- `POST /orders`
- `POST /subscriptions`
- `POST /payments/*`
- `POST /driver/orders/:id/*`
- `POST /pressing/orders/:id/*`

```http
Idempotency-Key: 8f14e45f-ea2f-4b3d-9c1a-0f6b2d7e9a11
```

Comportement :

1. Première requête : traitement + stockage de la réponse (24 h).
2. Même clé + même payload : renvoie la réponse mémorisée (`200`/`201`).
3. Même clé + payload différent : `409 IDEMPOTENCY_CONFLICT`.
4. Requête concurrente : `409 IDEMPOTENCY_IN_PROGRESS` avec `Retry-After: 2`.

### 1.5 Authentification

```http
Authorization: Bearer <access_token>
```

- Access token JWT signé (RS256 recommandé), durée 15 min.
- Refresh token opaque, durée 30 jours, rotation, stockage haché en base.
- `POST /auth/refresh` renvoie un nouveau couple ; l'ancien refresh est révoqué.
- Les webhooks n'utilisent pas JWT : signature HMAC + secret partagé.

### 1.6 Rate limiting

| Périmètre                | Limite                         |
| ------------------------ | ------------------------------ |
| `POST /auth/login`       | 10 / 15 min / IP + identifiant |
| `POST /auth/otp/request` | 5 / heure / téléphone          |
| `POST /auth/otp/verify`  | 5 tentatives / code            |
| Global authentifié       | 300 req / min / utilisateur    |
| Création commande        | 10 / heure / client            |
| Webhook                  | 120 / min / IP fournisseur     |
| Uploads                  | 30 / heure / utilisateur       |

---

## 2. Matrice RBAC

| Ressource                    |     Client      |    Livreur    |  Pressing  | Admin  |
| ---------------------------- | :-------------: | :-----------: | :--------: | :----: |
| Catalogue (lecture)          |       ✅        |      ✅       |     ✅     |   ✅   |
| Catalogue (écriture)         |        —        |       —       |     —      |   ✅   |
| Packs (lecture)              |       ✅        |      ✅       |     ✅     |   ✅   |
| Packs (écriture)             |        —        |       —       |     —      |   ✅   |
| Abonnement personnel         |       ✅        |       —       |     —      |   ✅   |
| Abonnements (tous)           |        —        |       —       |     —      |   ✅   |
| Créer une commande           |       ✅        |       —       |     —      |   —    |
| Voir une commande            |  propriétaire   |   assignée    |  assignée  | toutes |
| Annuler                      | avant ramassage |       —       |     —      | toutes |
| Affecter un livreur/pressing |        —        |       —       |     —      |   ✅   |
| Conformité ramassage         |        —        |   assignée    |     —      |   ✅   |
| Réception/traitement         |        —        |       —       |  assignée  |   ✅   |
| Livrer                       |        —        |   assignée    |     —      |   ✅   |
| Paiement                     |     le sien     | cash collecté |     —      |  tous  |
| Remboursement                |        —        |       —       |     —      |   ✅   |
| Litiges                      |    les siens    |   les siens   | les siens  |  tous  |
| Utilisateurs                 |   son profil    |  son profil   | son profil |  tous  |
| KPI / audit / config         |        —        |       —       |     —      |   ✅   |

> **Ownership** : même avec le bon rôle, l'API vérifie que la ressource appartient à l'acteur (`order.clientId === me.id`, `order.driverId === me.driverProfileId`, `order.pressingId === me.pressingProfileId`). Une ressource non autorisée renvoie `404` (pas `403`) pour éviter l'énumération.

---

## 3. Authentification

| Méthode | Endpoint                | Rôle             | Description                                       |
| ------- | ----------------------- | ---------------- | ------------------------------------------------- |
| POST    | `/auth/register`        | public           | Inscription client + envoi OTP SMS                |
| POST    | `/auth/login`           | public           | Email/téléphone + mot de passe                    |
| POST    | `/auth/refresh`         | public (refresh) | Rotation des tokens                               |
| POST    | `/auth/logout`          | authentifié      | Révoque la famille de sessions                    |
| POST    | `/auth/otp/request`     | public           | Renvoi de code (vérification ou réinitialisation) |
| POST    | `/auth/otp/verify`      | public           | Vérifie le téléphone et ouvre une session         |
| POST    | `/auth/password/forgot` | public           | Demande de réinitialisation                       |
| POST    | `/auth/password/reset`  | public (OTP)     | Nouveau mot de passe                              |
| POST    | `/auth/password/change` | authentifié      | Change le mot de passe et révoque les sessions    |
| GET     | `/auth/me`              | authentifié      | Profil + rôle                                     |
| PATCH   | `/auth/me`              | authentifié      | Nom, email, avatar, préférences                   |
| POST    | `/auth/push-token`      | authentifié      | Enregistre un token push                          |
| DELETE  | `/auth/push-token`      | authentifié      | Supprime un token                                 |

Le téléphone est **obligatoire** et au format E.164 (`+22370000002`). L'email est optionnel, mais unique et insensible à la casse s'il est fourni.

### `POST /auth/register`

```json
{
  "firstName": "Awa",
  "lastName": "Traoré",
  "phone": "+22370000002",
  "email": "awa@example.com",
  "password": "MotDePasse!2026",
  "acceptTerms": true
}
```

Réponse `201` :

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "66f...",
      "role": "client",
      "firstName": "Awa",
      "lastName": "Traoré",
      "fullName": "Awa Traoré",
      "email": "awa@example.com",
      "phone": "+22370000002",
      "phoneVerified": false,
      "status": "actif",
      "mustChangePassword": false,
      "avatarUrl": null,
      "locale": "fr",
      "createdAt": "2026-11-02T18:30:00.000Z"
    },
    "otpRequired": true,
    "otpExpiresIn": 300,
    "devCode": "482913"
  },
  "message": "Compte créé. Vérifiez votre téléphone."
}
```

> Le rôle est forcé à `client`. Les champs `role`, `status`, `createdBy` sont ignorés s'ils sont envoyés. `devCode` n'est présent que hors production avec `OTP_EXPOSE_CODE=true`.

### `POST /auth/login`

```json
{ "identifier": "client@finiko.ml", "password": "Client@2026!" }
```

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "rt_...",
    "expiresIn": 900,
    "user": { "id": "66f...", "role": "client", "firstName": "Awa", "mustChangePassword": false }
  }
}
```

> `mustChangePassword=true` pour les comptes créés par l'admin : le mobile force l'écran `/change-password` avant d'accéder à l'espace.

### `POST /auth/refresh`

```json
{ "refreshToken": "rt_..." }
```

Réponse identique au login. L'ancien refresh est révoqué et remplacé dans la même `familyId`. Réutiliser un refresh déjà tourné révoque toute la famille et renvoie `401 REFRESH_REUSED`.

### `POST /auth/logout`

```json
{ "refreshToken": "rt_..." }
```

Révoque toutes les sessions de la famille. Réponse : `{ "message": "Déconnexion effectuée." }`.

### `POST /auth/otp/request`

```json
{ "identifier": "+22370000002", "purpose": "phone_verify" }
```

`purpose` vaut `phone_verify` (SMS) ou `password_reset` (SMS/email). Réponse :

```json
{ "expiresIn": 300, "message": "Code de vérification envoyé.", "devCode": "482913" }
```

Cooldown de 60 s par identifiant. Un `429 OTP_COOLDOWN` renvoie `details.retryAfterSeconds`.

### `POST /auth/otp/verify`

```json
{ "identifier": "+22370000002", "purpose": "phone_verify", "code": "482913" }
```

Marque le téléphone comme vérifié et renvoie une session complète (même forme que `/auth/login`). 5 tentatives maximum par code ; ensuite `400 OTP_TOO_MANY_ATTEMPTS`.

### `POST /auth/password/forgot` et `POST /auth/password/reset`

```json
{ "identifier": "client@finiko.ml" }
```

```json
{ "identifier": "client@finiko.ml", "code": "482913", "password": "Nouveau@2026" }
```

La demande renvoie toujours un message générique pour ne pas révéler l'existence du compte. La réinitialisation révoque toutes les sessions.

### `POST /auth/password/change`

```json
{ "currentPassword": "Ancien@2026", "newPassword": "Nouveau@2026" }
```

```json
{
  "message": "Mot de passe modifié. Toutes les sessions ont été révoquées.",
  "sessionsRevoked": true
}
```

### `GET /auth/me` / `PATCH /auth/me`

`GET` renvoie `{ "user": PublicUser }`. `PATCH` accepte `firstName`, `lastName`, `email` (`null` pour supprimer), `avatarUrl`, `locale` (`fr` ou `bm`).

### Codes d'erreur d'authentification

| Code                    | HTTP | Cause                                         |
| ----------------------- | ---- | --------------------------------------------- |
| `VALIDATION_ERROR`      | 400  | Champ manquant ou format invalide             |
| `INVALID_CREDENTIALS`   | 401  | Identifiant ou mot de passe incorrect         |
| `ACCOUNT_SUSPENDED`     | 403  | Compte suspendu par un administrateur         |
| `AUTH_REQUIRED`         | 401  | Access token absent, expiré ou invalide       |
| `INVALID_REFRESH`       | 401  | Refresh inconnu ou expiré                     |
| `REFRESH_REUSED`        | 401  | Refresh déjà utilisé : famille révoquée       |
| `PHONE_TAKEN`           | 409  | Numéro déjà rattaché à un compte              |
| `EMAIL_TAKEN`           | 409  | Email déjà rattaché à un compte               |
| `OTP_INVALID`           | 400  | Code faux, expiré ou déjà consommé            |
| `OTP_TOO_MANY_ATTEMPTS` | 400  | 5 tentatives dépassées                        |
| `OTP_COOLDOWN`          | 429  | Renvoi demandé trop tôt (`retryAfterSeconds`) |
| `OTP_SEND_FAILED`       | 502  | Échec du fournisseur SMS/email                |
| `RATE_LIMITED`          | 429  | Limiteur de débit atteint                     |

---

## 4. Catalogue

| Méthode | Endpoint                    | Rôle        | Description                                                      |
| ------- | --------------------------- | ----------- | ---------------------------------------------------------------- |
| GET     | `/catalog/items`            | public/auth | Liste active, filtres `category`, `q`, `includeInactive` (admin) |
| GET     | `/catalog/items/:id`        | public/auth | Détail + prix                                                    |
| POST    | `/catalog/items`            | admin       | Créer                                                            |
| PATCH   | `/catalog/items/:id`        | admin       | Modifier (prix, poids, visuel…)                                  |
| DELETE  | `/catalog/items/:id`        | admin       | Suppression logique (`deletedAt`)                                |
| PATCH   | `/catalog/items/:id/status` | admin       | Activer/désactiver                                               |

### `POST /catalog/items`

```json
{
  "code": "boubou",
  "name": "Boubou",
  "category": "femme",
  "description": "Boubou brodé, lavage délicat",
  "imageUrl": "https://res.cloudinary.com/...",
  "material": "Bazin",
  "prices": { "lavage": 1500, "repassage": 1000, "lavage_repassage": 2200 },
  "quotaWeight": 2,
  "availableTreatments": ["lavage", "repassage", "lavage_repassage"],
  "isActive": true,
  "displayOrder": 3
}
```

**Règles** : les 3 prix sont obligatoires et entiers **strictement positifs** ; `quotaWeight` entier 1–10 ; `availableTreatments` est un sous-ensemble non vide des trois prestations ; le code est unique et immuable après création. `PATCH` n'applique aucune valeur par défaut : seuls les champs transmis sont modifiés. `includeInactive=true` est réservé aux administrateurs (403 sinon) ; un article supprimé logiquement reste masqué, même avec ce filtre.

---

## 5. Packs et abonnements

| Méthode | Endpoint                          | Rôle        | Description                                       |
| ------- | --------------------------------- | ----------- | ------------------------------------------------- |
| GET     | `/packs`                          | public/auth | Packs actifs, `includeInactive` réservé à l'admin |
| GET     | `/packs/:id`                      | public/auth | Détail                                            |
| POST    | `/packs`                          | admin       | Créer                                             |
| PATCH   | `/packs/:id`                      | admin       | Modifier (sans réappliquer les défauts)           |
| PATCH   | `/packs/:id/status`               | admin       | Activer/désactiver                                |
| DELETE  | `/packs/:id`                      | admin       | Suppression logique (`deletedAt`)                 |
| GET     | `/subscriptions/me`               | client      | Abonnement actif, programmé et en attente         |
| GET     | `/subscriptions/me/usage`         | client      | Ledger de quota paginé                            |
| POST    | `/subscriptions`                  | client      | Souscrire                                         |
| POST    | `/subscriptions/:id/cancel`       | client      | Annuler le renouvellement ou une souscription     |
| GET     | `/subscriptions`                  | admin       | Liste filtrable                                   |
| POST    | `/subscriptions/:id/adjust-quota` | admin       | Ajustement signé de `quotaTotal`                  |

### `POST /subscriptions`

```json
{ "packId": "66f...", "paymentMethod": "orange_money" }
```

`paymentMethod` vaut `orange_money` (défaut) ou `cash`. Réponse `202` :

```json
{
  "success": true,
  "message": "Souscription créée, en attente de paiement.",
  "data": {
    "subscription": {
      "id": "66f...",
      "status": "en_attente_paiement",
      "pack": {
        "id": "66e...",
        "code": "normal",
        "name": "Pack Normal",
        "quotaUnits": 10,
        "priceXOF": 11000,
        "billingPeriodDays": 30,
        "includedTreatments": ["lavage", "repassage", "lavage_repassage"],
        "deliveryIncluded": false,
        "deliveryDiscountPercent": 0
      },
      "startDate": "2026-11-05T00:00:00.000Z",
      "endDate": "2026-12-05T00:00:00.000Z",
      "quotaTotal": 10,
      "quotaUsed": 0,
      "quotaReserved": 0,
      "quotaAvailable": 10,
      "autoRenew": false,
      "activatedAt": null,
      "cancelledAt": null
    }
  }
}
```

À ce lot, **aucun objet `payment` n'est renvoyé** : l'initialisation Orange Money et le webhook arrivent au lot 4. Le statut est `en_attente_paiement` si le client n'a pas d'abonnement actif, `programmee` s'il en a déjà un. Un pack supprimé renvoie `404` ; un pack inactif ou hors période renvoie `422 PACK_INACTIVE` ; une souscription déjà en attente renvoie `409 SUBSCRIPTION_PENDING`.

### `GET /subscriptions/me`

```json
{
  "success": true,
  "data": {
    "active": {
      "id": "66f...",
      "status": "active",
      "pack": { "code": "normal", "name": "Pack Normal" },
      "startDate": "2026-11-05T00:00:00.000Z",
      "endDate": "2026-12-05T00:00:00.000Z",
      "quotaTotal": 10,
      "quotaUsed": 7,
      "quotaReserved": 1,
      "quotaAvailable": 2,
      "autoRenew": false,
      "cancelledAt": null
    },
    "pending": null,
    "scheduled": null
  }
}
```

`pending` contient la souscription `en_attente_paiement` ; `scheduled` contient le renouvellement `programmee`. Les trois champs peuvent être `null`.

### `GET /subscriptions/me/usage`

Paramètres : `page`, `limit`, `subscriptionId` optionnel. Réponse :

```json
{
  "success": true,
  "data": {
    "usages": [
      {
        "id": "66u...",
        "subscriptionId": "66f...",
        "type": "consommation",
        "units": 2,
        "usedDelta": 2,
        "reservedDelta": -2,
        "quotaTotalDelta": 0,
        "quotaUsedAfter": 7,
        "quotaReservedAfter": 0,
        "quotaTotalAfter": 10,
        "reason": "",
        "orderId": "66o...",
        "createdAt": "2026-11-12T09:30:00.000Z"
      }
    ]
  },
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

### `POST /subscriptions/:id/cancel`

Corps : `{ "reason": "Changement d'avis" }`. Pour un abonnement `active`, l'appel annule uniquement le renouvellement : le statut reste `active`, `autoRenew` passe à `false`, `cancelledAt` est renseigné et le quota reste utilisable jusqu'à `endDate` (`renewalCancelled: true`). Pour une souscription `en_attente_paiement` ou `programmee`, elle passe à `annulee` (`renewalCancelled: false`).

### `POST /subscriptions/:id/adjust-quota`

Corps : `{ "units": 2, "reason": "Geste commercial" }`. `units` est un entier **signé non nul** appliqué à `quotaTotal`. La réponse contient la souscription mise à jour ; le ledger enregistre `quotaTotalDelta` et `quotaTotalAfter`. Un delta négatif qui ferait passer `quotaTotal` sous `quotaUsed + quotaReserved` renvoie `409 QUOTA_ADJUSTMENT_INVALID`.

### Codes d'erreur catalogue, packs et quota

| Code                             | HTTP | Cause                                                          |
| -------------------------------- | ---- | -------------------------------------------------------------- |
| `VALIDATION_ERROR`               | 400  | Prix partiel, poids hors bornes, patch vide, unités invalides  |
| `CATALOG_CODE_TAKEN`             | 409  | Code catalogue déjà utilisé                                    |
| `PACK_CODE_TAKEN`                | 409  | Code pack déjà utilisé                                         |
| `INVALID_PACK_PERIOD`            | 422  | `validTo` antérieure ou égale à `validFrom`                    |
| `PACK_INACTIVE`                  | 422  | Pack inactif ou hors période de validité                       |
| `SUBSCRIPTION_PENDING`           | 409  | Une souscription est déjà en attente de paiement               |
| `SUBSCRIPTION_ALREADY_SCHEDULED` | 409  | Un renouvellement est déjà programmé                           |
| `SUBSCRIPTION_ALREADY_ACTIVE`    | 409  | Activation demandée sur un abonnement actif                    |
| `SUBSCRIPTION_NOT_ACTIVATABLE`   | 422  | Statut incompatible avec une activation                        |
| `SUBSCRIPTION_NOT_STARTED`       | 422  | Date de début non atteinte                                     |
| `SUBSCRIPTION_NOT_CANCELLABLE`   | 409  | Statut incompatible avec une annulation                        |
| `SUBSCRIPTION_INACTIVE`          | 422  | Opération de quota sur un abonnement qui n'est plus actif      |
| `QUOTA_EXHAUSTED`                | 409  | Le quota disponible ne couvre pas les unités demandées         |
| `QUOTA_RESERVATION_NOT_FOUND`    | 409  | Consommation/libération sans réservation préalable             |
| `QUOTA_CONSUMPTION_NOT_FOUND`    | 409  | Remboursement sans consommation préalable                      |
| `QUOTA_ALREADY_CONSUMED`         | 409  | Libération d'une réservation déjà consommée                    |
| `QUOTA_RESERVATION_RELEASED`     | 409  | Consommation d'une réservation déjà libérée                    |
| `QUOTA_STATE_INVALID`            | 409  | Transition de quota impossible                                 |
| `IDEMPOTENCY_CONFLICT`           | 409  | Même commande rejouée avec un nombre d'unités différent        |
| `QUOTA_ADJUSTMENT_INVALID`       | 409  | Ajustement négatif incompatible avec le quota consommé/réservé |

---

## 6. Commandes

| Méthode | Endpoint                       | Rôle         | Description                  |
| ------- | ------------------------------ | ------------ | ---------------------------- |
| POST    | `/orders/quote`                | client       | Devis sans engagement        |
| POST    | `/orders`                      | client       | Créer la commande            |
| GET     | `/orders`                      | auth         | Liste selon rôle             |
| GET     | `/orders/:id`                  | auth         | Détail + actions disponibles |
| GET     | `/orders/:id/timeline`         | auth         | Événements de statut         |
| POST    | `/orders/:id/cancel`           | client/admin | Annulation                   |
| POST    | `/orders/:id/confirm-delivery` | client       | Confirmer la réception       |
| POST    | `/orders/:id/dispute`          | client       | Ouvrir un litige             |
| PATCH   | `/orders/:id/assign-driver`    | admin        | Affecter/réaffecter          |
| PATCH   | `/orders/:id/assign-pressing`  | admin        | Changer de pressing          |
| GET     | `/orders/:id/payment`          | client/admin | Paiement(s) lié(s)           |

### 6.1 `POST /orders/quote`

**Requête**

```json
{
  "items": [
    { "catalogItemId": "66f...", "treatment": "lavage_repassage", "quantity": 8 },
    { "catalogItemId": "66g...", "treatment": "lavage_repassage", "quantity": 2 }
  ],
  "pickup": {
    "text": "Hamdallaye ACI 2000, rue 123, portail bleu",
    "coordinates": { "lat": 12.6392, "lng": -8.0029 },
    "contactName": "Awa Traoré",
    "contactPhone": "+22370000002"
  },
  "delivery": {
    "text": "Badalabougou Est, près de la pharmacie",
    "coordinates": { "lat": 12.6189, "lng": -7.9932 },
    "contactName": "Awa Traoré",
    "contactPhone": "+22370000002"
  },
  "useSubscription": true,
  "promoCode": null
}
```

**Réponse `200`**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "catalogItemId": "66f...",
        "name": "Chemise",
        "treatment": "lavage_repassage",
        "quantity": 8,
        "quotaWeight": 1,
        "unitPrice": 1200,
        "lineTotal": 9600,
        "coveredQuantity": 8,
        "billableQuantity": 0,
        "coveredAmount": 9600,
        "billableAmount": 0
      },
      {
        "catalogItemId": "66g...",
        "name": "Boubou",
        "treatment": "lavage_repassage",
        "quantity": 2,
        "quotaWeight": 2,
        "unitPrice": 2200,
        "lineTotal": 4400,
        "coveredQuantity": 1,
        "billableQuantity": 1,
        "coveredAmount": 2200,
        "billableAmount": 2200
      }
    ],
    "totals": {
      "itemsCount": 10,
      "catalogSubtotal": 14000,
      "packCoveredAmount": 11800,
      "supplementAmount": 2200,
      "deliveryFee": 1000,
      "discountAmount": 0,
      "totalDue": 3200
    },
    "pack": {
      "subscriptionId": "66h...",
      "packName": "Pack Normal",
      "quotaTotal": 10,
      "quotaUsedBefore": 0,
      "quotaAvailableBefore": 10,
      "coveredUnits": 10,
      "overageUnits": 2,
      "quotaAvailableAfter": 0
    },
    "delivery": {
      "zone": "Bamako Centre",
      "distanceKm": 3.4,
      "feeXOF": 1000,
      "serviceable": true
    },
    "quoteToken": "qt_01J9...",
    "expiresAt": "2026-11-02T18:45:00.000Z"
  }
}
```

> Le `quoteToken` signé (JWT court, 15 min) permet de créer la commande sans recalculer les prix côté client. Le serveur **recalcule quand même** à la création pour éviter toute fraude ou changement de catalogue.

### 6.2 `POST /orders`

```json
{
  "quoteToken": "qt_01J9...",
  "items": [{ "catalogItemId": "66f...", "treatment": "lavage_repassage", "quantity": 8 }],
  "pickupAddressId": "66i...",
  "pickup": { "text": "...", "coordinates": { "lat": 12.6392, "lng": -8.0029 } },
  "delivery": { "text": "...", "coordinates": { "lat": 12.6189, "lng": -7.9932 } },
  "pickupSlot": {
    "label": "Aujourd'hui 14h–16h",
    "start": "2026-11-02T14:00:00Z",
    "end": "2026-11-02T16:00:00Z"
  },
  "preferences": { "perfume": "lavande", "notes": "Portail à gauche" },
  "paymentMethod": "orange_money",
  "useSubscription": true
}
```

**Réponse `201`**

```json
{
  "success": true,
  "data": {
    "order": {
      "id": "66j...",
      "orderNumber": "#FK-1042",
      "status": "en_attente_paiement",
      "totals": {
        "catalogSubtotal": 14000,
        "packCoveredAmount": 11800,
        "supplementAmount": 2200,
        "deliveryFee": 1000,
        "totalDue": 3200
      },
      "pack": { "coveredUnits": 10, "overageUnits": 2, "quotaAvailableAfter": 0 },
      "payment": { "method": "orange_money", "status": "en_attente" },
      "estimatedDeliveryAt": "2026-11-04T18:00:00.000Z"
    },
    "payment": {
      "id": "66k...",
      "reference": "PAY-20261102-0008",
      "amountXOF": 3200,
      "status": "en_attente",
      "checkoutUrl": "https://orange-money.../pay/..."
    }
  }
}
```

**Erreurs métier** :

| Code                      | HTTP | Sens                                  |
| ------------------------- | ---- | ------------------------------------- |
| `CART_EMPTY`              | 400  | Panier vide                           |
| `ITEM_UNAVAILABLE`        | 409  | Article désactivé                     |
| `TREATMENT_NOT_AVAILABLE` | 422  | Prestation non proposée               |
| `PACK_NOT_ACTIVE`         | 422  | Abonnement expiré/suspendu            |
| `QUOTA_RACE`              | 409  | Quota modifié entre devis et création |
| `DELIVERY_ZONE_UNSERVED`  | 422  | Adresse hors zone                     |
| `QUOTE_EXPIRED`           | 409  | Devis expiré, recalcul nécessaire     |
| `IDEMPOTENCY_CONFLICT`    | 409  | Même clé, payload différent           |

### 6.3 `GET /orders/:id`

```json
{
  "success": true,
  "data": {
    "id": "66j...",
    "orderNumber": "#FK-1042",
    "status": "en_traitement",
    "statusLabel": "Traitement en cours",
    "client": { "id": "66f...", "firstName": "Awa", "phone": "+223****002" },
    "driver": { "id": "66l...", "firstName": "Oumar", "phone": "+223****001", "vehicle": "moto" },
    "pressing": { "id": "66m...", "businessName": "Pressing Koulouba", "phone": "+223****003" },
    "items": [
      {
        "id": "66n...",
        "name": "Chemise",
        "treatment": "lavage_repassage",
        "quantity": 8,
        "treatmentStatus": "termine"
      },
      {
        "id": "66o...",
        "name": "Boubou",
        "treatment": "lavage_repassage",
        "quantity": 2,
        "treatmentStatus": "en_cours"
      }
    ],
    "totals": { "totalDue": 3200, "totalPaid": 3200, "refundedAmount": 0 },
    "pickup": {
      "text": "...",
      "coordinates": { "lat": 12.6392, "lng": -8.0029 },
      "slot": "14h–16h"
    },
    "delivery": { "text": "...", "coordinates": { "lat": 12.6189, "lng": -7.9932 } },
    "conformity": { "status": "conforme", "driverCheckedAt": "2026-11-02T15:12:00Z" },
    "timeline": [
      { "status": "confirmee", "at": "2026-11-02T13:40:00Z", "actorRole": "client" },
      { "status": "ramassage_assigne", "at": "2026-11-02T13:45:00Z", "actorRole": "admin" },
      { "status": "ramassage_en_cours", "at": "2026-11-02T14:05:00Z", "actorRole": "livreur" },
      { "status": "ramassee", "at": "2026-11-02T15:12:00Z", "actorRole": "livreur" },
      { "status": "au_pressing", "at": "2026-11-02T16:02:00Z", "actorRole": "pressing" },
      { "status": "en_traitement", "at": "2026-11-02T16:20:00Z", "actorRole": "pressing" }
    ],
    "actions": {
      "canCancel": true,
      "canConfirmDelivery": false,
      "canDispute": true,
      "canReview": false
    }
  }
}
```

### 6.4 `POST /orders/:id/cancel`

```json
{ "reason": "Je ne suis plus disponible", "requestRefund": true }
```

Réponse `200` :

```json
{
  "success": true,
  "message": "Commande annulée.",
  "data": {
    "order": { "id": "66j...", "status": "annulee" },
    "refund": { "status": "en_cours", "amountXOF": 3200, "estimatedDelay": "24–48h" },
    "quota": { "refundedUnits": 10, "quotaAvailable": 10 }
  }
}
```

### 6.5 `POST /orders/:id/confirm-delivery`

Aucun body. Passe `livree → terminee`, enregistre `confirmedByClientAt`, déclenche la demande d'avis.

---

## 7. Espace livreur

| Méthode | Endpoint                                       | Rôle    | Description                          |
| ------- | ---------------------------------------------- | ------- | ------------------------------------ |
| GET     | `/driver/me`                                   | livreur | Profil + statut + charge             |
| PATCH   | `/driver/status`                               | livreur | disponible / en_mission / hors_ligne |
| PATCH   | `/driver/location`                             | livreur | Position GPS                         |
| GET     | `/driver/missions`                             | livreur | Missions assignées + pool            |
| POST    | `/driver/missions/:orderId/accept`             | livreur | Accepter                             |
| POST    | `/driver/missions/:orderId/decline`            | livreur | Refuser (motif)                      |
| POST    | `/driver/orders/:orderId/arrive`               | livreur | Arrivée sur site                     |
| POST    | `/driver/orders/:orderId/conformity`           | livreur | Contrôle de conformité               |
| POST    | `/driver/orders/:orderId/drop-off`             | livreur | Dépôt au pressing                    |
| POST    | `/driver/orders/:orderId/pickup-from-pressing` | livreur | Récupération                         |
| POST    | `/driver/orders/:orderId/deliver`              | livreur | Livraison                            |
| POST    | `/driver/orders/:orderId/collect-cash`         | livreur | Encaissement cash                    |

### `PATCH /driver/location`

```json
{ "lat": 12.6392, "lng": -8.0029, "accuracy": 8, "heading": 180, "speed": 6.2 }
```

Fréquence : toutes les 15–30 s en mission, 2 min en disponibilité. Stockage Redis + mise à jour Mongo throttlée (1/min).

### `POST /driver/orders/:orderId/conformity`

```json
{
  "status": "conforme",
  "items": [
    {
      "itemId": "66n...",
      "observedQuantity": 8,
      "observedTreatment": "lavage_repassage",
      "conforme": true
    },
    {
      "itemId": "66o...",
      "observedQuantity": 2,
      "observedTreatment": "lavage_repassage",
      "conforme": true
    }
  ],
  "note": "Lot conforme, emballé dans deux sacs.",
  "photos": ["https://res.cloudinary.com/.../conformite-1.jpg"]
}
```

Si `status = "non_conforme"` :

```json
{
  "status": "non_conforme",
  "items": [
    {
      "itemId": "66o...",
      "observedQuantity": 1,
      "observedTreatment": "repassage",
      "conforme": false,
      "issue": "article_manquant"
    }
  ],
  "note": "Un boubou manquant, le client dit qu'il arrive dans 10 min.",
  "photos": ["..."],
  "clientContacted": true
}
```

Réponse : commande `litige` + notification client/admin. Aucune modification de prix n'est appliquée par le livreur.

### `POST /driver/orders/:orderId/deliver`

```json
{
  "photoUrl": "https://res.cloudinary.com/.../preuve.jpg",
  "signatureUrl": null,
  "recipientName": "Awa Traoré",
  "cashCollectedXOF": 0,
  "note": "Remis en main propre"
}
```

---

## 8. Espace pressing

| Méthode | Endpoint                                      | Rôle     | Description               |
| ------- | --------------------------------------------- | -------- | ------------------------- |
| GET     | `/pressing/me`                                | pressing | Profil + charge           |
| GET     | `/pressing/orders`                            | pressing | File par statut           |
| GET     | `/pressing/orders/:id`                        | pressing | Détail + lignes           |
| POST    | `/pressing/orders/:id/receive`                | pressing | Réception                 |
| POST    | `/pressing/orders/:id/items/:itemId/start`    | pressing | Démarrer un article       |
| POST    | `/pressing/orders/:id/items/:itemId/complete` | pressing | Terminer un article       |
| POST    | `/pressing/orders/:id/items/complete-all`     | pressing | Tout terminer             |
| POST    | `/pressing/orders/:id/report-issue`           | pressing | Signaler un écart         |
| POST    | `/pressing/orders/:id/ready`                  | pressing | Déclarer prêt             |
| GET     | `/pressing/stats`                             | pressing | Volume, délais, incidents |

### `POST /pressing/orders/:id/receive`

```json
{
  "receivedItems": [
    { "itemId": "66n...", "quantity": 8, "conforme": true },
    { "itemId": "66o...", "quantity": 2, "conforme": true }
  ],
  "note": "Réception conforme, sac scellé.",
  "photos": ["..."]
}
```

Réponse : statut `au_pressing`.

### `POST /pressing/orders/:id/items/:itemId/start`

Aucun body. Passe la ligne `a_traiter → en_cours`, la commande `au_pressing → en_traitement` si première ligne.

### `POST /pressing/orders/:id/items/:itemId/complete`

```json
{ "note": "Repassage main, pli standard", "photos": ["..."] }
```

Passe la ligne `en_cours → termine`. Si toutes les lignes sont `termine`, la commande reste `en_traitement` jusqu'à l'appel explicite à `/ready`.

### `POST /pressing/orders/:id/ready`

Aucun body. Vérifie que **toutes** les lignes sont `termine`, passe la commande `prete`, notifie livreur/client/admin.

---

## 9. Paiements

| Méthode | Endpoint                          | Rôle         | Description            |
| ------- | --------------------------------- | ------------ | ---------------------- |
| POST    | `/payments/orange-money/initiate` | client       | Relancer un paiement   |
| GET     | `/payments/:id`                   | client/admin | Statut                 |
| POST    | `/payments/:id/cancel`            | client       | Annuler une intention  |
| POST    | `/payments/:id/refund`            | admin        | Remboursement          |
| GET     | `/payments`                       | admin        | Liste et rapprochement |
| POST    | `/webhooks/orange-money`          | public signé | Notification opérateur |

### `GET /payments/:id`

```json
{
  "success": true,
  "data": {
    "id": "66k...",
    "reference": "PAY-20261102-0008",
    "purpose": "order",
    "orderId": "66j...",
    "amountXOF": 3200,
    "currency": "XOF",
    "provider": "orange_money",
    "status": "reussi",
    "paidAt": "2026-11-02T13:42:10.000Z",
    "checkoutUrl": null
  }
}
```

### Webhook Orange Money

```http
POST /api/v1/webhooks/orange-money
X-OM-Signature: t=1762100530,v1=9f2c...
Content-Type: application/json
```

```json
{
  "event": "payment.success",
  "transaction_id": "OM-20261102-778899",
  "order_id": "PAY-20261102-0008",
  "amount": 3200,
  "currency": "XOF",
  "status": "SUCCESS",
  "timestamp": "2026-11-02T13:42:10Z"
}
```

Traitement :

1. Vérifier la signature HMAC sur le **corps brut**.
2. Vérifier la fenêtre temporelle (5 min) contre le rejeu.
3. Retrouver le paiement par `reference` (ordre) et `providerTxId`.
4. Si déjà `reussi` → `200` immédiat.
5. Vérifier `amount` et `currency` avec ceux stockés.
6. Transaction : paiement `reussi` + activation abonnement **ou** confirmation commande + commit quota.
7. Publier les événements, répondre `200` en < 5 s.

> Toujours répondre `2xx` rapidement, même si le traitement métier échoue, pour éviter les rejeux infinis ? **Non** : en cas d'erreur transitoire (DB indisponible), répondre `503` pour que l'opérateur réessaie ; en cas d'erreur définitive (montant incohérent), répondre `200` + alerte admin, car réessayer ne changera rien.

---

## 10. Litiges

| Méthode | Endpoint                 | Rôle  | Description            |
| ------- | ------------------------ | ----- | ---------------------- |
| POST    | `/disputes`              | auth  | Ouvrir un litige       |
| GET     | `/disputes`              | auth  | Liste filtrée par rôle |
| GET     | `/disputes/:id`          | auth  | Détail + messages      |
| POST    | `/disputes/:id/messages` | auth  | Ajouter un message     |
| POST    | `/disputes/:id/resolve`  | admin | Résoudre               |
| POST    | `/disputes/:id/close`    | admin | Clôturer sans action   |

```json
{
  "orderId": "66j...",
  "reason": "article_endommage",
  "description": "Le boubou est revenu avec une tache sur le devant.",
  "evidenceUrls": ["https://res.cloudinary.com/.../litige-1.jpg"]
}
```

Résolution admin :

```json
{
  "type": "remboursement",
  "amountXOF": 2200,
  "note": "Tache confirmée, remboursement du boubou.",
  "refundMethod": "orange_money"
}
```

---

## 11. Notifications

| Méthode | Endpoint                      | Rôle | Description     |
| ------- | ----------------------------- | ---- | --------------- |
| GET     | `/notifications`              | auth | Liste paginée   |
| GET     | `/notifications/unread-count` | auth | Compteur        |
| PATCH   | `/notifications/:id/read`     | auth | Marquer lu      |
| POST    | `/notifications/read-all`     | auth | Tout marquer lu |

---

## 12. Administration

| Méthode               | Endpoint                            | Rôle  | Description                  |
| --------------------- | ----------------------------------- | ----- | ---------------------------- |
| GET                   | `/admin/metrics`                    | admin | KPI dashboard                |
| GET                   | `/admin/metrics/timeseries`         | admin | Courbes CA/commandes         |
| GET                   | `/admin/users`                      | admin | Liste filtrable et paginée   |
| POST                  | `/admin/users`                      | admin | Créer livreur/pressing/admin |
| PATCH                 | `/admin/users/:id/status`           | admin | Suspendre ou réactiver       |
| GET                   | `/admin/orders`                     | admin | Supervision                  |
| PATCH                 | `/admin/orders/:id/assign-driver`   | admin | Affectation                  |
| PATCH                 | `/admin/orders/:id/assign-pressing` | admin | Affectation                  |
| POST                  | `/admin/orders/:id/cancel`          | admin | Annulation                   |
| GET                   | `/admin/finance/summary`            | admin | CA, packs, cash              |
| GET                   | `/admin/finance/transactions`       | admin | Paiements                    |
| GET                   | `/admin/audit-logs`                 | admin | Journal                      |
| GET/POST/PATCH/DELETE | `/admin/banners`                    | admin | Bannières                    |
| GET/POST/PATCH/DELETE | `/admin/zones`                      | admin | Zones de livraison           |
| GET/PATCH             | `/admin/settings`                   | admin | Configuration                |
| GET                   | `/admin/pressings`                  | admin | Partenaires + charge         |
| GET                   | `/admin/drivers`                    | admin | Livreurs + positions         |

### `GET /admin/metrics`

```json
{
  "success": true,
  "data": {
    "revenue": {
      "todayXOF": 245000,
      "monthXOF": 3120000,
      "packsXOF": 1870000,
      "ordersXOF": 1250000,
      "refundsXOF": 45000
    },
    "orders": {
      "today": 38,
      "inProgress": 22,
      "late": 3,
      "disputed": 1,
      "cancelledToday": 2
    },
    "subscriptions": {
      "active": 84,
      "expiringIn7Days": 11,
      "quotaConsumedPercent": 61
    },
    "operations": {
      "driversAvailable": 6,
      "driversOnMission": 9,
      "pressingsActive": 4,
      "averagePickupSlaPercent": 87,
      "averageDeliverySlaPercent": 82
    }
  }
}
```

### `GET /admin/users`

Paramètres : `role` (`client|livreur|pressing|admin`), `status` (`actif|suspendu|supprime`), `q` (nom, téléphone, email), `page` (défaut 1), `limit` (défaut 20, max 100).

```json
{
  "success": true,
  "data": { "users": [{ "id": "66f...", "role": "livreur", "fullName": "Oumar Diallo" }] },
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

### `POST /admin/users`

```json
{
  "role": "pressing",
  "firstName": "Moussa",
  "lastName": "Diarra",
  "phone": "+22370000010",
  "email": "koulouba@finiko.ml",
  "password": "Temp@2026!",
  "mustChangePassword": true,
  "pressing": {
    "businessName": "Pressing Koulouba",
    "addressText": "Koulouba, Bamako",
    "location": { "lat": 12.6501, "lng": -8.0123 },
    "capacity": 120
  }
}
```

Pour un livreur, remplacer `pressing` par `driver` :

```json
{
  "role": "livreur",
  "firstName": "Oumar",
  "lastName": "Diallo",
  "phone": "+22370000001",
  "password": "Temp@2026!",
  "driver": { "vehicleType": "moto", "plate": "AB-1234", "zoneCodes": ["koulouba"] }
}
```

Réponse `201` : `{ "user": PublicUser, "profile": { "code": "FK-P-001", ... } }`. Le mot de passe n'est **jamais** renvoyé. Le titulaire doit le changer à la première connexion (`mustChangePassword`).

### `PATCH /admin/users/:id/status`

```json
{ "status": "suspendu", "reason": "Litige non résolu" }
```

Suspendre révoque immédiatement toutes les sessions de l'utilisateur. Un administrateur ne peut pas se suspendre lui-même (`409 SELF_SUSPEND`) ni suspendre le dernier admin actif (`409 LAST_ADMIN`).

---

## 13. Uploads

| Méthode | Endpoint             | Rôle | Description          |
| ------- | -------------------- | ---- | -------------------- |
| POST    | `/uploads/signature` | auth | Signature Cloudinary |

```json
{ "folder": "orders/66j/conformity", "resourceType": "image" }
```

```json
{
  "success": true,
  "data": {
    "cloudName": "finiko",
    "apiKey": "123456789",
    "timestamp": 1762100530,
    "signature": "...",
    "folder": "orders/66j/conformity",
    "uploadUrl": "https://api.cloudinary.com/v1_1/finiko/image/upload"
  }
}
```

**Règles** : dossiers autorisés uniquement, taille max 5 Mo, MIME image, transformation côté Cloudinary, suppression à la clôture du litige (12 mois).

---

## 14. Codes d'erreur métier

| Code                      | HTTP | Message client                                  |
| ------------------------- | ---- | ----------------------------------------------- |
| `VALIDATION_ERROR`        | 400  | Certains champs sont invalides.                 |
| `AUTH_REQUIRED`           | 401  | Veuillez vous connecter.                        |
| `INVALID_CREDENTIALS`     | 401  | Identifiant ou mot de passe incorrect.          |
| `ACCOUNT_SUSPENDED`       | 403  | Votre compte est suspendu.                      |
| `FORBIDDEN`               | 403  | Action non autorisée.                           |
| `NOT_FOUND`               | 404  | Ressource introuvable.                          |
| `QUOTA_EXHAUSTED`         | 422  | Quota épuisé.                                   |
| `QUOTA_RACE`              | 409  | Le quota a changé, vérifiez votre panier.       |
| `SUBSCRIPTION_INACTIVE`   | 422  | Votre abonnement n'est pas actif.               |
| `PACK_NOT_FOUND`          | 404  | Pack introuvable.                               |
| `CART_EMPTY`              | 400  | Votre panier est vide.                          |
| `ITEM_UNAVAILABLE`        | 409  | Un article n'est plus disponible.               |
| `TREATMENT_NOT_AVAILABLE` | 422  | Prestation non disponible pour cet article.     |
| `DELIVERY_ZONE_UNSERVED`  | 422  | Nous ne livrons pas encore à cette adresse.     |
| `QUOTE_EXPIRED`           | 409  | Le devis a expiré, veuillez le recalculer.      |
| `INVALID_TRANSITION`      | 409  | Cette étape n'est pas autorisée.                |
| `ORDER_NOT_ASSIGNED`      | 403  | Cette mission ne vous est pas assignée.         |
| `NOT_ALL_ITEMS_DONE`      | 422  | Tous les articles ne sont pas terminés.         |
| `PAYMENT_FAILED`          | 402  | Le paiement a échoué.                           |
| `PAYMENT_TIMEOUT`         | 408  | Le paiement a expiré.                           |
| `PAYMENT_PROVIDER_ERROR`  | 502  | Service de paiement indisponible.               |
| `REFUND_NOT_ALLOWED`      | 422  | Remboursement non autorisé à ce stade.          |
| `IDEMPOTENCY_CONFLICT`    | 409  | Requête déjà traitée avec un contenu différent. |
| `IDEMPOTENCY_IN_PROGRESS` | 409  | Requête en cours, réessayez.                    |
| `RATE_LIMITED`            | 429  | Trop de requêtes, réessayez plus tard.          |
| `INTERNAL_ERROR`          | 500  | Une erreur est survenue.                        |

---

## 15. Événements Socket.IO

### Connexion

```ts
const socket = io(API_URL, {
  auth: { token: accessToken },
  transports: ['websocket'],
  reconnection: true,
  reconnectionDelayMax: 10000,
});
```

Le serveur valide le JWT, joint automatiquement `user:{id}` et `role:{role}`. Le client peut rejoindre `order:{orderId}` uniquement s'il a le droit de voir la commande.

### Serveur → client

| Événement          | Payload                                                | Destinataires                    |
| ------------------ | ------------------------------------------------------ | -------------------------------- |
| `order:created`    | `{ orderId, orderNumber, status }`                     | client, admins                   |
| `order:status`     | `{ orderId, orderNumber, status, previousStatus, at }` | client, driver, pressing, admins |
| `order:assigned`   | `{ orderId, driverId, type: 'pickup'\|'delivery' }`    | driver, client                   |
| `order:ready`      | `{ orderId, orderNumber, readyAt }`                    | driver, client, admins           |
| `notification:new` | `{ id, title, body, deepLink, type }`                  | utilisateur                      |
| `mission:new`      | `{ orderId, distanceKm, pickupText }`                  | livreurs disponibles             |
| `payment:updated`  | `{ paymentId, orderId, status }`                       | client, admins                   |
| `dispute:message`  | `{ disputeId, orderId, authorRole, preview }`          | participants + admins            |
| `driver:location`  | `{ driverId, lat, lng, heading }`                      | admins (carte live)              |

### Client → serveur

| Événement                | Payload                        | Usage                               |
| ------------------------ | ------------------------------ | ----------------------------------- |
| `order:subscribe`        | `{ orderId }`                  | Rejoindre la room (vérifiée)        |
| `order:unsubscribe`      | `{ orderId }`                  | Quitter                             |
| `driver:location:update` | `{ lat, lng, heading, speed }` | Position en mission (throttle 15 s) |

> Les mutations passent **toujours** par REST. Socket.IO ne sert qu'à la diffusion et à la position ; aucune action métier critique n'est exécutée via socket.

---

## 16. OpenAPI

Le contrat est généré depuis les schémas Zod via `@asteasolutions/zod-to-openapi`, exposé sur `GET /openapi.json` et documenté sur `/docs` (Swagger UI) en staging. La CI vérifie que le client TypeScript mobile est généré sans diff.

**Groupes de tags** : Auth, Catalog, Packs, Subscriptions, Orders, Driver, Pressing, Payments, Disputes, Notifications, Admin, Uploads, Webhooks.

---

## 17. Exemple de client typé (mobile)

```ts
// src/api/client.ts
export async function apiFetch<T>(
  path: string,
  options: RequestInit & { idempotencyKey?: string } = {},
): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
      ...options.headers,
    },
  });

  const payload = await response.json();

  if (response.status === 401 && token) {
    const refreshed = await refreshSession();
    if (refreshed) return apiFetch<T>(path, options);
  }

  if (!response.ok) {
    throw new ApiError(
      payload.error.code,
      payload.error.message,
      response.status,
      payload.error.details,
    );
  }

  return payload.data as T;
}
```
