import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  adminCreateUserSchema,
  adminUpdateUserSchema,
  type AdminCreateUserInput,
  type AdminUpdateUserInput,
  type UserRole,
} from '@finiko/contracts';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  createAdminUserRequest,
  deleteAdminUserRequest,
  getAdminUserRequest,
  updateAdminUserRequest,
  updateAdminUserStatusRequest,
} from '../../src/api/admin';
import { ApiClientError } from '../../src/api/client';
import { USER_ROLE_LABELS, USER_STATUS_LABELS } from '../../src/lib/labels';
import { roleHome } from '../../src/lib/role-home';
import { useAuthStore } from '../../src/stores/auth.store';
import {
  CheckRow,
  DangerButton,
  Field,
  InlineMessage,
  PrimaryButton,
  SecondaryButton,
} from '../../src/ui/auth';
import { ChoiceChips, FormSection } from '../../src/ui/forms';
import { Card, LoadingBlock, Pill, Screen } from '../../src/ui/screen';
import { colors, spacing, typography } from '../../src/theme/tokens';

type ManagedRole = 'client' | 'livreur' | 'pressing' | 'admin';
type VehicleType = 'moto' | 'voiture' | 'tricycle';

const ROLE_OPTIONS: ReadonlyArray<{ value: ManagedRole; label: string }> = [
  { value: 'client', label: 'Client' },
  { value: 'livreur', label: 'Livreur' },
  { value: 'pressing', label: 'Pressing' },
  { value: 'admin', label: 'Administrateur' },
];

const VEHICLE_OPTIONS: ReadonlyArray<{ value: VehicleType; label: string }> = [
  { value: 'moto', label: 'Moto' },
  { value: 'voiture', label: 'Voiture' },
  { value: 'tricycle', label: 'Tricycle' },
];

function toManagedRole(value: string | undefined): ManagedRole {
  return value === 'client' || value === 'pressing' || value === 'admin' ? value : 'livreur';
}

function parseNumber(value: string, label: string): number {
  const parsed = Number(value.replace(',', '.'));

  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} invalide.`);
  }

  return parsed;
}

function parseIntValue(value: string, label: string): number {
  const parsed = parseNumber(value, label);

  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} doit être un nombre entier.`);
  }

  return parsed;
}

function parseZoneCodes(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export default function AdminUserFormScreen() {
  const params = useLocalSearchParams<{ id?: string; role?: string }>();
  const userId = typeof params.id === 'string' ? params.id : undefined;
  const isEdit = Boolean(userId);
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);

  const [role, setRole] = useState<UserRole>(toManagedRole(params.role));
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mustChangePassword, setMustChangePassword] = useState(role !== 'admin');
  const [vehicleType, setVehicleType] = useState<VehicleType>('moto');
  const [plate, setPlate] = useState('');
  const [zoneCodes, setZoneCodes] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [addressText, setAddressText] = useState('');
  const [latitude, setLatitude] = useState('12.6392');
  const [longitude, setLongitude] = useState('-8.0029');
  const [capacity, setCapacity] = useState('100');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ['admin', 'users', userId],
    queryFn: () => getAdminUserRequest(userId!),
    enabled: Boolean(userId),
  });

  useEffect(() => {
    const detail = detailQuery.data;
    if (!detail) return;

    setRole(detail.role);
    setFirstName(detail.firstName);
    setLastName(detail.lastName);
    setPhone(detail.phone);
    setEmail(detail.email ?? '');
    setMustChangePassword(detail.mustChangePassword);

    if (detail.driver) {
      setVehicleType(detail.driver.vehicleType);
      setPlate(detail.driver.plate ?? '');
      setZoneCodes(detail.driver.zoneCodes.join(', '));
    }

    if (detail.pressing) {
      setBusinessName(detail.pressing.businessName);
      setAddressText(detail.pressing.addressText);
      setLatitude(String(detail.pressing.location.lat));
      setLongitude(String(detail.pressing.location.lng));
      setCapacity(String(detail.pressing.capacity));
    }
  }, [detailQuery.data]);

  const invalidateAndBack = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    router.back();
  };

  const createMutation = useMutation({
    mutationFn: createAdminUserRequest,
    onSuccess: invalidateAndBack,
    onError: (caught) => {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'Le compte n’a pas pu être créé. Réessayez.',
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: AdminUpdateUserInput }) =>
      updateAdminUserRequest(id, input),
    onSuccess: invalidateAndBack,
    onError: (caught) => {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'Le compte n’a pas pu être mis à jour. Réessayez.',
      );
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'actif' | 'suspendu' }) =>
      updateAdminUserStatusRequest(id, status),
    onSuccess: async (_user, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setNotice(variables.status === 'suspendu' ? 'Compte suspendu.' : 'Compte réactivé.');
    },
    onError: (caught) => {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'Le statut du compte n’a pas pu être modifié.',
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAdminUserRequest,
    onSuccess: invalidateAndBack,
    onError: (caught) => {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'Le compte n’a pas pu être supprimé. Réessayez.',
      );
    },
  });

  if (!currentUser) return null;
  if (currentUser.role !== 'admin') return <Redirect href={roleHome(currentUser.role)} />;

  const buildCreateInput = (): AdminCreateUserInput => {
    const base = {
      role: role as ManagedRole,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      password,
      mustChangePassword,
      ...(email.trim() ? { email: email.trim() } : {}),
    };

    if (role === 'livreur') {
      return {
        ...base,
        driver: {
          vehicleType,
          ...(plate.trim() ? { plate: plate.trim() } : {}),
          zoneCodes: parseZoneCodes(zoneCodes),
        },
      };
    }

    if (role === 'pressing') {
      return {
        ...base,
        pressing: {
          businessName: businessName.trim(),
          addressText: addressText.trim(),
          location: {
            lat: parseNumber(latitude, 'Latitude'),
            lng: parseNumber(longitude, 'Longitude'),
          },
          ...(capacity.trim() ? { capacity: parseIntValue(capacity, 'Capacité') } : {}),
        },
      };
    }

    return base;
  };

  const buildUpdateInput = (): AdminUpdateUserInput => {
    const input: AdminUpdateUserInput = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      email: email.trim() ? email.trim() : null,
      mustChangePassword,
      ...(password.trim() ? { password } : {}),
    };

    if (role === 'livreur') {
      input.driver = {
        vehicleType,
        plate: plate.trim() ? plate.trim() : null,
        zoneCodes: parseZoneCodes(zoneCodes),
      };
    }

    if (role === 'pressing') {
      input.pressing = {
        businessName: businessName.trim(),
        addressText: addressText.trim(),
        location: {
          lat: parseNumber(latitude, 'Latitude'),
          lng: parseNumber(longitude, 'Longitude'),
        },
        ...(capacity.trim() ? { capacity: parseIntValue(capacity, 'Capacité') } : {}),
      };
    }

    return input;
  };

  const onSubmit = () => {
    setError(null);
    setNotice(null);

    try {
      if (userId) {
        const parsed = adminUpdateUserSchema.safeParse(buildUpdateInput());

        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
          return;
        }

        updateMutation.mutate({ id: userId, input: parsed.data });
        return;
      }

      const parsed = adminCreateUserSchema.safeParse(buildCreateInput());

      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
        return;
      }

      createMutation.mutate(parsed.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Formulaire invalide.');
    }
  };

  const confirmDelete = () => {
    if (!userId) return;

    Alert.alert(
      'Supprimer ce compte ?',
      'Le compte sera désactivé, déconnecté et retiré de la liste. Cette action est définitive.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(userId),
        },
      ],
    );
  };

  const toggleStatus = () => {
    const detail = detailQuery.data;
    if (!detail) return;

    const nextStatus: 'actif' | 'suspendu' = detail.status === 'actif' ? 'suspendu' : 'actif';
    const suspending = nextStatus === 'suspendu';

    Alert.alert(
      suspending ? 'Suspendre ce compte ?' : 'Réactiver ce compte ?',
      suspending
        ? 'Le titulaire sera déconnecté et ne pourra plus se connecter.'
        : 'Le titulaire pourra à nouveau se connecter.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: suspending ? 'Suspendre' : 'Réactiver',
          style: suspending ? 'destructive' : 'default',
          onPress: () => statusMutation.mutate({ id: detail.id, status: nextStatus }),
        },
      ],
    );
  };

  const saving = createMutation.isPending || updateMutation.isPending;
  const deleting = deleteMutation.isPending;
  const changingStatus = statusMutation.isPending;

  if (isEdit && detailQuery.isLoading) {
    return (
      <Screen onBack={() => router.back()} title="Modifier le compte">
        <LoadingBlock label="Chargement du compte…" />
      </Screen>
    );
  }

  if (isEdit && detailQuery.isError) {
    return (
      <Screen onBack={() => router.back()} title="Modifier le compte">
        <Card>
          <InlineMessage tone="error">
            Le compte n’a pas pu être chargé. Vérifiez votre connexion.
          </InlineMessage>
          <SecondaryButton label="Réessayer" onPress={() => void detailQuery.refetch()} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      onBack={() => router.back()}
      subtitle={
        isEdit
          ? 'Modifiez les informations du compte et son profil métier.'
          : 'Créez un compte client, livreur, pressing ou administrateur.'
      }
      title={isEdit ? 'Modifier le compte' : 'Nouveau compte'}
    >
      {notice ? <InlineMessage tone="success">{notice}</InlineMessage> : null}
      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}

      <Card>
        <FormSection title="Rôle">
          {isEdit ? (
            <View style={styles.roleRow}>
              <Text style={styles.roleLabel}>Rôle du compte</Text>
              <Pill label={USER_ROLE_LABELS[role]} tone="brand" />
            </View>
          ) : (
            <ChoiceChips
              onChange={(value) => {
                setRole(value);
                setMustChangePassword(value !== 'admin');
              }}
              options={ROLE_OPTIONS}
              value={role as ManagedRole}
            />
          )}

          {isEdit && detailQuery.data ? (
            <View style={styles.roleRow}>
              <Text style={styles.roleLabel}>Statut</Text>
              <Pill
                label={USER_STATUS_LABELS[detailQuery.data.status]}
                tone={detailQuery.data.status === 'actif' ? 'success' : 'danger'}
              />
            </View>
          ) : null}
        </FormSection>
      </Card>

      <Card>
        <FormSection title="Identité et contact">
          <Field
            autoCapitalize="words"
            label="Prénom"
            onChangeText={setFirstName}
            placeholder="Aminata"
            value={firstName}
          />
          <Field
            autoCapitalize="words"
            label="Nom"
            onChangeText={setLastName}
            placeholder="Traoré"
            value={lastName}
          />
          <Field
            autoCapitalize="none"
            keyboardType="phone-pad"
            label="Téléphone"
            onChangeText={setPhone}
            placeholder="+22370000004"
            value={phone}
          />
          <Field
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            label="Email (optionnel)"
            onChangeText={setEmail}
            placeholder="compte@finiko.ml"
            value={email}
          />
        </FormSection>
      </Card>

      <Card>
        <FormSection
          hint={
            isEdit
              ? 'Laissez vide pour conserver le mot de passe actuel.'
              : 'Le mot de passe doit contenir une majuscule, une minuscule et un chiffre.'
          }
          title="Sécurité"
        >
          <Field
            autoCapitalize="none"
            autoComplete="new-password"
            label={isEdit ? 'Nouveau mot de passe (optionnel)' : 'Mot de passe'}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            value={password}
          />

          {role !== 'admin' ? (
            <CheckRow
              checked={mustChangePassword}
              label="Demander le changement du mot de passe à la première connexion"
              onToggle={() => setMustChangePassword((value) => !value)}
            />
          ) : null}
        </FormSection>
      </Card>

      {role === 'livreur' ? (
        <Card>
          <FormSection
            hint="Le code livreur est généré automatiquement à la création."
            title="Profil livreur"
          >
            <Text style={styles.fieldLabel}>Type de véhicule</Text>
            <ChoiceChips onChange={setVehicleType} options={VEHICLE_OPTIONS} value={vehicleType} />
            <Field
              autoCapitalize="characters"
              label="Plaque d’immatriculation"
              onChangeText={setPlate}
              placeholder="AA-123-BB"
              value={plate}
            />
            <Field
              autoCapitalize="words"
              label="Zones desservies"
              onChangeText={setZoneCodes}
              placeholder="Bamako-Coura, Badalabougou"
              value={zoneCodes}
            />
          </FormSection>
        </Card>
      ) : null}

      {role === 'pressing' ? (
        <Card>
          <FormSection
            hint="Le code pressing est généré automatiquement à la création."
            title="Profil pressing"
          >
            <Field
              autoCapitalize="words"
              label="Nom du pressing"
              onChangeText={setBusinessName}
              placeholder="Pressing Faso"
              value={businessName}
            />
            <Field
              autoCapitalize="sentences"
              label="Adresse"
              onChangeText={setAddressText}
              placeholder="Quartier, rue, repère"
              value={addressText}
            />
            <Field
              autoCapitalize="none"
              keyboardType="default"
              label="Latitude"
              onChangeText={setLatitude}
              placeholder="12.6392"
              value={latitude}
            />
            <Field
              autoCapitalize="none"
              keyboardType="default"
              label="Longitude"
              onChangeText={setLongitude}
              placeholder="-8.0029"
              value={longitude}
            />
            <Field
              autoCapitalize="none"
              keyboardType="numeric"
              label="Capacité par jour"
              onChangeText={setCapacity}
              placeholder="100"
              value={capacity}
            />
          </FormSection>
        </Card>
      ) : null}

      <Card>
        <FormSection title="Actions">
          <PrimaryButton
            label={isEdit ? 'Enregistrer les modifications' : 'Créer le compte'}
            loading={saving}
            onPress={onSubmit}
          />

          {isEdit ? (
            <>
              <SecondaryButton
                label={
                  detailQuery.data?.status === 'actif'
                    ? 'Suspendre le compte'
                    : 'Réactiver le compte'
                }
                loading={changingStatus}
                onPress={toggleStatus}
              />
              <DangerButton
                label="Supprimer le compte"
                loading={deleting}
                onPress={confirmDelete}
              />
            </>
          ) : null}
        </FormSection>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  roleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  roleLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  fieldLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
});
