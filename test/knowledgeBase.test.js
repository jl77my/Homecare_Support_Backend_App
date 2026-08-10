const test = require('node:test');
const assert = require('node:assert/strict');
const { retrieveKnowledge } = require('../src/agent/knowledgeBase');

test('immediate fall guidance ranks above prevention guidance', () => {
  const results = retrieveKnowledge('How should I react if the elderly fell in the bathroom?', 3);
  assert.ok(results.length > 0);
  assert.equal(results[0].id, 'fall-immediate-response');
  assert.match(results[0].content, /call 999 immediately/i);
});

test('missed medication question retrieves medication safety guidance', () => {
  const results = retrieveKnowledge('What if she forgot her medication dose?', 2);
  assert.equal(results[0].id, 'missed-medication');
  assert.match(results[0].content, /do not give a double dose/i);
});
