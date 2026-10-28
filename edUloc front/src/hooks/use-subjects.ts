import { useCallback, useState } from "react";

import { CategoryService } from "@/services/category.service";
import type { Category } from "@/types/category";
import { t } from "@/i18n";
import { useLoadEffect } from "@/hooks/use-load-effect";

export type SubjectsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "success"; categories: Category[] };

/** Loads the full subject/category catalog for the "Que recherchez-vous ?" step. */
export function useSubjects() {
  const [state, setState] = useState<SubjectsState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const categories = await CategoryService.getCategories();
      setState(categories.length > 0 ? { status: "success", categories } : { status: "empty" });
    } catch {
      setState({ status: "error", message: t("hooks.useSubjects.unableToLoadTheSubjects") });
    }
  }, []);

  useLoadEffect(load);

  return { state, retry: load };
}
