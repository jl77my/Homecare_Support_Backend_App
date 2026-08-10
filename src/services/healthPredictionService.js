const MINIMUM_RECORDS = 5;
const MAX_RECORDS = 90;

const METRICS = [
    { key: 'heartRate', label: 'Heart rate', unit: 'bpm', scaleFloor: 5, trendFloor: 1.5 },
    { key: 'systolic', label: 'Systolic pressure', unit: 'mmHg', scaleFloor: 8, trendFloor: 2 },
    { key: 'diastolic', label: 'Diastolic pressure', unit: 'mmHg', scaleFloor: 5, trendFloor: 1.5 },
    { key: 'bloodSugar', label: 'Blood glucose', unit: '', scaleFloor: 0.8, trendFloor: 0.25 },
];

const round = (value, digits = 1) => {
    if (!Number.isFinite(value)) return null;
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
};

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

const standardDeviation = (values) => {
    if (values.length < 2) return 0;
    const average = mean(values);
    return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
};

const percentile = (values, fraction) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
    return sorted[Math.max(0, index)];
};

const linearSlope = (values) => {
    if (values.length < 2) return 0;
    const xMean = (values.length - 1) / 2;
    const yMean = mean(values);
    let numerator = 0;
    let denominator = 0;
    values.forEach((value, index) => {
        numerator += (index - xMean) * (value - yMean);
        denominator += (index - xMean) ** 2;
    });
    return denominator === 0 ? 0 : numerator / denominator;
};

const parseRecord = (record) => {
    const pressureParts = String(record.BloodPressure ?? '').split('/');
    const parsed = {
        id: record.Id?.toString() ?? null,
        recordedAt: record.DatetimeCreated ?? null,
        heartRate: Number(record.HeartRate),
        systolic: Number(pressureParts[0]),
        diastolic: Number(pressureParts[1]),
        bloodSugar: Number(record.BloodSugar),
    };

    const isComplete = METRICS.every(({ key }) => Number.isFinite(parsed[key]) && parsed[key] > 0);
    return isComplete ? parsed : null;
};

const euclideanDistance = (a, b) => {
    const squaredDistance = METRICS.reduce((sum, { key }) => sum + (a[key] - b[key]) ** 2, 0);
    return Math.sqrt(squaredDistance);
};

const averageKNearestDistance = (sample, trainingSamples, k = 3) => {
    if (trainingSamples.length === 0) return 0;
    const distances = trainingSamples
        .map((candidate) => euclideanDistance(sample, candidate))
        .sort((a, b) => a - b)
        .slice(0, Math.min(k, trainingSamples.length));
    return mean(distances);
};

const getClinicalAlerts = (latest, glucoseUnit) => {
    const alerts = [];
    if (latest.heartRate < 60 || latest.heartRate > 100) {
        alerts.push('Latest heart rate is outside the configured 60-100 bpm range.');
    }
    if (latest.systolic >= 140 || latest.diastolic >= 90) {
        alerts.push('Latest blood pressure is in the configured high range.');
    } else if (latest.systolic < 90 || latest.diastolic < 60) {
        alerts.push('Latest blood pressure is in the configured low range.');
    }

    const highGlucose = glucoseUnit === 'mg/dL' ? latest.bloodSugar >= 180 : latest.bloodSugar >= 10;
    const lowGlucose = glucoseUnit === 'mg/dL' ? latest.bloodSugar < 70 : latest.bloodSugar < 3.9;
    if (highGlucose) alerts.push('Latest blood glucose is in the configured high range.');
    if (lowGlucose) alerts.push('Latest blood glucose is in the configured low range.');
    return alerts;
};

const evaluateHealthAlerts = (bloodPressure, heartRate, bloodSugar) => {
    const alerts = [];
    const [systolic, diastolic] = String(bloodPressure ?? '').split('/').map(Number);
    const pulse = Number(heartRate);
    const glucose = Number(bloodSugar);

    if (Number.isFinite(systolic) && Number.isFinite(diastolic) && (systolic >= 140 || diastolic >= 90)) {
        alerts.push('High Blood Pressure Alert!');
    }
    if (Number.isFinite(pulse) && (pulse > 100 || pulse < 60)) {
        alerts.push('Abnormal Heart Rate Alert!');
    }
    if (Number.isFinite(glucose)) {
        const isMgDl = glucose > 35;
        if ((isMgDl && glucose >= 180) || (!isMgDl && glucose >= 10)) {
            alerts.push('High Blood Glucose Alert!');
        }
    }
    return alerts;
};

const buildInsufficientResult = (records, latest, glucoseUnit, clinicalAlerts) => {
    const remaining = Math.max(0, MINIMUM_RECORDS - records.length);
    const hasClinicalAlert = clinicalAlerts.length > 0;
    return {
        modelInfo: {
            name: 'Personalized kNN anomaly detection with linear trend regression',
            version: '1.0.0',
            modelReady: false,
            minimumRecords: MINIMUM_RECORDS,
            recordsAnalyzed: records.length,
        },
        riskLevel: hasClinicalAlert ? 'high' : 'insufficient_data',
        riskScore: hasClinicalAlert ? 70 : 0,
        stabilityScore: hasClinicalAlert ? 30 : null,
        isAnomaly: false,
        summary: remaining > 0
            ? `Add ${remaining} more complete health ${remaining === 1 ? 'record' : 'records'} to train the personalized model.`
            : 'The personalized model is preparing the historical baseline.',
        clinicalAlerts,
        recommendations: hasClinicalAlert
            ? ['Review the latest reading and follow the elderly person\'s care plan. Seek professional advice if symptoms are present.']
            : ['Continue recording vitals consistently so the model can learn the personal baseline.'],
        latestRecordId: latest?.id ?? null,
        latestRecordedAt: latest?.recordedAt ?? null,
        glucoseUnit,
        metrics: [],
        generatedAt: new Date().toISOString(),
        disclaimer: 'This screening result supports monitoring only and is not a medical diagnosis.',
    };
};

const analyzeHealthRecords = (rawRecords) => {
    const records = rawRecords
        .slice(0, MAX_RECORDS)
        .map(parseRecord)
        .filter(Boolean)
        .sort((a, b) => new Date(a.recordedAt ?? 0) - new Date(b.recordedAt ?? 0));

    const latest = records.at(-1) ?? null;
    const glucoseMedian = records.length > 0 ? percentile(records.map((record) => record.bloodSugar), 0.5) : 0;
    const glucoseUnit = glucoseMedian > 35 ? 'mg/dL' : 'mmol/L';
    const clinicalAlerts = latest ? getClinicalAlerts(latest, glucoseUnit) : [];

    if (records.length < MINIMUM_RECORDS || !latest) {
        return buildInsufficientResult(records, latest, glucoseUnit, clinicalAlerts);
    }

    const training = records.slice(0, -1);
    const statistics = Object.fromEntries(METRICS.map(({ key, scaleFloor }) => {
        const values = training.map((record) => record[key]);
        const unitAwareFloor = key === 'bloodSugar' && glucoseUnit === 'mg/dL' ? 15 : scaleFloor;
        return [key, { mean: mean(values), deviation: Math.max(standardDeviation(values), unitAwareFloor) }];
    }));

    const normalize = (record) => Object.fromEntries(METRICS.map(({ key }) => [
        key,
        (record[key] - statistics[key].mean) / statistics[key].deviation,
    ]));

    const normalizedTraining = training.map(normalize);
    const normalizedLatest = normalize(latest);
    const anomalyScore = averageKNearestDistance(normalizedLatest, normalizedTraining);
    const trainingScores = normalizedTraining.map((sample, index) => (
        averageKNearestDistance(sample, normalizedTraining.filter((_, candidateIndex) => candidateIndex !== index))
    ));
    const anomalyThreshold = Math.max(1.5, percentile(trainingScores, 0.95) * 1.25);
    const isAnomaly = anomalyScore > anomalyThreshold;

    const metrics = METRICS.map((metric) => {
        const unit = metric.key === 'bloodSugar' ? glucoseUnit : metric.unit;
        const recentValues = records.slice(-7).map((record) => record[metric.key]);
        const slope = linearSlope(recentValues);
        const unitAwareTrendFloor = metric.key === 'bloodSugar' && glucoseUnit === 'mg/dL' ? 4 : metric.trendFloor;
        const trendThreshold = Math.max(unitAwareTrendFloor, statistics[metric.key].deviation * 0.25);
        const trend = slope > trendThreshold ? 'increasing' : slope < -trendThreshold ? 'decreasing' : 'stable';
        const zScore = normalizedLatest[metric.key];
        return {
            key: metric.key,
            label: metric.label,
            latest: round(latest[metric.key]),
            unit,
            baselineMean: round(statistics[metric.key].mean),
            deviationFromBaseline: round(zScore, 2),
            trend,
            changePerRecord: round(slope, 2),
            nextReadingEstimate: round(latest[metric.key] + slope),
            abnormal: Math.abs(zScore) >= 3,
        };
    });

    const abnormalMetrics = metrics.filter((metric) => metric.abnormal);
    const changingMetrics = metrics.filter((metric) => metric.trend !== 'stable');
    let riskScore = 5;
    riskScore += Math.min(35, Math.round((anomalyScore / anomalyThreshold) * 25));
    if (isAnomaly) riskScore += 20;
    riskScore += Math.min(20, changingMetrics.length * 5);
    riskScore += Math.min(45, clinicalAlerts.length * 25);
    riskScore = Math.min(100, riskScore);

    const riskLevel = riskScore >= 65 ? 'high' : riskScore >= 30 ? 'moderate' : 'low';
    const trendText = changingMetrics.length > 0
        ? `${changingMetrics.map((metric) => `${metric.label.toLowerCase()} ${metric.trend}`).join(', ')}.`
        : 'No strong short-term trend was detected.';
    const summary = isAnomaly
        ? `The latest readings differ from the learned personal baseline. ${trendText}`
        : `The latest readings are consistent with the learned personal baseline. ${trendText}`;

    const recommendations = [];
    if (clinicalAlerts.length > 0) {
        recommendations.push('Review the latest reading and follow the elderly person\'s care plan. Seek professional advice if symptoms are present.');
    } else if (isAnomaly || riskLevel === 'moderate') {
        recommendations.push('Repeat the measurements under similar conditions and continue monitoring the next readings.');
    } else {
        recommendations.push('Continue regular health recording to keep the personalized baseline current.');
    }

    return {
        modelInfo: {
            name: 'Personalized kNN anomaly detection with linear trend regression',
            version: '1.0.0',
            modelReady: true,
            minimumRecords: MINIMUM_RECORDS,
            recordsAnalyzed: records.length,
            trainingRecords: training.length,
        },
        riskLevel,
        riskScore,
        stabilityScore: 100 - riskScore,
        isAnomaly,
        anomalyScore: round(anomalyScore, 2),
        anomalyThreshold: round(anomalyThreshold, 2),
        summary,
        clinicalAlerts,
        recommendations,
        latestRecordId: latest.id,
        latestRecordedAt: latest.recordedAt,
        glucoseUnit,
        metrics,
        generatedAt: new Date().toISOString(),
        disclaimer: 'This screening result supports monitoring only and is not a medical diagnosis.',
    };
};

module.exports = {
    MINIMUM_RECORDS,
    analyzeHealthRecords,
    evaluateHealthAlerts,
};
