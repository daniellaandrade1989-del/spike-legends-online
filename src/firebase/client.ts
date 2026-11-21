/**
 * Spike Legends Online — Cliente Firebase (Auth Google + Firestore) e Modo Convidado Local
 */
import { initializeApp, setLogLevel as setAppLogLevel } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  setLogLevel,
  updateDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { CharacterId, GameMode } from '../config/gameConfig';

setAppLogLevel('silent');
setLogLevel('silent');

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Verifique a configuração do Firebase.');
    }
  }
}
if (typeof window !== 'undefined') {
  void testConnection();
}

export interface PlayerProfile {
  uid: string;
  displayName: string;
  avatarCharacterId: CharacterId;
  flagCode: string;
  level: number;
  elo: number;
  wins: number;
  losses: number;
  spikes: number;
  isGuest: boolean;
  email?: string | null;
}

export interface MatchHistoryEntry {
  matchId: string;
  mode: GameMode;
  arenaId: string;
  characterId: CharacterId;
  teamScore: number;
  opponentScore: number;
  won: boolean;
  spikesCount: number;
  blocksCount: number;
}

const GUEST_STORAGE_KEY = 'spike_legends_guest_profile_v1';

export function loadOrCreateGuestProfile(preferredName?: string): PlayerProfile {
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PlayerProfile;
      if (parsed && parsed.uid && parsed.displayName) {
        return { ...parsed, isGuest: true };
      }
    }
  } catch {
    // fallback para novo convidado
  }

  const suffix = Math.floor(1000 + Math.random() * 9000);
  const guest: PlayerProfile = {
    uid: `guest_${suffix}_${Date.now().toString(36)}`,
    displayName: (preferredName || `Atleta_${suffix}`).slice(0, 20),
    avatarCharacterId: 'akira',
    flagCode: 'BR',
    level: 1,
    elo: 1000,
    wins: 0,
    losses: 0,
    spikes: 0,
    isGuest: true,
    email: null,
  };
  saveGuestProfile(guest);
  return guest;
}

export function saveGuestProfile(profile: PlayerProfile): void {
  try {
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // armazenamento indisponível
  }
}

export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  const res = await signInWithPopup(auth, provider);
  return res.user;
}

export async function signOutAccount(): Promise<void> {
  await signOut(auth);
}

export function subscribeAuth(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}

function sanitizeDisplayName(raw: string | null | undefined, uid: string): string {
  const clean = (raw || `Atleta_${uid.slice(0, 5)}`).trim().replace(/\s+/g, ' ');
  return clean.length >= 2 ? clean.slice(0, 24) : 'Atleta';
}

export async function syncFirebaseUserProfile(user: User): Promise<PlayerProfile> {
  const publicPath = `publicProfiles/${user.uid}`;
  const accountPath = `userAccounts/${user.uid}`;
  const publicRef = doc(db, 'publicProfiles', user.uid);
  const accountRef = doc(db, 'userAccounts', user.uid);

  let existingPublic: Record<string, unknown> | null = null;
  try {
    const snap = await getDoc(publicRef);
    if (snap.exists()) {
      existingPublic = snap.data();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, publicPath);
  }

  if (!existingPublic) {
    const cleanName = sanitizeDisplayName(user.displayName, user.uid);
    const initialPublic = {
      uid: user.uid,
      displayName: cleanName,
      avatarCharacterId: 'akira' as CharacterId,
      flagCode: 'BR',
      level: 1,
      elo: 1000,
      wins: 0,
      losses: 0,
      spikes: 0,
      updatedAt: serverTimestamp(),
    };
    try {
      await setDoc(publicRef, initialPublic);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, publicPath);
    }

    if (user.email) {
      try {
        const accSnap = await getDoc(accountRef);
        if (!accSnap.exists()) {
          await setDoc(accountRef, {
            uid: user.uid,
            email: user.email.slice(0, 160),
            soundMuted: false,
            musicVolume: 0.35,
            sfxVolume: 0.7,
            colorblindMode: false,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, accountPath);
      }
    }

    return {
      uid: user.uid,
      displayName: cleanName,
      avatarCharacterId: 'akira',
      flagCode: 'BR',
      level: 1,
      elo: 1000,
      wins: 0,
      losses: 0,
      spikes: 0,
      isGuest: false,
      email: user.email,
    };
  }

  return {
    uid: user.uid,
    displayName: String(existingPublic.displayName || 'Atleta'),
    avatarCharacterId: (existingPublic.avatarCharacterId as CharacterId) || 'akira',
    flagCode: String(existingPublic.flagCode || 'BR'),
    level: Number(existingPublic.level || 1),
    elo: Number(existingPublic.elo || 1000),
    wins: Number(existingPublic.wins || 0),
    losses: Number(existingPublic.losses || 0),
    spikes: Number(existingPublic.spikes || 0),
    isGuest: false,
    email: user.email,
  };
}

export async function updateProfileIdentity(
  profile: PlayerProfile,
  patch: { displayName?: string; avatarCharacterId?: CharacterId; flagCode?: string },
): Promise<PlayerProfile> {
  const next: PlayerProfile = {
    ...profile,
    displayName: patch.displayName ? sanitizeDisplayName(patch.displayName, profile.uid) : profile.displayName,
    avatarCharacterId: patch.avatarCharacterId ?? profile.avatarCharacterId,
    flagCode: patch.flagCode ?? profile.flagCode,
  };

  if (profile.isGuest || !auth.currentUser) {
    saveGuestProfile(next);
    return next;
  }

  const publicPath = `publicProfiles/${profile.uid}`;
  try {
    await updateDoc(doc(db, 'publicProfiles', profile.uid), {
      displayName: next.displayName,
      avatarCharacterId: next.avatarCharacterId,
      flagCode: next.flagCode,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, publicPath);
  }
  return next;
}

export async function recordMatchOutcome(
  profile: PlayerProfile,
  entry: Omit<MatchHistoryEntry, 'matchId'>,
): Promise<PlayerProfile> {
  const eloDelta = entry.won ? 24 : -16;
  const clampedElo = Math.max(0, Math.min(5000, profile.elo + eloDelta));
  const nextWins = profile.wins + (entry.won ? 1 : 0);
  const nextLosses = profile.losses + (entry.won ? 0 : 1);
  const nextSpikes = profile.spikes + Math.min(100, entry.spikesCount);
  const totalGames = nextWins + nextLosses;
  const nextLevel = Math.min(500, Math.max(profile.level, 1 + Math.floor(totalGames / 3)));

  const updated: PlayerProfile = {
    ...profile,
    wins: nextWins,
    losses: nextLosses,
    spikes: nextSpikes,
    level: nextLevel,
    elo: clampedElo,
  };

  if (profile.isGuest || !auth.currentUser) {
    saveGuestProfile(updated);
    return updated;
  }

  const publicPath = `publicProfiles/${profile.uid}`;
  try {
    await updateDoc(doc(db, 'publicProfiles', profile.uid), {
      level: nextLevel,
      elo: clampedElo,
      wins: nextWins,
      losses: nextLosses,
      spikes: nextSpikes,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, publicPath);
  }

  const matchId = `m_${profile.uid.slice(0, 8)}_${Date.now()}`;
  const matchPath = `matchHistory/${matchId}`;
  try {
    await setDoc(doc(db, 'matchHistory', matchId), {
      matchId,
      ownerUid: profile.uid,
      mode: entry.mode,
      arenaId: entry.arenaId.slice(0, 32),
      characterId: entry.characterId,
      teamScore: Math.max(0, Math.min(99, entry.teamScore)),
      opponentScore: Math.max(0, Math.min(99, entry.opponentScore)),
      won: entry.won,
      spikesCount: Math.max(0, Math.min(500, entry.spikesCount)),
      blocksCount: Math.max(0, Math.min(500, entry.blocksCount)),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, matchPath);
  }

  return updated;
}

export async function fetchLeaderboard(maxRows = 15): Promise<PlayerProfile[]> {
  if (!auth.currentUser) return [];
  const path = 'publicProfiles';
  try {
    const q = query(collection(db, 'publicProfiles'), orderBy('elo', 'desc'), limit(maxRows));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        uid: String(data.uid),
        displayName: String(data.displayName),
        avatarCharacterId: (data.avatarCharacterId as CharacterId) || 'akira',
        flagCode: String(data.flagCode || 'BR'),
        level: Number(data.level || 1),
        elo: Number(data.elo || 1000),
        wins: Number(data.wins || 0),
        losses: Number(data.losses || 0),
        spikes: Number(data.spikes || 0),
        isGuest: false,
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function fetchUserMatchHistory(uid: string, maxRows = 10): Promise<MatchHistoryEntry[]> {
  if (!auth.currentUser) return [];
  const path = 'matchHistory';
  try {
    const q = query(
      collection(db, 'matchHistory'),
      where('ownerUid', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(maxRows),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        matchId: String(data.matchId),
        mode: data.mode as GameMode,
        arenaId: String(data.arenaId),
        characterId: data.characterId as CharacterId,
        teamScore: Number(data.teamScore),
        opponentScore: Number(data.opponentScore),
        won: Boolean(data.won),
        spikesCount: Number(data.spikesCount),
        blocksCount: Number(data.blocksCount),
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}
