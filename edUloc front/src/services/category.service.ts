import { api } from "@/api/http";
import { toCategory } from "@/api/mappers";
import type { SubjectDto } from "@/api/contracts/dto";
import type { Category } from "@/types/category";

/** Category = Subject. Route backend : GET /catalog/subjects. */
export const CategoryService = {
  async getPopularCategories(limit = 4): Promise<Category[]> {
    return (await api.get<SubjectDto[]>("/catalog/subjects", { limit }, { auth: false })).slice(0, limit).map(toCategory);
  },
  async getCategories(): Promise<Category[]> {
    return (await api.get<SubjectDto[]>("/catalog/subjects", undefined, { auth: false })).map(toCategory);
  },
};
