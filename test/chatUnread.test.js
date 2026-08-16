const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/config/db');
const chatController = require('../src/controllers/chatController');

const responseRecorder = () => {
  const result = { statusCode: 200, body: null };
  return {
    result,
    response: {
      status(code) {
        result.statusCode = code;
        return this;
      },
      json(body) {
        result.body = body;
        return this;
      },
    },
  };
};

test('returns unread counts for all accessible channels and excludes missing groups as zero', async () => {
  const originalExecute = db.execute;
  const calls = [];
  db.execute = async (sql, params) => {
    calls.push({ sql, params });
    if (calls.length === 1) {
      return [[{ ElderlyId: 'elderly-1' }, { ElderlyId: 'elderly-2' }]];
    }
    return [[{ ElderlyId: 'elderly-1', UnreadCount: 3 }]];
  };

  try {
    const { response, result } = responseRecorder();
    await chatController.getUnreadCounts({
      user: { userId: 'caregiver-1', role: 'caregiver' },
    }, response);

    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body, {
      unreadCounts: { 'elderly-1': 3, 'elderly-2': 0 },
    });
    assert.match(calls[1].sql, /c\.SenderId <> \?/);
    assert.deepEqual(calls[1].params, [
      'caregiver-1',
      'elderly-1',
      'elderly-2',
      'caregiver-1',
    ]);
  } finally {
    db.execute = originalExecute;
  }
});

test('marks only the last message actually displayed by the client as read', async () => {
  const originalExecute = db.execute;
  const calls = [];
  db.execute = async (sql, params) => {
    calls.push({ sql, params });
    if (calls.length === 1) return [[{ ElderlyId: 'elderly-1' }]];
    if (calls.length === 2) return [[{ Id: 'message-9' }]];
    if (calls.length === 3) return [{ affectedRows: 1 }];
    return [[{ UnreadCount: 1 }]];
  };

  try {
    const { response, result } = responseRecorder();
    await chatController.markChannelAsRead({
      params: { elderlyId: 'elderly-1' },
      body: { lastReadMessageId: 'message-9' },
      user: { userId: 'family-1', role: 'family' },
    }, response);

    assert.equal(result.statusCode, 200);
    assert.equal(result.body.lastReadMessageId, 'message-9');
    assert.equal(result.body.unreadCount, 1);
    assert.deepEqual(calls[1].params, ['message-9', 'elderly-1']);
    assert.match(calls[2].sql, /ON DUPLICATE KEY UPDATE/);
    assert.equal(calls[2].params[3], 'message-9');
  } finally {
    db.execute = originalExecute;
  }
});
