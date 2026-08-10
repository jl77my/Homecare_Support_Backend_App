# Health Prediction Module

## Purpose

The module analyzes an elderly user's historical heart rate, blood pressure, and blood glucose records. It adds personalized anomaly and trend detection to the existing fixed health alerts. It is a monitoring aid, not a diagnostic system.

## Model

The model runs inside the existing Node.js API container and requires no new database table or runtime dependency.

1. It loads up to 90 complete health records for the selected elderly user.
2. It uses the older records as that user's training baseline.
3. A standardized k-nearest-neighbor (kNN) model compares the latest record with the learned baseline.
4. Linear regression over the seven most recent records estimates direction and the next likely reading.
5. Fixed safety thresholds remain as guardrails for readings that are clinically concerning even when they are normal for that user's history.

At least five complete records are required. Before that, the API returns training progress and still evaluates the latest reading against the safety thresholds.

## API endpoints

- `GET /api/caregiver/health/:elderlyId/prediction`
- `GET /api/family/health/:elderlyId/prediction`

Both endpoints require a valid JWT. The caregiver endpoint verifies an active caregiver assignment, while the family endpoint verifies an active family link.

The response contains the model status, risk and stability scores, anomaly result, metric-level trends, next-reading estimates, alerts, recommendations, and a medical disclaimer.

## Deployment

No Docker or Kubernetes configuration change is needed. Rebuild the existing API image so the new source is included:

```bash
docker compose up --build
```

## Verification

Run the backend tests with:

```bash
npm test
```

Run Flutter checks from the mobile project with:

```bash
dart format lib
flutter analyze
flutter test
```

For a demonstration, add at least five chronologically different health records for one elderly user. Stable readings should produce a stable result; a clearly unusual latest reading should produce a higher attention level with an explanation.
