import type { SavedUrl } from "./browser";

export function importedSavedUrls(input: unknown): SavedUrl[] {
  const rows = Array.isArray(input)
    ? input
    : (input as { savedUrls?: unknown } | null)?.savedUrls;
  if (!Array.isArray(rows)) throw new Error("Arquivo de bases inválido.");
  return rows.map((value) => {
    const entry =
      typeof value === "string"
        ? { folder: "Sem pasta", name: value, url: value }
        : (value as Partial<SavedUrl> | null);
    if (
      !entry ||
      typeof entry.folder !== "string" ||
      typeof entry.name !== "string" ||
      typeof entry.url !== "string"
    ) {
      throw new Error("Arquivo de bases inválido.");
    }
    const folder = entry.folder.trim();
    const name = entry.name.trim();
    if (!folder || !name) throw new Error("Base sem pasta ou apelido.");
    const parsed = new URL(entry.url.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      throw new Error("Base com URL inválida.");
    return { folder, name, url: parsed.href };
  });
}
