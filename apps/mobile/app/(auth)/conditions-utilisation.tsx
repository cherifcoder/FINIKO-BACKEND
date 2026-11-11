import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '../../src/theme/tokens';

interface Section {
  heading: string;
  paragraphs: string[];
}

const SECTIONS: Section[] = [
  {
    heading: '1. Objet et présentation du service',
    paragraphs: [
      'FINIKO est une plateforme de blanchisserie à domicile qui met en relation des clients, des livreurs et des pressings partenaires à Bamako (Mali). Le service couvre le ramassage du linge à votre adresse, son traitement par un pressing partenaire, puis sa livraison.',
      "Les présentes conditions d'utilisation (les « Conditions ») encadrent l'accès à l'application mobile FINIKO et l'utilisation du service. Toute inscription ou commande vaut acceptation pleine et entière des Conditions.",
    ],
  },
  {
    heading: '2. Création et gestion du compte client',
    paragraphs: [
      "La création d'un compte client nécessite un prénom, un nom, un numéro de téléphone et un mot de passe. Vous vous engagez à fournir des informations exactes et à maintenir votre numéro à jour : il sert au contact lors des ramassages et livraisons.",
      "Vous êtes responsable de la confidentialité de votre mot de passe. Toute activité réalisée depuis votre compte est réputée effectuée par vous. En cas de suspicion d'usage frauduleux, modifiez votre mot de passe depuis l'application et contactez le support.",
      "FINIKO peut suspendre ou supprimer un compte en cas de comportement abusif, de fausses déclarations ou d'usage du service contraire aux Conditions.",
    ],
  },
  {
    heading: '3. Commandes et services',
    paragraphs: [
      "Une commande décrit le linge à traiter (type d'articles, quantités) ainsi que les adresses et créneaux de ramassage et de livraison. Le tarif est calculé à partir du catalogue et des packs en vigueur, affichés dans l'application avant validation.",
      "La disponibilité des créneaux dépend des livreurs et pressings partenaires. FINIKO s'efforce de respecter les délais affichés ; un retard de livraison ne peut donner lieu à indemnisation automatique.",
      "Il vous appartient de vérifier le linge remis au livreur : seuls les articles déclarés dans la commande sont pris en charge. Ne confiez pas d'objets de valeur, de liquide ou de documents importants dans vos sachets de linge.",
    ],
  },
  {
    heading: '4. Prix et paiement',
    paragraphs: [
      "Les prix sont indiqués en francs CFA (FCFA) dans l'application. Le paiement peut être effectué à la livraison (espèces) ou via Orange Money selon les options proposées.",
      "Si vous bénéficiez d'un pack ou d'un abonnement actif, ses crédits sont consommés en priorité selon les règles affichées dans l'application. Les crédits d'un pack ont une durée de validité et ne sont ni remboursables ni cessibles.",
    ],
  },
  {
    heading: '5. Ramassage et livraison',
    paragraphs: [
      'Le livreur contrôle la conformité du linge remis par rapport à la commande lors du ramassage. Un écart manifeste (article non déclaré, linge très sale ou endommagé) peut entraîner un ajustement du tarif ou le refus partiel de la commande.',
      "À la livraison, vérifiez votre linge en présence du livreur et signalez immédiatement toute anomalie. Toute réclamation postérieure doit être adressée dans un délai de 24 heures via l'application ou le support.",
    ],
  },
  {
    heading: '6. Responsabilités',
    paragraphs: [
      "Le traitement du linge est réalisé par des pressings partenaires. FINIKO s'engage à sélectionner des partenaires sérieux et à accompagner le traitement des réclamations.",
      'La responsabilité de FINIKO est limitée au montant de la commande concernée. Sont exclus les dommages indirects et les articles de valeur exceptionnelle non déclarées au moment de la commande.',
      "Les signes d'usure normaux, les détériorations préexistantes et les risques inhérents à certains textiles (froissage, rétrécissement léger) ne relèvent pas d'une anomalie de traitement.",
    ],
  },
  {
    heading: '7. Annulation et réclamations',
    paragraphs: [
      "Vous pouvez annuler une commande tant qu'elle n'a pas été prise en charge par le livreur. Après ramassage, l'annulation peut être refusée si le traitement a commencé.",
      "En cas d'article perdu ou endommagé par le pressing partenaire, une réclamation ouverte dans les délais ouvre droit, après vérification, à un remboursement au prorata de la commande ou à un avoir, selon la situation.",
    ],
  },
  {
    heading: '8. Politique de confidentialité',
    paragraphs: [
      'FINIKO collecte uniquement les données nécessaires au service : identité (prénom, nom), numéro de téléphone, adresse email si fournie, adresses de ramassage et de livraison, historique des commandes et moyens de paiement utilisés.',
      'Ces données servent à exécuter les commandes, à assurer le suivi et le support, à lutter contre la fraude et à améliorer le service. Elles ne sont ni vendues ni cédées à des tiers à des fins commerciales.',
      'Vos identifiants et jetons de session sont stockés de manière sécurisée sur votre appareil. Vous pouvez demander la rectification ou la suppression de votre compte et de vos données personnelles en contactant le support.',
      "Conformément au droit malien applicable en matière de données personnelles, vous disposez d'un droit d'accès, de rectification et d'opposition sur vos données.",
    ],
  },
  {
    heading: '9. Modifications des Conditions',
    paragraphs: [
      "FINIKO peut faire évoluer les Conditions pour refléter les changements du service. La version applicable est celle affichée dans l'application au moment de votre commande ; les modifications majeures vous sont signalées à la prochaine ouverture de l'application.",
    ],
  },
  {
    heading: '10. Droit applicable et contact',
    paragraphs: [
      'Les présentes Conditions sont régies par le droit malien. Tout litige sera porté devant les juridictions compétentes de Bamako après tentative de résolution amiable.',
      "Pour toute question ou réclamation : support FINIKO, Bamako, Mali — via l'application (écran d'aide ou support technique).",
    ],
  },
];

/**
 * Conditions d'utilisation de FINIKO (CGU + politique de confidentialité).
 * Accessible depuis les écrans de connexion et d'inscription.
 */
export default function TermsScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Retour"
          accessibilityRole="button"
          hitSlop={12}
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/(auth)/login');
            }
          }}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Feather color={colors.neutral[700]} name="chevron-left" size={26} />
        </Pressable>
        <Text style={styles.headerTitle}>Conditions d&apos;utilisation</Text>
        <View style={styles.backButtonPlaceholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Conditions d&apos;utilisation de FINIKO</Text>
          <Text style={styles.cardMeta}>Version du 11 novembre 2026 — Bamako, Mali</Text>

          {SECTIONS.map((section) => (
            <View key={section.heading} style={styles.section}>
              <Text style={styles.sectionHeading}>{section.heading}</Text>
              {section.paragraphs.map((paragraph, index) => (
                <Text key={index} style={styles.paragraph}>
                  {paragraph}
                </Text>
              ))}
            </View>
          ))}

          <Text style={styles.paragraph}>
            En créant un compte ou en passant commande via FINIKO, vous reconnaissez avoir lu,
            compris et accepté l&apos;ensemble des présentes conditions.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  header: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  backButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  backButtonPlaceholder: {
    width: 40,
  },
  headerTitle: {
    ...typography.title,
    color: colors.text,
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  scrollContent: {
    padding: spacing.xl,
  },
  card: {
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 560,
    padding: spacing.xl,
    width: '100%',
  },
  cardTitle: {
    color: colors.neutral[900],
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  cardMeta: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionHeading: {
    color: colors.brand[700],
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  paragraph: {
    ...typography.body,
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: spacing.md,
  },
});
