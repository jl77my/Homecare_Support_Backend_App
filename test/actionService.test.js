const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeAction,
  createActionToken,
  verifyActionToken,
  insertActionResource,
} = require('../src/agent/actionService');

process.env.JWT_SECRET = 'test-only-jwt-secret-that-is-long-enough';
process.env.AGENT_ACTION_SECRET = 'test-only-action-secret-that-is-long-enough';

test('normalizes a complete task proposal', () => {
  const action = normalizeAction({
    type: 'create_task',
    title: 'Check bathroom floor',
    description: 'Dry the wet tiles and place the non-slip mat.',
    dueDate: '2099-08-11 09:00:00',
  });
  assert.equal(action.type, 'create_task');
  assert.equal(action.title, 'Check bathroom floor');
});

test('rejects a medication proposal without dosage', () => {
  assert.throws(
    () => normalizeAction({
      type: 'schedule_medication',
      title: 'Medicine A',
      scheduledDate: '2099-08-11',
      scheduledTime: '09:00:00',
      frequency: 'daily',
    }),
    /Medication dosage is required/,
  );
});

test('action token is bound to the requesting user', () => {
  const user = { userId: 'caregiver-1', role: 'caregiver' };
  const token = createActionToken({
    user,
    elderlyId: 'elderly-1',
    action: {
      type: 'create_task',
      title: 'Hydration check',
      description: '',
      dueDate: '2099-08-11 10:00:00',
    },
  });
  const payload = verifyActionToken(token, user);
  assert.equal(payload.elderlyId, 'elderly-1');
  assert.throws(
    () => verifyActionToken(token, { userId: 'caregiver-2', role: 'caregiver' }),
    /does not belong to your account/,
  );
});

test('task execution uses parameterized SQL and the linked elderly id', async () => {
  const calls = [];
  const connection = {
    async execute(sql, values) {
      calls.push({ sql, values });
      return [{ affectedRows: 1 }];
    },
  };
  const result = await insertActionResource(
    connection,
    {
      elderlyId: 'elderly-1',
      action: {
        type: 'create_task',
        title: 'Prepare breakfast',
        description: 'Prepare oatmeal.',
        dueDate: '2099-08-11 08:00:00',
      },
    },
    'family-1',
  );
  assert.equal(result.resourceType, 'task');
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO Tasks/);
  assert.ok(calls[0].sql.includes('?'));
  assert.ok(calls[0].values.includes('elderly-1'));
  assert.ok(calls[0].values.includes('family-1'));
});
