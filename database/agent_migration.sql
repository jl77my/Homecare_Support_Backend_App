CREATE TABLE IF NOT EXISTS AgentActionExecutions (
  Id CHAR(36) NOT NULL,
  TokenId CHAR(36) NOT NULL,
  ActorId CHAR(36) NOT NULL,
  ElderlyId CHAR(36) NOT NULL,
  ActionType VARCHAR(40) NOT NULL,
  ResourceId CHAR(36) NULL,
  Status VARCHAR(20) NOT NULL,
  CreatedBy CHAR(36) NOT NULL,
  DatetimeCreated DATETIME NOT NULL,
  UpdatedBy CHAR(36) NOT NULL,
  DatetimeUpdated DATETIME NOT NULL,
  PRIMARY KEY (Id),
  UNIQUE KEY UQ_AgentActionExecutions_TokenId (TokenId),
  KEY IX_AgentActionExecutions_ActorId (ActorId),
  KEY IX_AgentActionExecutions_ElderlyId (ElderlyId)
);
