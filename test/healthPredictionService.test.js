const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeHealthRecords, evaluateHealthAlerts } = require('../src/services/healthPredictionService');

const record = (day, heartRate, bloodPressure, bloodSugar) => ({
    Id: `record-${day}`,
    HeartRate: heartRate,
    BloodPressure: bloodPressure,
    BloodSugar: bloodSugar,
    DatetimeCreated: `2026-08-${String(day).padStart(2, '0')}T08:00:00.000Z`,
});

test('returns insufficient_data until five complete records exist', () => {
    const result = analyzeHealthRecords([
        record(1, 72, '120/80', 95),
        record(2, 73, '121/79', 96),
        record(3, 71, '119/80', 94),
    ]);

    assert.equal(result.modelInfo.modelReady, false);
    assert.equal(result.riskLevel, 'insufficient_data');
    assert.match(result.summary, /2 more complete health records/);
});

test('learns a stable personal baseline from historical readings', () => {
    const result = analyzeHealthRecords([
        record(1, 72, '120/80', 95),
        record(2, 73, '121/79', 96),
        record(3, 71, '119/80', 94),
        record(4, 72, '120/81', 95),
        record(5, 73, '121/80', 96),
        record(6, 72, '120/80', 95),
    ]);

    assert.equal(result.modelInfo.modelReady, true);
    assert.equal(result.isAnomaly, false);
    assert.equal(result.riskLevel, 'low');
    assert.equal(result.glucoseUnit, 'mg/dL');
});

test('does not overreact when an almost constant baseline changes slightly', () => {
    const result = analyzeHealthRecords([
        record(1, 72, '120/80', 95),
        record(2, 72, '120/80', 95),
        record(3, 72, '120/80', 95),
        record(4, 72, '120/80', 95),
        record(5, 73, '121/81', 98),
    ]);

    assert.equal(result.isAnomaly, false);
    assert.equal(result.riskLevel, 'low');
});

test('detects an abnormal latest reading and clinical risk', () => {
    const result = analyzeHealthRecords([
        record(1, 70, '118/78', 95),
        record(2, 72, '120/80', 96),
        record(3, 71, '119/79', 94),
        record(4, 73, '121/81', 97),
        record(5, 72, '120/80', 95),
        record(6, 118, '165/104', 230),
    ]);

    assert.equal(result.isAnomaly, true);
    assert.equal(result.riskLevel, 'high');
    assert.ok(result.clinicalAlerts.length >= 3);
    assert.ok(result.metrics.some((metric) => metric.abnormal));
});

test('detects a steadily increasing historical trend', () => {
    const result = analyzeHealthRecords([
        record(1, 70, '118/78', 90),
        record(2, 72, '120/79', 94),
        record(3, 74, '122/80', 98),
        record(4, 76, '124/81', 102),
        record(5, 78, '126/82', 106),
        record(6, 80, '128/83', 110),
    ]);

    const heartRate = result.metrics.find((metric) => metric.key === 'heartRate');
    assert.equal(heartRate.trend, 'increasing');
    assert.match(result.summary, /heart rate increasing/i);
});

test('recognizes mmol/L glucose records', () => {
    const result = analyzeHealthRecords([
        record(1, 70, '118/78', 5.2),
        record(2, 72, '120/80', 5.4),
        record(3, 71, '119/79', 5.3),
        record(4, 73, '121/81', 5.5),
        record(5, 72, '120/80', 5.4),
    ]);

    assert.equal(result.glucoseUnit, 'mmol/L');
});

test('legacy alerts handle both glucose units without flagging normal mg/dL values', () => {
    assert.deepEqual(evaluateHealthAlerts('120/80', 72, 95), []);
    assert.deepEqual(evaluateHealthAlerts('120/80', 72, 5.5), []);
    assert.ok(evaluateHealthAlerts('120/80', 72, 200).includes('High Blood Glucose Alert!'));
    assert.ok(evaluateHealthAlerts('120/80', 72, 11).includes('High Blood Glucose Alert!'));
});
