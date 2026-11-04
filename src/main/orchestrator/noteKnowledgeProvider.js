/**
 * Knowledge provider backed by the local notes database.
 *
 * Uses the existing FTS5 index (`databaseManager.searchNotes`), so retrieval is
 * lexical, local, instant and needs no embedding model. The orchestrator renders the
 * blocks as `[nota:12]` and the prompt requires the model to cite them, which is what
 * keeps answers traceable instead of invented.
 *
 * Semantic search (embeddings/sqlite-vec) can replace or complement this later behind
 * the same `search(query, { limit })` contract.
 */

const MAX_BLOCK_CHARS = 600;

function truncate(value, limit = MAX_BLOCK_CHARS) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function noteText(note) {
  return note?.enhanced_content || note?.content || note?.title || "";
}

/**
 * @param {{
 *   databaseManager?: { searchNotes?: (query: string, limit?: number) => Array<object> },
 *   maxBlocks?: number,
 *   logger?: { warn?: Function },
 * }} deps
 */
function createNoteKnowledgeProvider({ databaseManager, maxBlocks = 5, logger } = {}) {
  return {
    async search(query, { limit = maxBlocks } = {}) {
      if (!databaseManager || typeof databaseManager.searchNotes !== "function") return [];
      const text = String(query ?? "").trim();
      if (!text) return [];

      try {
        const notes = databaseManager.searchNotes(text, limit);
        if (!Array.isArray(notes)) return [];

        return notes
          .filter((note) => note && noteText(note))
          .slice(0, limit)
          .map((note) => ({
            id: `nota:${note.id}`,
            source: "nota",
            title: note.title ?? "",
            text: truncate(noteText(note)),
            createdAt: note.created_at ?? null,
          }));
      } catch (error) {
        logger?.warn?.("Knowledge search failed", { error: error?.message });
        return [];
      }
    },
  };
}

module.exports = { createNoteKnowledgeProvider, noteText, truncate, MAX_BLOCK_CHARS };
