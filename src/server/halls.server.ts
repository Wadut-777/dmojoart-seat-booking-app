export type CategoryRow = { id: string; hall_id: string; name: string; price: number; capacity: number };

/** Attaches each hall's seat categories (a second query, so it runs the same on MySQL and MariaDB). */
export function hallsWithCategories<H extends { id: string }>(halls: H[], categories: CategoryRow[]) {
  return halls.map((h) => ({
    ...h,
    hall_categories: categories
      .filter((c) => c.hall_id === h.id)
      .map((c) => ({ id: c.id, name: c.name, price: Number(c.price), capacity: Number(c.capacity) })),
  }));
}
