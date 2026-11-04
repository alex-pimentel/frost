/**
 * JSON persistence for the answer bank.
 *
 * Kept as a plain file instead of a SQLite table on purpose: the bank is small,
 * human-editable, diffable and easy to back up. Writes are atomic (tmp + rename)
 * so a crash mid-write cannot corrupt a bank the user spent weeks curating.
 */

const fs = require("fs");
const path = require("path");
const { AnswerBank } = require("./answerBank");

function loadAnswerBank(filePath, options = {}) {
  if (!filePath) return new AnswerBank(options);
  try {
    if (!fs.existsSync(filePath)) return new AnswerBank(options);
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return AnswerBank.fromJSON(parsed);
  } catch {
    return new AnswerBank(options);
  }
}

function saveAnswerBank(filePath, bank) {
  if (!filePath) throw new Error("A file path is required to save the answer bank");
  const payload = JSON.stringify(bank.toJSON(), null, 2);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, payload, "utf-8");
  fs.renameSync(tmpPath, filePath);
  return filePath;
}

module.exports = { loadAnswerBank, saveAnswerBank };
