const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/config/db');
const familyController = require('../src/controllers/familyController');

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

test('a family account cannot acknowledge the same care report twice', async () => {
  const originalExecute = db.execute;
  const calls = [];
  db.execute = async (sql, params) => {
    calls.push({ sql, params });
    if (/FROM CareReports cr/.test(sql)) return [[{ Id: 'report-1' }]];
    if (/SELECT Id FROM CareReportAcknowledgements/.test(sql)) return [[{ Id: 'ack-1' }]];
    throw new Error('No insert should occur for a duplicate acknowledgement.');
  };

  try {
    const res = createResponse();
    await familyController.acknowledgeReport({
      user: { userId: 'family-1', role: 'family' },
      params: { reportId: 'report-1' },
      body: { comment: 'Seen, thank you.' },
    }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'REPORT_ALREADY_ACKNOWLEDGED');
    assert.equal(calls.length, 2);
  } finally {
    db.execute = originalExecute;
  }
});

test('first acknowledgement is inserted with an atomic not-exists guard', async () => {
  const originalExecute = db.execute;
  const calls = [];
  db.execute = async (sql, params) => {
    calls.push({ sql, params });
    if (/FROM CareReports cr/.test(sql)) return [[{ Id: 'report-1' }]];
    if (/SELECT Id FROM CareReportAcknowledgements/.test(sql)) return [[]];
    if (/INSERT INTO CareReportAcknowledgements/.test(sql)) return [{ affectedRows: 1 }];
    return [[]];
  };

  try {
    const res = createResponse();
    await familyController.acknowledgeReport({
      user: { userId: 'family-1', role: 'family' },
      params: { reportId: 'report-1' },
      body: { comment: 'Seen, thank you.' },
    }, res);

    assert.equal(res.statusCode, 201);
    assert.match(calls[2].sql, /WHERE NOT EXISTS/);
    assert.deepEqual(calls[2].params.slice(-2), ['report-1', 'family-1']);
  } finally {
    db.execute = originalExecute;
  }
});
