import { useEffect } from "react";

/**
 * Lance `load` au montage puis chaque fois que son identité change (ses dépendances ont changé).
 *
 * `load` met à jour l'état (« chargement » puis résultat) : l'appeler directement dans le corps d'un effet provoquerait un
 * rendu supplémentaire en cascade. Il est donc lancé dans un rappel asynchrone, et annulé si l'effet est nettoyé avant
 * (démontage, nouvelle dépendance), ce qui évite aussi de mettre à jour un écran déjà fermé.
 */
export function useLoadEffect(load: () => unknown): void {
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void load();
    });
    return () => {
      active = false;
    };
  }, [load]);
}
