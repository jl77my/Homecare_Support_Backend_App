const { retrieveAgentContext } = require('./retrievalService');
const { createGeminiClient } = require('./geminiClient');
const { normalizeAction, buildActionPreview, createActionToken } = require('./actionService');
const { AgentError } = require('./errors');

function validateMessage(message) {
  const normalized = String(message || '').trim();
  if (!normalized) throw new AgentError(400, 'Please enter a message.', 'MESSAGE_REQUIRED');
  if (normalized.length > 2000) {
    throw new AgentError(400, 'Message is too long. Please keep it below 2,000 characters.', 'MESSAGE_TOO_LONG');
  }
  return normalized;
}

function createAgentService({ db, geminiClient = createGeminiClient() }) {
  return {
    async chat({ user, elderlyId, message, history }) {
      const normalizedMessage = validateMessage(message);
      const retrieval = await retrieveAgentContext(db, user, elderlyId, normalizedMessage);
      const generated = await geminiClient.generateAgentResponse({
        message: normalizedMessage,
        history,
        contextText: retrieval.contextText,
      });

      let action = null;
      let actionValidationMessage = null;
      try {
        action = normalizeAction(generated.action);
      } catch (error) {
        if (!(error instanceof AgentError)) throw error;
        actionValidationMessage = error.message;
      }

      const sources = retrieval.knowledgeDocuments.map((document) => ({
        id: document.id,
        title: document.sourceTitle,
        url: document.sourceUrl,
      }));

      if (!action) {
        return {
          reply: actionValidationMessage
            ? `${generated.reply}\n\nBefore I prepare that action: ${actionValidationMessage}`
            : generated.reply,
          action: null,
          sources,
          model: geminiClient.model,
        };
      }

      return {
        reply: generated.reply,
        action: {
          preview: buildActionPreview(action, retrieval.patient.name),
          token: createActionToken({ user, elderlyId, action }),
          expiresInSeconds: 600,
        },
        sources,
        model: geminiClient.model,
      };
    },
  };
}

module.exports = { createAgentService, validateMessage };
