class AgentError extends Error {
  constructor(status, message, code = 'AGENT_ERROR') {
    super(message);
    this.name = 'AgentError';
    this.status = status;
    this.code = code;
  }
}

module.exports = { AgentError };
