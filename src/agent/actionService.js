const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getCurrentMalaysiaMySQLDate } = require('../helper/helper');
const { AgentError } = require('./errors');

const ACTION_TYPES = new Set([
  'create_task',
  'create_reminder',
  'schedule_medication',
  'create_care_report',
]);

const REMINDER_CATEGORIES = new Set(['appointment', 'careActivity']);
const REMINDER_FREQUENCIES = new Set(['once', 'daily', 'weekly']);
const REPORT_CATEGORIES = new Set([
  'dailyLog',
  'injuryWound',
  'mealNutrition',
  'mobilityExercise',
  'medicalObservation',
]);

function cleanText(value, maxLength = 1000) {
  return String(value || '').trim().slice(0, maxLength);
}

function requireText(value, label, maxLength = 1000) {
  const result = cleanText(value, maxLength);
  if (!result) throw new AgentError(422, `${label} is required before this action can be created.`, 'ACTION_DETAIL_REQUIRED');
  return result;
}

function validateDate(value, label) {
  const result = cleanText(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00+08:00`))) {
    throw new AgentError(422, `${label} must be a valid date.`, 'ACTION_DATE_INVALID');
  }
  return result;
}

function validateTime(value) {
  const result = cleanText(value, 8);
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(result)) {
    throw new AgentError(422, 'A valid time is required before this action can be created.', 'ACTION_TIME_INVALID');
  }
  return result;
}

function validateDateTime(value) {
  const result = cleanText(value, 19);
  if (!/^\d{4}-\d{2}-\d{2} (?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(result)) {
    throw new AgentError(422, 'A valid due date and time are required before this task can be created.', 'ACTION_DATETIME_INVALID');
  }
  if (result < getCurrentMalaysiaMySQLDate()) {
    throw new AgentError(422, 'The due date must be in the future.', 'ACTION_DATETIME_PAST');
  }
  return result;
}

function validateScheduledMoment(date, time) {
  if (`${date} ${time}` < getCurrentMalaysiaMySQLDate()) {
    throw new AgentError(422, 'The reminder time must be in the future.', 'ACTION_DATETIME_PAST');
  }
}

function normalizeAction(rawAction) {
  const type = cleanText(rawAction && rawAction.type, 40);
  if (!type || type === 'none') return null;
  if (!ACTION_TYPES.has(type)) {
    throw new AgentError(422, 'The requested action is not supported.', 'ACTION_UNSUPPORTED');
  }

  if (type === 'create_task') {
    return {
      type,
      title: requireText(rawAction.title, 'Task title', 160),
      description: cleanText(rawAction.description, 1000),
      dueDate: validateDateTime(rawAction.dueDate),
    };
  }

  if (type === 'create_reminder') {
    const category = REMINDER_CATEGORIES.has(rawAction.category)
      ? rawAction.category
      : 'careActivity';
    const frequency = REMINDER_FREQUENCIES.has(rawAction.frequency)
      ? rawAction.frequency
      : 'once';
    const scheduledDate = validateDate(rawAction.scheduledDate, 'Reminder date');
    const scheduledTime = validateTime(rawAction.scheduledTime);
    validateScheduledMoment(scheduledDate, scheduledTime);
    return {
      type,
      title: requireText(rawAction.title, 'Reminder title', 160),
      scheduledDate,
      scheduledTime,
      category,
      frequency,
      notes: cleanText(rawAction.notes || rawAction.description, 1000),
    };
  }

  if (type === 'schedule_medication') {
    const scheduledDate = validateDate(rawAction.scheduledDate, 'Medication date');
    const scheduledTime = validateTime(rawAction.scheduledTime);
    validateScheduledMoment(scheduledDate, scheduledTime);
    return {
      type,
      title: requireText(rawAction.title, 'Medication name', 160),
      dosage: requireText(rawAction.dosage, 'Medication dosage', 120),
      scheduledDate,
      scheduledTime,
      category: 'medication',
      frequency: REMINDER_FREQUENCIES.has(rawAction.frequency) ? rawAction.frequency : 'daily',
      notes: cleanText(rawAction.notes, 1000),
    };
  }

  const category = REPORT_CATEGORIES.has(rawAction.category)
    ? rawAction.category
    : 'dailyLog';
  return {
    type,
    category,
    healthStatusNotes: requireText(rawAction.healthStatusNotes, 'Health status summary', 1000),
    dailyActivities: cleanText(rawAction.dailyActivities, 1000) || 'Daily Care Routine',
    observations: requireText(rawAction.observations, 'Care observations', 2000),
  };
}

function buildActionPreview(action, patientName) {
  const common = { type: action.type, patientName };
  if (action.type === 'create_task') {
    return {
      ...common,
      title: 'Create task',
      summary: `${action.title} — due ${action.dueDate}`,
      details: action.description,
    };
  }
  if (action.type === 'create_reminder') {
    return {
      ...common,
      title: 'Create reminder',
      summary: `${action.title} — ${action.scheduledDate} at ${action.scheduledTime}`,
      details: `${action.category}, ${action.frequency}`,
    };
  }
  if (action.type === 'schedule_medication') {
    return {
      ...common,
      title: 'Schedule medication',
      summary: `${action.title} (${action.dosage}) — ${action.scheduledDate} at ${action.scheduledTime}`,
      details: `${action.frequency}${action.notes ? `; ${action.notes}` : ''}`,
    };
  }
  return {
    ...common,
    title: 'Create care report',
    summary: `${action.category}: ${action.healthStatusNotes}`,
    details: action.observations,
  };
}

function getActionSecret() {
  const secret = process.env.AGENT_ACTION_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new AgentError(503, 'Agent action signing is not configured.', 'ACTION_SECRET_MISSING');
  }
  return secret;
}

function createActionToken({ user, elderlyId, action }) {
  return jwt.sign(
    {
      purpose: 'homecare_agent_action',
      actorId: user.userId,
      actorRole: String(user.role || '').toLowerCase(),
      elderlyId,
      action,
    },
    getActionSecret(),
    { expiresIn: '10m', jwtid: crypto.randomUUID() },
  );
}

function verifyActionToken(token, user) {
  if (!token || typeof token !== 'string') {
    throw new AgentError(400, 'Action confirmation token is required.', 'ACTION_TOKEN_REQUIRED');
  }
  let decoded;
  try {
    decoded = jwt.verify(token, getActionSecret());
  } catch (_) {
    throw new AgentError(400, 'This action preview has expired. Please ask the agent again.', 'ACTION_TOKEN_INVALID');
  }
  if (
    decoded.purpose !== 'homecare_agent_action'
    || decoded.actorId !== user.userId
    || decoded.actorRole !== String(user.role || '').toLowerCase()
    || !decoded.jti
  ) {
    throw new AgentError(403, 'This action preview does not belong to your account.', 'ACTION_TOKEN_FORBIDDEN');
  }
  return decoded;
}

async function insertActionResource(connection, payload, actorId) {
  const action = normalizeAction(payload.action);
  if (!action) throw new AgentError(422, 'There is no action to execute.', 'ACTION_EMPTY');
  const id = crypto.randomUUID();
  const timestamp = getCurrentMalaysiaMySQLDate();

  if (action.type === 'create_task') {
    await connection.execute(
      `INSERT INTO Tasks
       (Id, Title, Description, Status, DueDate, AssignedTo, CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated)
       VALUES (?, ?, ?, 'Pending', ?, ?, ?, ?, ?, ?)`,
      [id, action.title, action.description, action.dueDate, payload.elderlyId, actorId, timestamp, actorId, timestamp],
    );
    return { id, resourceType: 'task', message: 'Task created successfully.' };
  }

  if (action.type === 'create_reminder' || action.type === 'schedule_medication') {
    await connection.execute(
      `INSERT INTO Medications
       (Id, ElderlyId, MedicationName, Dosage, ScheduledDate, ScheduledTime, Category, Frequency, Notes,
        CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        payload.elderlyId,
        action.title,
        action.type === 'schedule_medication' ? action.dosage : '',
        action.scheduledDate,
        action.scheduledTime,
        action.category,
        action.frequency,
        action.notes,
        actorId,
        timestamp,
        actorId,
        timestamp,
      ],
    );
    return {
      id,
      resourceType: action.type === 'schedule_medication' ? 'medication' : 'reminder',
      message: action.type === 'schedule_medication'
        ? 'Medication schedule created successfully.'
        : 'Reminder created successfully.',
    };
  }

  await connection.execute(
    `INSERT INTO CareReports
     (Id, ElderlyId, Category, HealthStatusNotes, DailyActivities, Observations, PhotoUrl,
      CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
    [
      id,
      payload.elderlyId,
      action.category,
      action.healthStatusNotes,
      action.dailyActivities,
      action.observations,
      actorId,
      timestamp,
      actorId,
      timestamp,
    ],
  );
  return { id, resourceType: 'careReport', message: 'Care report created successfully.' };
}

async function executeConfirmedAction(db, tokenPayload) {
  const connection = await db.getConnection();
  const executionId = crypto.randomUUID();
  const timestamp = getCurrentMalaysiaMySQLDate();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO AgentActionExecutions
       (Id, TokenId, ActorId, ElderlyId, ActionType, Status, CreatedBy, DatetimeCreated, UpdatedBy, DatetimeUpdated)
       VALUES (?, ?, ?, ?, ?, 'PROCESSING', ?, ?, ?, ?)`,
      [
        executionId,
        tokenPayload.jti,
        tokenPayload.actorId,
        tokenPayload.elderlyId,
        tokenPayload.action.type,
        tokenPayload.actorId,
        timestamp,
        tokenPayload.actorId,
        timestamp,
      ],
    );

    const result = await insertActionResource(connection, tokenPayload, tokenPayload.actorId);
    await connection.execute(
      `UPDATE AgentActionExecutions
       SET ResourceId = ?, Status = 'COMPLETED', UpdatedBy = ?, DatetimeUpdated = ?
       WHERE Id = ?`,
      [result.id, tokenPayload.actorId, getCurrentMalaysiaMySQLDate(), executionId],
    );
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
      throw new AgentError(409, 'This action has already been confirmed.', 'ACTION_ALREADY_EXECUTED');
    }
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  ACTION_TYPES,
  normalizeAction,
  buildActionPreview,
  createActionToken,
  verifyActionToken,
  insertActionResource,
  executeConfirmedAction,
};
