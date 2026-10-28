import { useCallback, useState } from "react";

import { CategoryService } from "@/services/category.service";
import type { Category } from "@/types/category";
import { t } from "@/i18n";
import { useLoadEffect } from "@/hooks/use-load-effect";

export type PopularCategoriesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "success"; categories: Category[] };

export function usePopularCategories() {
  const [state, setState] = useState<PopularCategoriesState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const categories = await CategoryService.getPopularCategories();
      setState(
        categories.length > 0 ? { status: "success", categories } : { status: "empty" },
      );
    } catch {
      setState({
        status: "error",
        message: t("hooks.usePopularCategories.unableToLoadPopularSearches"),
      });
    }
  }, []);

  useLoadEffect(load);

  return { state, retry: load };
}
