-- One family account may acknowledge a given care report only once.
-- Review and remove legacy duplicates before applying this migration.
DELETE older
FROM CareReportAcknowledgements older
JOIN CareReportAcknowledgements newer
  ON older.ReportId = newer.ReportId
 AND older.FamilyMemberId = newer.FamilyMemberId
 AND (
   older.DatetimeCreated > newer.DatetimeCreated
   OR (older.DatetimeCreated = newer.DatetimeCreated AND older.Id > newer.Id)
 );

ALTER TABLE CareReportAcknowledgements
  ADD UNIQUE KEY uq_care_report_family_acknowledgement (ReportId, FamilyMemberId);
