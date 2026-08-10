const db = require('../config/db');
const { createAgentService } = require('../agent/agentService');
const {
  verifyActionToken,
  executeConfirmedAction,
} = require('../agent/actionService');
const { authorizePatientAccess } = require('../agent/retrievalService');
const { AgentError } = require('../agent/errors');

const agentService = createAgentService({ db });

function sendError(res, error) {
  if (error instanceof AgentError) {
    return res.status(error.status).json({ error: error.message, code: error.code });
  }
  console.error('Agent Controller Error:', error);
  return res.status(500).json({
    error: 'The care agent encountered an unexpected error.',
    code: 'AGENT_INTERNAL_ERROR',
  });
}

exports.chat = async (req, res) => {
  try {
    const result = await agentService.chat({
      user: req.user,
      elderlyId: req.body.elderlyId,
      message: req.body.message,
      history: req.body.history,
    });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
};

exports.confirmAction = async (req, res) => {
  try {
    const tokenPayload = verifyActionToken(req.body.actionToken, req.user);
    await authorizePatientAccess(db, req.user, tokenPayload.elderlyId);
    const result = await executeConfirmedAction(db, tokenPayload);
    return res.status(201).json(result);
  } catch (error) {
    return sendError(res, error);
  }
};
