const { AgentError } = require('./errors');
const { retrieveKnowledge } = require('./knowledgeBase');
const { analyzeHealthRecords } = require('../services/healthPredictionService');

async function authorizePatientAccess(db, user, elderlyId) {
  if (!elderlyId || typeof elderlyId !== 'string') {
    throw new AgentError(400, 'Please select an elderly person first.', 'ELDERLY_REQUIRED');
  }

  const role = String(user.role || '').toLowerCase();
  if (!['caregiver', 'family'].includes(role)) {
    throw new AgentError(403, 'The care agent is available only to caregivers and family members.', 'ROLE_FORBIDDEN');
  }

  const [links] = role === 'caregiver'
    ? await db.execute(
      `SELECT u.Id, u.Name
       FROM CaregiverAssignments ca
       JOIN Users u ON u.Id = ca.ElderlyId
       WHERE ca.CaregiverId = ? AND ca.ElderlyId = ?
         AND COALESCE(NULLIF(ca.Status, ''), 'ACTIVE') = 'ACTIVE'
       LIMIT 1`,
      [user.userId, elderlyId],
    )
    : await db.execute(
      `SELECT u.Id, u.Name
       FROM FamilyElderlyLinks fel
       JOIN Users u ON u.Id = fel.ElderlyId
       WHERE fel.FamilyMemberId = ? AND fel.ElderlyId = ?
         AND COALESCE(NULLIF(fel.Status, ''), 'ACTIVE') = 'ACTIVE'
       LIMIT 1`,
      [user.userId, elderlyId],
    );

  if (links.length === 0) {
    throw new AgentError(403, 'You are not linked to the selected elderly person.', 'PATIENT_FORBIDDEN');
  }

  return { id: links[0].Id, name: links[0].Name || 'the selected elderly person' };
}

async function retrieveLiveCareData(db, elderlyId) {
  const [medicationResult, moodResult, taskResult, healthResult, reportResult] = await Promise.all([
    db.execute(
      `SELECT m.Id, m.MedicationName, m.Dosage, m.ScheduledDate, m.ScheduledTime,
              m.Category, m.Frequency, m.Notes,
              (SELECT ml.Status FROM MedicationLogs ml
               WHERE ml.MedicationId = m.Id AND DATE(ml.DatetimeCreated) = CURDATE()
               ORDER BY ml.DatetimeCreated DESC LIMIT 1) AS TodayStatus,
              (SELECT ml.DatetimeCreated FROM MedicationLogs ml
               WHERE ml.MedicationId = m.Id AND DATE(ml.DatetimeCreated) = CURDATE()
               ORDER BY ml.DatetimeCreated DESC LIMIT 1) AS CompletedAt
       FROM Medications m
       WHERE m.ElderlyId = ?
         AND (LOWER(COALESCE(m.Frequency, '')) = 'daily' OR DATE(m.ScheduledDate) = CURDATE())
       ORDER BY m.ScheduledTime ASC
       LIMIT 30`,
      [elderlyId],
    ),
    db.execute(
      `SELECT Mood, DatetimeCreated
       FROM DailyMoods
       WHERE ElderlyId = ? AND DATE(DatetimeCreated) = CURDATE()
       ORDER BY DatetimeCreated DESC LIMIT 1`,
      [elderlyId],
    ),
    db.execute(
      `SELECT Title, Description, Status, DueDate
       FROM Tasks
       WHERE AssignedTo = ?
         AND (Status = 'Pending' OR DueDate >= DATE_SUB(NOW(), INTERVAL 1 DAY))
       ORDER BY DueDate ASC LIMIT 20`,
      [elderlyId],
    ),
    db.execute(
      `SELECT Id, HeartRate, BloodPressure, BloodSugar, Notes, DatetimeCreated
       FROM HealthRecords
       WHERE ElderlyId = ?
       ORDER BY DatetimeCreated DESC LIMIT 90`,
      [elderlyId],
    ),
    db.execute(
      `SELECT Category, HealthStatusNotes, DailyActivities, Observations, DatetimeCreated
       FROM CareReports
       WHERE ElderlyId = ?
       ORDER BY DatetimeCreated DESC LIMIT 5`,
      [elderlyId],
    ),
  ]);

  const healthRecords = healthResult[0];

  return {
    medicationsToday: medicationResult[0],
    moodToday: moodResult[0][0] || null,
    tasks: taskResult[0],
    recentHealth: healthRecords.slice(0, 5),
    healthPrediction: analyzeHealthRecords(healthRecords),
    recentReports: reportResult[0],
  };
}

function buildRetrievedContext(patient, liveData, knowledgeDocuments) {
  return JSON.stringify(
    {
      selectedElderly: patient,
      liveCareRecords: liveData,
      retrievedCareGuidance: knowledgeDocuments.map((document) => ({
        id: document.id,
        title: document.title,
        content: document.content,
        sourceTitle: document.sourceTitle,
        sourceUrl: document.sourceUrl,
      })),
    },
    null,
    2,
  );
}

async function retrieveAgentContext(db, user, elderlyId, query) {
  const patient = await authorizePatientAccess(db, user, elderlyId);
  const [liveData, knowledgeDocuments] = await Promise.all([
    retrieveLiveCareData(db, elderlyId),
    Promise.resolve(retrieveKnowledge(query, 3)),
  ]);

  return {
    patient,
    liveData,
    knowledgeDocuments,
    contextText: buildRetrievedContext(patient, liveData, knowledgeDocuments),
  };
}

module.exports = {
  authorizePatientAccess,
  retrieveLiveCareData,
  retrieveAgentContext,
  buildRetrievedContext,
};
