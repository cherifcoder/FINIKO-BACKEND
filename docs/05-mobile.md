# 05 — Architecture mobile & UI/UX

## 1. Stack mobile

| Brique            | Choix                               | Rôle                                        |
| ----------------- | ----------------------------------- | ------------------------------------------- |
| Runtime           | React Native 0.88 / React 19.3      | Base native Android/iOS                     |
| Plateforme        | Expo SDK 58 + dev client            | Builds, OTA, modules natifs                 |
| Navigation        | Expo Router 58                      | Routes typées, deep links, groupes par rôle |
| Langage           | TypeScript 6 strict                 | Sécurité de bout en bout                    |
| UI                | StyleSheet + design system (tokens) | Composants maison, NativeWind reporté       |
| Données serveur   | TanStack Query 5                    | Cache, retry, invalidation, mutations       |
| État local        | Zustand 5                           | Auth, brouillon de commande, UI             |
| Formulaires       | React Hook Form + Zod               | Validation partagée avec l'API              |
| Stockage sécurisé | expo-secure-store                   | Tokens                                      |
| Stockage local    | react-native-mmkv                   | Cache léger, file offline                   |
| Cartes            | react-native-maps 1.20 (Google)     | Sélection de points, itinéraires            |
| Localisation      | expo-location                       | Position, permissions                       |
| Notifications     | expo-notifications                  | Push FCM                                    |
| Temps réel        | socket.io-client                    | Suivi, missions                             |
| Images            | expo-image                          | Cache et performance                        |
| Listes            | @shopify/flash-list                 | Fluidité sur low-end                        |
| Animations        | react-native-reanimated 4           | Micro-interactions sobres                   |
| WebBrowser        | expo-web-browser                    | Paiement Orange Money                       |
| Tests             | Jest + RNTL + Maestro               | Unitaire, composant, E2E                    |

---

## 2. Arborescence des routes

```text
app/
├── _layout.tsx                      # Providers + guard + deep links
├── index.tsx                        # Redirection selon session
├── (public)/
│   ├── onboarding.tsx               # 3 slides valeur produit
│   └── legal.tsx                    # CGU, confidentialité
├── (auth)/
│   ├── _layout.tsx
│   ├── login.tsx
│   ├── register.tsx
│   ├── otp.tsx
│   └── forgot-password.tsx           # demande + code + nouveau mot de passe
├── (app)/                            # espace authentifié du lot 1
│   ├── _layout.tsx                   # garde de session + mustChangePassword
│   ├── accueil.tsx
│   └── change-password.tsx
├── (client)/
│   ├── _layout.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx              # Accueil · Commandes · Packs · Notifs · Profil
│   │   ├── index.tsx
│   │   ├── orders.tsx
│   │   ├── packs.tsx
│   │   ├── notifications.tsx
│   │   └── profile.tsx
│   ├── order/
│   │   ├── catalog.tsx              # Étape 1
│   │   ├── treatment.tsx            # Étape 2
│   │   ├── review.tsx               # Étape 3 (devis)
│   │   ├── pickup.tsx               # Étape 4 (carte)
│   │   ├── delivery.tsx             # Étape 5 (carte)
│   │   ├── slot.tsx                 # Étape 6
│   │   ├── payment.tsx              # Étape 7
│   │   └── confirmation.tsx         # Étape 8
│   ├── orders/[id].tsx              # Suivi
│   ├── subscriptions/index.tsx
│   ├── subscriptions/[id].tsx
│   ├── addresses/index.tsx
│   ├── addresses/[id].tsx
│   └── profile/edit.tsx
├── (driver)/
│   ├── _layout.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx              # Missions · Historique · Profil
│   │   ├── index.tsx                # Dashboard
│   │   ├── missions.tsx
│   │   ├── history.tsx
│   │   └── profile.tsx
│   ├── mission/[id].tsx
│   ├── mission/[id]/pickup-check.tsx
│   ├── mission/[id]/drop-off.tsx
│   └── mission/[id]/delivery.tsx
├── (pressing)/
│   ├── _layout.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx              # File · Traitement · Historique · Profil
│   │   ├── index.tsx                # Dashboard
│   │   ├── queue.tsx                # Kanban
│   │   ├── history.tsx
│   │   └── profile.tsx
│   ├── order/[id].tsx
│   ├── order/[id]/receive.tsx
│   └── order/[id]/treat.tsx
├── (admin)/
│   ├── _layout.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx              # Dashboard · Commandes · Opérations · Finances · Plus
│   │   ├── index.tsx
│   │   ├── orders.tsx
│   │   ├── operations.tsx
│   │   ├── finance.tsx
│   │   └── more.tsx
│   ├── orders/[id].tsx
│   ├── catalog/index.tsx
│   ├── catalog/[id].tsx
│   ├── packs/index.tsx
│   ├── packs/[id].tsx
│   ├── users/index.tsx
│   ├── users/[id].tsx
│   ├── users/new.tsx
│   ├── drivers/index.tsx
│   ├── pressings/index.tsx
│   ├── disputes/index.tsx
│   ├── disputes/[id].tsx
│   ├── banners/index.tsx
│   ├── zones/index.tsx
│   ├── audit.tsx
│   └── settings.tsx
├── (shared)/
│   ├── notifications/index.tsx
│   ├── payment/callback.tsx         # Deep link retour OM
│   ├── payment/[id].tsx
│   ├── dispute/[id].tsx
│   ├── support.tsx
│   └── profile/edit.tsx
└── +not-found.tsx
```

### Deep links

| Lien                                    | Destination                         |
| --------------------------------------- | ----------------------------------- |
| `finiko://order/FK-1042`                | `/(client)/orders/[id]` ou vue rôle |
| `finiko://packs`                        | Onglet packs                        |
| `finiko://payment/callback?ref=PAY-...` | `/(shared)/payment/callback`        |
| `finiko://mission/{orderId}`            | Mission livreur                     |
| `https://finiko.ml/app/order/FK-1042`   | Universal link (V1.1)               |

---

## 3. Gestion d'état

### 3.1 TanStack Query — clés

```ts
export const queryKeys = {
  me: ['me'] as const,
  catalog: (filters: CatalogFilters) => ['catalog', filters] as const,
  catalogItem: (id: string) => ['catalog', id] as const,
  packs: ['packs'] as const,
  pack: (id: string) => ['packs', id] as const,
  mySubscription: ['subscriptions', 'me'] as const,
  subscriptionUsage: (page: number) => ['subscriptions', 'usage', page] as const,
  orders: (role: Role, filters: OrderFilters) => ['orders', role, filters] as const,
  order: (id: string) => ['orders', id] as const,
  orderTimeline: (id: string) => ['orders', id, 'timeline'] as const,
  driverMissions: (type: MissionType) => ['driver', 'missions', type] as const,
  pressingQueue: (status: string) => ['pressing', 'queue', status] as const,
  notifications: (page: number) => ['notifications', page] as const,
  unreadCount: ['notifications', 'unread'] as const,
  adminMetrics: ['admin', 'metrics'] as const,
  adminOrders: (filters: AdminOrderFilters) => ['admin', 'orders', filters] as const,
  adminUsers: (filters: UserFilters) => ['admin', 'users', filters] as const,
  adminFinance: (period: string) => ['admin', 'finance', period] as const,
  disputes: (filters: DisputeFilters) => ['disputes', filters] as const,
  dispute: (id: string) => ['disputes', id] as const,
};
```

### 3.2 Stratégies de cache

| Donnée           | `staleTime` | Refetch                        | Notes           |
| ---------------- | ----------: | ------------------------------ | --------------- |
| Catalogue        |      10 min | on focus                       | Change rarement |
| Packs            |       5 min | on focus                       |                 |
| Abonnement       |        30 s | socket + focus                 | Jauge critique  |
| Liste commandes  |        30 s | on focus                       |                 |
| Détail commande  |        10 s | socket + polling 30 s si actif |                 |
| Missions livreur |        10 s | socket + focus                 |                 |
| File pressing    |        10 s | socket + focus                 |                 |
| Notifications    |        30 s | socket                         |                 |
| KPI admin        |        60 s | interval 2 min                 |                 |

### 3.3 Invalidation après mutation

| Mutation          | Invalide                                                 |
| ----------------- | -------------------------------------------------------- |
| Créer commande    | `orders`, `mySubscription`, `order(id)`, `unreadCount`   |
| Payer             | `order(id)`, `orders`, `mySubscription`, `notifications` |
| Souscrire         | `mySubscription`, `packs`, `notifications`               |
| Action livreur    | `driverMissions`, `order(id)`, `orders`                  |
| Action pressing   | `pressingQueue`, `order(id)`, `orders`                   |
| Résolution litige | `disputes`, `order(id)`, `orders`                        |
| Action admin      | `admin*`, ressource concernée                            |

### 3.4 Zustand

```ts
// stores/auth.store.ts — implémentation lot 1
interface AuthState {
  user: PublicUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  status: 'loading' | 'anonymous' | 'authenticated';
  hydrate: () => Promise<void>; // lit SecureStore au démarrage
  setSession: (session: AuthSession) => void; // login, refresh, OTP
  setUser: (user: PublicUser) => void;
  clear: () => Promise<void>; // logout, suspension, mot de passe changé
}

// stores/draft-order.store.ts
interface DraftOrderState {
  items: Record<string, DraftItem>; // clé catalogItemId
  pickup: DraftAddress | null;
  delivery: DraftAddress | null;
  pickupSlot: Slot | null;
  perfume: Perfume;
  notes: string;
  useSubscription: boolean;
  quote: Quote | null;
  setItem: (item: CatalogItem, treatment: Treatment, quantity: number) => void;
  removeItem: (id: string) => void;
  reset: () => void;
}
```

Le brouillon est persisté (MMKV) mais **jamais** les prix : ils sont toujours issus du devis serveur.

Pour l'authentification, les jetons sont stockés via `expo-secure-store` (localStorage sur le web) et jamais dans l'état persistant Zustand. Le client API attache le Bearer et effectue un refresh single-flight sur `401`.

---

## 4. Design system

### 4.1 Tokens

```ts
export const colors = {
  brand: {
    50: '#EEF4FF',
    100: '#D9E5FF',
    500: '#2F6BFF',
    600: '#0A3D91', // Bleu FINIKO
    700: '#082F6E',
  },
  accent: {
    orange: '#FF7900', // Orange Money
    cyan: '#00B8D9',
  },
  success: '#16A34A',
  warning: '#F59E0B',
  danger: '#DC2626',
  info: '#2563EB',
  neutral: {
    0: '#FFFFFF',
    50: '#F6F8FC',
    100: '#EEF2F7',
    200: '#E2E8F0',
    400: '#94A3B8',
    500: '#64748B',
    700: '#334155',
    900: '#0F172A',
  },
  overlay: 'rgba(15, 23, 42, 0.45)',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32, '3xl': 48 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, full: 9999 };
export const typography = {
  display: { fontFamily: 'Poppins_700Bold', fontSize: 32, lineHeight: 38 },
  h1: { fontFamily: 'Poppins_700Bold', fontSize: 26, lineHeight: 32 },
  h2: { fontFamily: 'Poppins_600SemiBold', fontSize: 20, lineHeight: 26 },
  h3: { fontFamily: 'Poppins_600SemiBold', fontSize: 17, lineHeight: 22 },
  body: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: 'Inter_600SemiBold', fontSize: 15, lineHeight: 22 },
  caption: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 16 },
  price: { fontFamily: 'Poppins_700Bold', fontSize: 22, lineHeight: 28 },
};
```

**Mode sombre** : mêmes tokens avec fond `#0B1220`, surface `#111A2E`, texte `#E2E8F0`. Les couleurs de statut restent accessibles (contraste ≥ 4,5:1).

### 4.2 Couleurs de statut

| Statut                                      | Couleur     | Icône        |
| ------------------------------------------- | ----------- | ------------ |
| `en_attente_paiement`                       | warning     | horloge      |
| `confirmee`                                 | info        | check        |
| `ramassage_assigne`                         | info        | moto         |
| `ramassage_en_cours`                        | brand       | navigation   |
| `ramassee`                                  | brand       | sac          |
| `deposee_au_pressing` / `au_pressing`       | accent cyan | boutique     |
| `en_traitement`                             | accent cyan | eau          |
| `prete`                                     | success     | étincelles   |
| `livraison_assignee` / `livraison_en_cours` | brand       | camion       |
| `livree`                                    | success     | maison       |
| `terminee`                                  | neutral     | check-cercle |
| `annulee`                                   | danger      | x            |
| `litige`                                    | danger      | alerte       |

### 4.3 Composants UI

| Composant         | Usage                               | Points d'attention                            |
| ----------------- | ----------------------------------- | --------------------------------------------- |
| `Button`          | Primaire, secondaire, ghost, danger | États loading/disabled, 48 px min             |
| `Input`           | Texte, téléphone, mot de passe      | Label flottant, erreur inline, clavier adapté |
| `PhoneInput`      | +223 fixe, saisie 8 chiffres        | Formatage automatique                         |
| `OtpInput`        | 6 cases                             | Collage, auto-submit, countdown               |
| `Card`            | Surface élevée                      | Ombre légère, radius 16                       |
| `Badge`           | Statut, prestation                  | Couleur + texte (pas seulement couleur)       |
| `Stepper`         | Suivi commande                      | Vertical, étapes passées/actives/futures      |
| `QuotaGauge`      | Jauge de pack                       | `used/total`, couleur selon seuil             |
| `PackCard`        | Offre                               | Prix, quota, avantages, badge                 |
| `OrderCard`       | Liste commande                      | Numéro, statut, date, montant, CTA            |
| `MapPicker`       | Ramassage/livraison                 | Marqueur draggable, recherche, confirmation   |
| `PriceBreakdown`  | Devis                               | Lignes lisibles, total mis en avant           |
| `QuantityStepper` | Quantité                            | − / +, limite, accessibilité                  |
| `BottomSheet`     | Filtres, actions                    | `@gorhom/bottom-sheet`, snap points           |
| `EmptyState`      | Vide                                | Illustration, message, CTA                    |
| `Skeleton`        | Chargement                          | Pas de spinner plein écran                    |
| `Toast`           | Feedback                            | Succès/erreur, safe area                      |
| `ConfirmDialog`   | Actions sensibles                   | Annulation, suppression, remboursement        |
| `OfflineBanner`   | Hors ligne                          | Actions en attente                            |

### 4.4 Règles UX

- **3 taps** pour ajouter un article, **1 écran = 1 décision**.
- Toujours afficher le **prix final** avant paiement, avec la part pack et la part à payer.
- Ne jamais masquer un supplément : le client doit comprendre pourquoi il paie.
- Les actions irréversibles (annuler, rembourser, suspendre) demandent confirmation.
- Les états vides proposent une action, jamais un écran blanc.
- Les erreurs sont en français, actionnables (« Réessayer », « Changer de point »).
- Les montants sont formatés `12 500 FCFA` (espace insécable, pas de décimales).
- Les dates relatives (« Aujourd'hui 14:05 ») avec heure absolue au tap.
- Accessibilité : cibles 44×44, labels `accessibilityLabel`, support lecteur d'écran, contraste AA, respect de la taille de police système.

---

## 5. Écrans par rôle

### 5.1 Client — Accueil

```text
┌─────────────────────────────────────┐
│ Bonjour Awa 👋          🔔(2)       │
│ Bamako · Hamdallaye                 │
├─────────────────────────────────────┤
│ [ Bannière promo -20% ce week-end ] │
│ [ ● ○ ○ ]                           │
├─────────────────────────────────────┤
│ Mon Pack Normal          Actif      │
│ ████████████░░░░  7 / 10 unités     │
│ Expire le 05 déc.      [Commander]  │
├─────────────────────────────────────┤
│ [Commander] [Suivre] [Packs]        │
├─────────────────────────────────────┤
│ Nos services                        │
│ ┌────────┐ ┌────────┐ ┌──────────┐ │
│ │Lavage  │ │Repass. │ │Lavage+Rep│ │
│ │dès 800 │ │dès 500 │ │dès 1 200 │ │
│ └────────┘ └────────┘ └──────────┘ │
├─────────────────────────────────────┤
│ Packs & abonnements      Voir tout  │
│ [Essentiel] [Normal ✓] [Premium] →  │
├─────────────────────────────────────┤
│ Dernière commande                   │
│ #FK-1042 · En traitement            │
│ 10 articles · 3 200 FCFA      [>]   │
└─────────────────────────────────────┘
```

**Actions** : ouvrir une bannière (deep link), commander, suivre, voir les packs, ouvrir la dernière commande.
**États** : skeletons, pack absent (CTA découvrir), aucune commande (illustration + CTA), bannière vide (masquer le bloc).

### 5.2 Client — Devis

- Liste compacte des lignes avec badge de prestation et badge « Couvert » / « Hors pack ».
- Bloc `PriceBreakdown` sticky en bas.
- Encart quota : `10 unités disponibles → 0 après commande`.
- CTA « Continuer » désactivé si un article est indisponible.
- Lien « Modifier mon panier ».

### 5.3 Client — Suivi

```text
┌─────────────────────────────────────┐
│ <  #FK-1042            [Appeler]    │
│     En traitement                   │
├─────────────────────────────────────┤
│  ✓ Commande confirmée     13:40     │
│  ✓ Linge ramassé          15:12     │
│  ✓ Au pressing            16:02     │
│  ● Traitement en cours    16:20     │
│  ○ Prêt                             │
│  ○ En livraison                     │
│  ○ Livré                            │
├─────────────────────────────────────┤
│ Pressing Koulouba                   │
│ 10 articles · Lavage + repassage    │
│ Prévu demain entre 14h et 18h       │
├─────────────────────────────────────┤
│ [Voir le détail] [Signaler]         │
└─────────────────────────────────────┘
```

- Mise à jour live via socket ; bandeau « Mise à jour… » pendant le refetch.
- Bouton « Annuler » visible uniquement si `actions.canCancel`.
- Preuve photo à la livraison.

### 5.4 Client — Packs

- Liste verticale de `PackCard` : nom, prix/mois, quota, prestations incluses, avantages, badge.
- Comparateur simple (tableau) en bas.
- Bouton « Souscrire » → confirmation → OM.
- Si abonnement actif : bandeau « Votre pack actuel », bouton « Renouveler » (programmé).
- Historique des abonnements et ledger de quota.

### 5.5 Livreur — Dashboard & mission

```text
┌─────────────────────────────────────┐
│ Oumar · Disponible ▾       🔔       │
│ 3 ramassages · 2 livraisons         │
├─────────────────────────────────────┤
│ [Ramassages] [Livraisons] [Tout]    │
├─────────────────────────────────────┤
│ #FK-1042   2,4 km   Aujourd'hui 14h │
│ Awa T. · Hamdallaye ACI             │
│ 10 articles · L+Rep                 │
│ [Ouvrir la mission]                 │
├─────────────────────────────────────┤
│ #FK-1045   4,1 km   Aujourd'hui 16h │
│ ...                                 │
└─────────────────────────────────────┘
```

**Mission ramassage** :

1. Carte + itinéraire + distance/ETA.
2. Boutons : `Accepter`, `Appeler`, `Je suis arrivé`.
3. Écran de conformité : liste des lignes, cases par ligne, note, photos.
4. Validation → statut `ramassee`, retour dashboard.

**Mission livraison** :

1. Récupération au pressing (contrôle du nombre d'articles, photo).
2. Itinéraire vers le client.
3. Remise : photo, nom du destinataire, cash éventuel.
4. Statut `livree`.

### 5.6 Pressing — Kanban

```text
┌─────────────────────────────────────┐
│ Pressing Koulouba      Charge 68%   │
│ [Réception(3)] [Traitement(5)] [Prêts(2)] │
├─────────────────────────────────────┤
│ #FK-1042  reçu 16:02   [Recevoir]   │
│ 10 articles · L+Rep · Express       │
├─────────────────────────────────────┤
│ #FK-1040  en cours     [Traiter]    │
│ 6 articles · 4 terminus             │
└─────────────────────────────────────┘
```

**Écran de traitement** :

- En-tête : numéro, client masqué, créneau, compteur `4/6 terminés`.
- Regroupement par prestation (onglets Lavage / Repassage / Lavage + repassage).
- Chaque ligne : nom, quantité, badge, bouton Démarrer/Terminer.
- Bouton sticky « Déclarer prêt » désactivé tant que tout n'est pas terminé.
- Signalement d'écart accessible depuis le menu.

### 5.7 Admin — Dashboard

```text
┌─────────────────────────────────────┐
│ FINIKO Admin            ⚙️  🔔      │
│ Aujourd'hui                         │
├─────────────────────────────────────┤
│ CA du jour        245 000 FCFA      │
│ ▁▂▃▅▆▇█  +12% vs hier              │
├─────────────────────────────────────┤
│ [Commandes 38] [En cours 22]        │
│ [Litiges 1]    [Retards 3]          │
├─────────────────────────────────────┤
│ Abonnements actifs 84               │
│ Quota consommé     61%              │
│ ██████████░░░░░                     │
├─────────────────────────────────────┤
│ Opérations                          │
│ Livreurs dispo 6 · En mission 9     │
│ Pressings actifs 4                  │
├─────────────────────────────────────┤
│ Dernières commandes          Voir   │
│ #FK-1042 · Awa · En traitement      │
└─────────────────────────────────────┘
```

**Onglet « Plus »** : catalogue, packs, utilisateurs, livreurs, pressings, bannières, zones, litiges, audit, paramètres, déconnexion.

### 5.8 Écrans partagés

- **Notifications** : liste groupée par jour, badge non lu, tap → deep link.
- **Paiement callback** : écran de vérification (spinner + « Nous vérifions votre paiement… »), puis succès/échec. Jamais de validation sur simple retour.
- **Litige** : fil de messages, ajout de photos, statut, résolution.
- **Profil** : infos, téléphone, email, mot de passe, notifications, CGU, suppression de compte.
- **Support** : FAQ, appel, WhatsApp, email.

---

## 6. Cartes et géolocalisation (UX)

### 6.1 Composant `MapPicker`

```tsx
<MapPicker
  label="Point de ramassage"
  initial={draft.pickup ?? userPosition}
  onConfirm={(place) => setPickup(place)}
  searchEnabled
  showMyPosition
/>
```

**Comportement** :

1. Demande de permission `expo-location` avec explication avant le prompt système.
2. Carte centrée sur la position ou le quartier par défaut (Bamako).
3. Marqueur central draggable : « Déplacez la carte pour positionner le pin ».
4. Reverse geocoding debounced (500 ms) pour proposer une adresse.
5. Recherche Places (via API) avec biais géographique Bamako.
6. Bouton « Ma position ».
7. Formulaire complémentaire : libellé, contact, instructions.
8. Confirmation : point + adresse texte obligatoires.

**Échecs** : permission refusée → saisie manuelle + point par défaut du quartier ; pas de réseau → dernière position + adresse manuelle ; hors zone → message et suggestion.

### 6.2 Itinéraire livreur

- `react-native-maps-directions` ou deep link `google.navigation:q=lat,lng`.
- Choix : navigation interne (dans l'app) ou Google Maps externe.
- Distance/ETA affichés avant acceptation.
- Mise à jour de la position toutes les 15 s, même app en arrière-plan (foreground service Android pour les missions actives).

### 6.3 Confidentialité

- Le client voit le prénom du livreur et un numéro masqué (si proxy disponible) ou son numéro professionnel.
- Le livreur voit l'adresse complète uniquement après acceptation.
- Les coordonnées exactes ne sont pas exposées dans les listes publiques.
- La position du livreur n'est partagée qu'avec le client de la mission en cours et les admins.

---

## 7. Mode hors ligne et robustesse

| Situation                  | Comportement                                                                    |
| -------------------------- | ------------------------------------------------------------------------------- |
| Ouverture sans réseau      | Auth restaurée depuis SecureStore, cache Query affiché, bandeau « Hors ligne ». |
| Action livreur sans réseau | File locale (MMKV) avec UUID, UI optimiste, badge « en attente ».               |
| Reconnexion                | Rejeu séquentiel, idempotence serveur, résolution des conflits (serveur gagne). |
| Upload photo échoué        | File d'upload, retry exponentiel, compression < 1 Mo.                           |
| Paiement interrompu        | `GET /payments/:id` au retour, écran de vérification.                           |
| Socket coupé               | Polling 30 s sur les écrans actifs.                                             |
| Token expiré               | Refresh single-flight, rejeu de la requête initiale.                            |
| App tuée                   | Brouillon de commande restauré, mission en cours restaurée.                     |

```ts
// lib/offline-queue.ts
type QueuedAction = {
  id: string;
  type: 'ARRIVE' | 'CONFORMITY' | 'DROP_OFF' | 'PICKUP_PRESSING' | 'DELIVER';
  orderId: string;
  payload: unknown;
  createdAt: string;
};

export async function enqueue(action: QueuedAction) {
  /* MMKV */
}
export async function flushQueue(api: ApiClient) {
  const actions = readQueue().sort(byCreatedAt);
  for (const action of actions) {
    try {
      await api.send(action); // Idempotency-Key = action.id
      removeFromQueue(action.id);
    } catch (error) {
      if (isRetryable(error)) break; // on garde l'ordre
      removeFromQueue(action.id); // erreur métier définitive
      notifyConflict(action, error);
    }
  }
}
```

---

## 8. Performance

- **FlashList** pour toutes les listes longues (commandes, catalogue, missions).
- **expo-image** avec `contentFit`, placeholder blurhash, cache disque.
- Images uploadées compressées (max 1600 px, qualité 0,75).
- Pas de re-render global : sélecteurs Zustand fins, `memo` sur les cartes.
- Skeletons plutôt que spinners plein écran.
- Écrans critiques préchargés (accueil, commande, suivi).
- Éviter les librairies lourdes ; mesurer avec Flipper/React DevTools.
- Budget : démarrage à froid < 3 s sur un Android 4 Go, écran liste < 1 s après cache.

---

## 9. Accessibilité et internationalisation

- Français par défaut ; architecture i18n prête (fichiers `fr.json`, `bm.json`).
- Dates et montants localisés (`Intl.NumberFormat('fr-ML')`).
- Support du mode sombre système.
- Police système agrandie : layouts flexibles, pas de hauteur fixe sur les textes.
- `accessibilityRole`, `accessibilityLabel`, `accessibilityHint` sur les actions.
- Respect de `reduceMotion`.
- Contraste AA sur tous les textes.

---

## 10. Tests

| Niveau    | Outil                        | Périmètre                                                               |
| --------- | ---------------------------- | ----------------------------------------------------------------------- |
| Unitaire  | Jest                         | formatage FCFA, machines à états, calcul de devis, file offline         |
| Composant | React Native Testing Library | formulaires, cartes, stepper, quotas                                    |
| Contrat   | Zod + MSW                    | réponses API mockées conformes au contrat                               |
| E2E       | Maestro                      | login, commande pack, paiement simulé, mission livreur, pressing, admin |
| Visuel    | Storybook (option)           | composants UI                                                           |

**Scénarios E2E critiques** :

1. Inscription client + OTP + login.
2. Souscription pack + paiement mocké + quota crédité.
3. Commande couverte par pack + suivi jusqu'à livraison.
4. Commande avec surplus + paiement échoué + réservation libérée.
5. Livreur : conformité OK, dépôt, récupération, livraison.
6. Pressing : réception, traitement article par article, prêt.
7. Admin : création catalogue, pack, affectation, remboursement.
8. Litige : ouverture client, réponse pressing, résolution admin.

---

## 11. Build et release

### Profils EAS

```json
{
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "preview": { "distribution": "internal", "channel": "preview" },
    "production": { "autoIncrement": true, "channel": "production" }
  },
  "submit": { "production": { "android": { "serviceAccountKeyPath": "./secrets/play.json" } } }
}
```

### Variables d'environnement

| Variable                              | Exemple                        |
| ------------------------------------- | ------------------------------ |
| `EXPO_PUBLIC_API_URL`                 | `https://api.finiko.ml/api/v1` |
| `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY` | clé restreinte package + SHA   |
| `EXPO_PUBLIC_SENTRY_DSN`              | DSN                            |
| `EXPO_PUBLIC_ENV`                     | `production`                   |

### Release

1. CI : lint + typecheck + tests.
2. `eas build --profile production --platform android`.
3. Test interne (Play Console closed testing).
4. `eas submit`.
5. OTA uniquement pour correctifs JS compatibles avec le binaire ; toute modification native exige un nouveau build.
6. Versioning `versionCode` auto-incrémenté, `version` sémantique.

---

## 12. Arborescence `src/`

```text
src/
├── api/
│   ├── client.ts
│   ├── query-client.ts
│   └── endpoints/
│       ├── auth.ts
│       ├── catalog.ts
│       ├── packs.ts
│       ├── subscriptions.ts
│       ├── orders.ts
│       ├── driver.ts
│       ├── pressing.ts
│       ├── payments.ts
│       ├── disputes.ts
│       ├── notifications.ts
│       └── admin.ts
├── components/
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── PhoneInput.tsx
│   │   ├── OtpInput.tsx
│   │   ├── Card.tsx
│   │   ├── Badge.tsx
│   │   ├── BottomSheet.tsx
│   │   ├── EmptyState.tsx
│   │   ├── Skeleton.tsx
│   │   └── Toast.tsx
│   └── business/
│       ├── PackCard.tsx
│       ├── QuotaGauge.tsx
│       ├── OrderCard.tsx
│       ├── OrderStepper.tsx
│       ├── PriceBreakdown.tsx
│       ├── MapPicker.tsx
│       ├── ConformityList.tsx
│       ├── TreatmentLine.tsx
│       └── NotificationRow.tsx
├── features/
│   ├── auth/
│   ├── catalog/
│   ├── cart/
│   ├── subscriptions/
│   ├── orders/
│   ├── missions/
│   ├── pressing/
│   ├── admin/
│   └── disputes/
├── stores/
│   ├── auth.store.ts
│   ├── draft-order.store.ts
│   └── ui.store.ts
├── theme/
│   ├── tokens.ts
│   ├── ThemeProvider.tsx
│   └── useTheme.ts
├── lib/
│   ├── format.ts
│   ├── geo.ts
│   ├── storage.ts
│   ├── offline-queue.ts
│   ├── permissions.ts
│   └── validation.ts
└── types/
```

---

## 13. Wireframes clés (basse fidélité)

### Tunnel de commande

```text
[Catalogue] → [Prestations] → [Devis] → [Carte ramassage]
     → [Carte livraison] → [Créneau] → [Paiement] → [Confirmation]
```

Chaque étape a :

- un header avec retour + progression `3/7`,
- un contenu scrollable,
- un CTA sticky en bas avec le total à payer,
- un état de sortie (brouillon conservé).

### Mission livreur

```text
[Itinéraire] → [Je suis arrivé] → [Conformité] → [Dépôt] → [Récupération] → [Livraison]
```

Le CTA principal change de libellé selon l'étape ; une seule action possible à la fois.

### Pressing

```text
[File] → [Réception] → [Traitement par prestation] → [Prêt]
```

Le pressing peut traiter plusieurs commandes en parallèle ; la vue kanban est la source de vérité.
