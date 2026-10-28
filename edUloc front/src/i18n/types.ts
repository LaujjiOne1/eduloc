/** Même arborescence que T, mais toutes les feuilles sont des chaînes : sert à forcer chaque langue à suivre le français. */
export type DeepString<T> = {
  [K in keyof T]: T[K] extends readonly string[] ? string[] : T[K] extends string ? string : DeepString<T[K]>;
};
