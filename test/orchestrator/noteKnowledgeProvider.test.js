const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createNoteKnowledgeProvider,
  noteText,
  MAX_BLOCK_CHARS,
} = require("../../src/main/orchestrator/noteKnowledgeProvider");

function databaseWith(notes) {
  return {
    calls: [],
    searchNotes(query, limit) {
      this.calls.push({ query, limit });
      return notes;
    },
  };
}

test("maps notes into citable knowledge blocks", async () => {
  const databaseManager = databaseWith([
    { id: 12, title: "Reunião 01/03", content: "Prazo do projeto X é maio." },
  ]);
  const provider = createNoteKnowledgeProvider({ databaseManager });

  const blocks = await provider.search("prazo do projeto X");

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].id, "nota:12");
  assert.match(blocks[0].text, /maio/);
  assert.deepEqual(databaseManager.calls, [{ query: "prazo do projeto X", limit: 5 }]);
});

test("prefers enhanced content over raw content", async () => {
  assert.equal(
    noteText({ title: "t", content: "cru", enhanced_content: "formatado" }),
    "formatado"
  );
});

test("truncates long notes so the prompt stays small", async () => {
  const databaseManager = databaseWith([{ id: 1, title: "x", content: "a".repeat(2000) }]);
  const provider = createNoteKnowledgeProvider({ databaseManager });

  const [block] = await provider.search("x");

  assert.ok(block.text.length <= MAX_BLOCK_CHARS + 1);
});

test("respects the requested limit", async () => {
  const notes = Array.from({ length: 8 }, (_, index) => ({ id: index + 1, content: `nota ${index}` }));
  const provider = createNoteKnowledgeProvider({ databaseManager: databaseWith(notes) });

  const blocks = await provider.search("nota", { limit: 3 });

  assert.equal(blocks.length, 3);
});

test("returns nothing without a database", async () => {
  const provider = createNoteKnowledgeProvider({});
  assert.deepEqual(await provider.search("qualquer"), []);
});

test("returns nothing for an empty query", async () => {
  const provider = createNoteKnowledgeProvider({ databaseManager: databaseWith([{ id: 1, content: "x" }]) });
  assert.deepEqual(await provider.search("   "), []);
});

test("a failing database degrades to no blocks instead of breaking the turn", async () => {
  const warnings = [];
  const provider = createNoteKnowledgeProvider({
    databaseManager: {
      searchNotes() {
        throw new Error("database is locked");
      },
    },
    logger: { warn: (message, meta) => warnings.push({ message, meta }) },
  });

  assert.deepEqual(await provider.search("prazo"), []);
  assert.equal(warnings.length, 1);
});

test("skips notes without usable text", async () => {
  const provider = createNoteKnowledgeProvider({
    databaseManager: databaseWith([{ id: 1, title: "", content: "" }, { id: 2, content: "útil" }]),
  });

  const blocks = await provider.search("x");

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].id, "nota:2");
});
