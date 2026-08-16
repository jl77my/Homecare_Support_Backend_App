const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/config/db');
const elderlyController = require('../src/controllers/elderlyController');

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('SOS saves location and emits only to linked recipient rooms', async () => {
  const originalExecute = db.execute;
  const calls = [];
  const emitted = [];

  db.execute = async (sql, params) => {
    calls.push({ sql, params });
    if (/SELECT Name FROM Users/.test(sql)) return [[{ Name: 'Mr Tan' }]];
    if (/linkedRecipients/.test(sql)) {
      return [[{ RecipientId: 'caregiver-1' }, { RecipientId: 'family-1' }]];
    }
    return [[]];
  };

  const req = {
    user: { userId: 'elderly-1', role: 'elderly' },
    body: { latitude: 3.139, longitude: 101.6869, accuracy: 12.4 },
    io: {
      to(room) {
        return {
          emit(event, payload) {
            emitted.push({ room, event, payload });
          },
        };
      },
    },
  };
  const res = createResponse();

  try {
    await elderlyController.triggerSos(req, res);
  } finally {
    db.execute = originalExecute;
  }

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.notifiedRecipients, 2);
  assert.equal(res.body.locationShared, true);
  assert.match(calls[0].sql, /Latitude, Longitude, LocationAccuracy/);
  assert.equal(calls[0].params[2], 3.139);
  assert.equal(calls[0].params[3], 101.6869);
  assert.deepEqual(
    emitted.map(({ room }) => room),
    ['user:caregiver-1', 'user:family-1'],
  );
  assert.ok(emitted.every(({ event }) => event === 'SOS_ALERT_EMITTED'));
  assert.ok(emitted.every(({ payload }) => payload.elderlyName === 'Mr Tan'));
});

test('SOS rejects invalid coordinates before writing to the database', async () => {
  const originalExecute = db.execute;
  let wasCalled = false;
  db.execute = async () => {
    wasCalled = true;
    return [[]];
  };

  const req = {
    user: { userId: 'elderly-1', role: 'elderly' },
    body: { latitude: 100, longitude: 101.6869 },
  };
  const res = createResponse();

  try {
    await elderlyController.triggerSos(req, res);
  } finally {
    db.execute = originalExecute;
  }

  assert.equal(res.statusCode, 400);
  assert.equal(wasCalled, false);
});
