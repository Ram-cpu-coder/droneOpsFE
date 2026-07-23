import { useMemo } from "react";

const searchableText = (item) => Object.values(item).join(" ").toLowerCase();

export const useFleetSearch = (items, query) => {
  return useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return items;
    return items.filter((item) => searchableText(item).includes(normalizedQuery));
  }, [items, query]);
};
