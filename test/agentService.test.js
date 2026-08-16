const test = require('node:test');
const assert = require('node:assert/strict');
const { createAgentService } = require('../src/agent/agentService');

process.env.JWT_SECRET = 'test-only-jwt-secret-that-is-long-enough';
process.env.AGENT_ACTION_SECRET = 'test-only-action-secret-that-is-long-enough';

function createDb() {
  return {
    async execute(sql) {
      if (/CaregiverAssignments/.test(sql)) return [[{ Id: 'elderly-1', Name: 'Mr Tan' }]];
      if (/FROM Medications/.test(sql)) {
        return [[{
          Id: 'med-1',
          MedicationName: 'Medicine A',
          ScheduledTime: '09:00:00',
          TodayStatus: 'Taken',
          CompletedAt: '2026-08-10 09:04:00',
        }]];
      }
      if (/FROM DailyMoods/.test(sql)) return [[{ Mood: 'Happy' }]];
      return [[]];
    },
  };
}

test('returns a grounded answer without an action token for a question', async () => {
  let capturedContext;
  const geminiClient = {
    model: 'gemini-3.1-flash-lite',
    async generateAgentResponse(input) {
      capturedContext = input.contextText;
      return {
        reply: 'Yes. Medicine A was recorded as taken at 9:04 AM today.',
        action: { type: 'none' },
      };
    },
  };
  const service = createAgentService({ db: createDb(), geminiClient });
  const response = await service.chat({
    user: { userId: 'caregiver-1', role: 'caregiver' },
    elderlyId: 'elderly-1',
    message: 'Has he taken medication today?',
    history: [],
  });
  assert.match(capturedContext, /Medicine A/);
  assert.match(capturedContext, /Taken/);
  assert.equal(response.action, null);
});

test('includes the personalized health prediction in the agent RAG context', async () => {
  let capturedContext;
  const healthRecords = [
    [1, 72, '120/80', 95],
    [2, 73, '121/79', 96],
    [3, 71, '119/80', 94],
    [4, 72, '120/81', 95],
    [5, 73, '121/80', 96],
  ].map(([day, heartRate, bloodPressure, bloodSugar]) => ({
    Id: `record-${day}`,
    HeartRate: heartRate,
    BloodPressure: bloodPressure,
    BloodSugar: bloodSugar,
    DatetimeCreated: `2026-08-${String(day).padStart(2, '0')}T08:00:00.000Z`,
  }));
  const db = {
    async execute(sql) {
      if (/CaregiverAssignments/.test(sql)) return [[{ Id: 'elderly-1', Name: 'Mr Tan' }]];
      if (/FROM HealthRecords/.test(sql)) return [healthRecords];
      return [[]];
    },
  };
  const geminiClient = {
    model: 'gemini-3.1-flash-lite',
    async generateAgentResponse(input) {
      capturedContext = input.contextText;
      return { reply: 'The personalized trend is stable.', action: { type: 'none' } };
    },
  };

  const service = createAgentService({ db, geminiClient });
  await service.chat({
    user: { userId: 'caregiver-1', role: 'caregiver' },
    elderlyId: 'elderly-1',
    message: 'What does the health prediction show?',
    history: [],
  });

  assert.match(capturedContext, /healthPrediction/);
  assert.match(capturedContext, /Personalized kNN anomaly detection/);
  assert.match(capturedContext, /"riskLevel": "low"/);
});

test('returns a signed confirmation preview for a valid action', async () => {
  const geminiClient = {
    model: 'gemini-3.1-flash-lite',
    async generateAgentResponse() {
      return {
        reply: 'I prepared the task for your confirmation.',
        action: {
          type: 'create_task',
          title: 'Check blood pressure',
          description: 'Record the reading in the health section.',
          dueDate: '2099-08-11 09:00:00',
        },
      };
    },
  };
  const service = createAgentService({ db: createDb(), geminiClient });
  const response = await service.chat({
    user: { userId: 'caregiver-1', role: 'caregiver' },
    elderlyId: 'elderly-1',
    message: 'Create a blood pressure task for tomorrow at 9am.',
    history: [],
  });
  assert.equal(response.action.preview.type, 'create_task');
  assert.equal(response.action.preview.patientName, 'Mr Tan');
  assert.ok(response.action.token.length > 40);
});
