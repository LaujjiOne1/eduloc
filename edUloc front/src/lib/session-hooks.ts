/**
 * Actions à exécuter AVANT la déconnexion (ex. retirer l'appareil des notifications push du compte).
 * Registre sans dépendance native : la couche de services reste exécutable hors de React Native (tests Node).
 */
type Cleanup = () => Promise<void>;

const cleanups = new Set<Cleanup>();

export function onBeforeLogout(cleanup: Cleanup): () => void {
  cleanups.add(cleanup);
  return () => {
    cleanups.delete(cleanup);
  };
}

export async function runBeforeLogout(): Promise<void> {
  await Promise.all([...cleanups].map((cleanup) => cleanup().catch(() => undefined)));
}
