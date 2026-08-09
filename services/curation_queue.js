const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const QUEUE_PATH = path.join(DATA_DIR, 'uncovered_questions.jsonl');

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function appendUncoveredQuestion(entry) {
  ensureDir();
  const payload = {
    occurred_at: new Date().toISOString(),
    ...entry,
  };
  fs.appendFileSync(QUEUE_PATH, `${JSON.stringify(payload)}\n`, 'utf8');
  return payload;
}

function readUncoveredQuestions(limit = 100) {
  if (!fs.existsSync(QUEUE_PATH)) return [];
  const lines = fs.readFileSync(QUEUE_PATH, 'utf8').split(/\n+/).filter(Boolean);
  return lines.slice(-limit).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean).reverse();
}

module.exports = { appendUncoveredQuestion, readUncoveredQuestions, QUEUE_PATH };
