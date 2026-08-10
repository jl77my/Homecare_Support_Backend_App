# AI Agent + Health Prediction Integration Guide

## Integrated data flow

1. A caregiver records heart rate, blood pressure and blood glucose through Flutter.
2. The existing `HealthRecords` table stores the readings.
3. The caregiver and family prediction endpoints load up to 90 readings and run `healthPredictionService`.
4. Flutter parses the response as `HealthPrediction` and displays `HealthPredictionCard` on both dashboards.
5. The AI agent retrieves the same readings, calculates the same prediction and includes it in the RAG context sent to Gemini.
6. Gemini may explain the retrieved prediction but is instructed to treat it as monitoring support, not a diagnosis.

## Backend integration points

- `src/services/healthPredictionService.js` contains the personalized kNN anomaly and trend logic.
- `src/controllers/caregiverController.js` and `src/controllers/familyController.js` expose authorized predictions.
- `src/routes/caregiverRoutes.js` and `src/routes/familyRoutes.js` register the prediction endpoints.
- `src/agent/retrievalService.js` adds `healthPrediction` to the live RAG context.
- `src/agent/geminiClient.js` defines the safe explanation boundary.

No new prediction database table, Python service or runtime package is required. The agent still requires `database/agent_migration.sql` for action replay protection.

## Flutter integration points

- `lib/core/models/models.dart` parses prediction and metric responses.
- `lib/core/widgets/health_prediction_card.dart` renders training, risk, trend and alert states.
- Caregiver/family services call their role-specific prediction endpoints.
- Caregiver/family providers load prediction state with health records.
- Both dashboards display the prediction card.
- The agent screen includes a health-prediction example question.

## Run locally

Backend:

```bash
cp .env.example .env
# Fill in database, JWT, action-secret and Gemini values.
npm ci
npm test
npm start
```

Flutter, from the integrated app folder:

```bash
flutter pub get
dart format --output=none --set-exit-if-changed lib test
flutter analyze
flutter test
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api
```

Use `http://localhost:3000/api` for Chrome/Windows or the computer's LAN IPv4 address for a physical phone.

## End-to-end test

1. Pair one caregiver and one family member with an elderly account.
2. Record fewer than five complete health readings. Both dashboards should show baseline-learning progress.
3. Record at least five complete, chronologically different readings. Both dashboards should show a ready prediction.
4. As caregiver and family, ask the agent: `What does the health prediction show?`
5. Confirm that the agent's risk level and summary match the dashboard and include a monitoring-only disclaimer.
6. Add a clearly unusual latest test reading in a non-production test account. Confirm the prediction returns a higher attention state and relevant fixed-threshold alerts.
7. Try the prediction endpoint with an unlinked elderly ID. It must return HTTP 403.
8. Re-run existing agent questions and confirmation-based actions to ensure they still work.

Do not use synthetic extreme readings in a real person's care record. The prediction is screening support and must not delay professional or emergency care.
