const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SYSTEM_INSTRUCTION,
  createGeminiClient,
  parseStructuredResponse,
  sanitizeHistory,
} = require('../src/agent/geminiClient');

test('system instruction keeps health predictions within a monitoring boundary', () => {
  assert.match(SYSTEM_INSTRUCTION, /healthPrediction/);
  assert.match(SYSTEM_INSTRUCTION, /never as a diagnosis/i);
});

const emptyAction = {
  type: 'none',
  title: '',
  description: '',
  dueDate: '',
  scheduledDate: '',
  scheduledTime: '',
  category: '',
  frequency: '',
  dosage: '',
  notes: '',
  healthStatusNotes: '',
  dailyActivities: '',
  observations: '',
};

test('parses a fenced structured Gemini response', () => {
  const parsed = parseStructuredResponse(`\`\`\`json\n${JSON.stringify({ reply: 'Hello', action: emptyAction })}\n\`\`\``);
  assert.equal(parsed.reply, 'Hello');
  assert.equal(parsed.action.type, 'none');
});

test('history is limited and sanitized', () => {
  const history = Array.from({ length: 12 }, (_, index) => ({ role: 'user', text: `message ${index}` }));
  const sanitized = sanitizeHistory(history);
  assert.equal(sanitized.length, 8);
  assert.equal(sanitized[0].text, 'message 4');
});

test('uses stable Gemini model, structured JSON and no server-side storage', async () => {
  let request;
  const fakeSdk = {
    interactions: {
      async create(input) {
        request = input;
        return { output_text: JSON.stringify({ reply: 'Grounded answer', action: emptyAction }) };
      },
    },
  };
  const client = createGeminiClient({ client: fakeSdk, model: 'gemini-3.1-flash-lite' });
  const result = await client.generateAgentResponse({
    message: 'Has medication been taken?',
    history: [],
    contextText: '{"medicationsToday":[]}',
  });
  assert.equal(result.reply, 'Grounded answer');
  assert.equal(request.model, 'gemini-3.1-flash-lite');
  assert.equal(request.store, false);
  assert.equal(request.response_format.mime_type, 'application/json');
});
