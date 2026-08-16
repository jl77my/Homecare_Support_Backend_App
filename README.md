# HomeCare Backend with Gemini RAG Agent

This backend combines the authenticated Gemini RAG care agent and personalized health-prediction module for **caregiver** and **family** accounts. The agent uses the stable `gemini-3.1-flash-lite` model, retrieves the selected elderly person's live care records and calculated health prediction, adds relevant curated care guidance, and can prepare database actions for explicit confirmation.

## What was added

- `POST /api/agent/chat` — answer a question or prepare one action.
- `POST /api/agent/actions/confirm` — execute a signed, ten-minute action preview.
- Live RAG over today's medication/log data, mood, tasks, health records and recent care reports.
- Local care-guidance retrieval for falls, emergencies, missed doses and reporting.
- Caregiver/family role enforcement and per-patient linkage checks.
- Gemini calls only from Node.js; the API key is never placed in Flutter.
- `store: false` for Gemini Interactions API requests.
- Parameterized MySQL writes, confirmation-token user binding, rate limiting and idempotent action execution.
- Automated unit/integration-style tests with a mocked Gemini client.
- Personalized kNN anomaly detection and short-term linear trend estimates over up to 90 health records.
- Health-prediction results available to both the Flutter dashboards and the agent's retrieved context.

Supported confirmed actions:

1. Create a task.
2. Create an appointment or care-activity reminder.
3. Schedule a medication reminder.
4. Create a care report.

## 1. Install and configure

Use Node.js 20 or newer. From this backend folder:

```bash
npm install
```

Copy `.env.example` to `.env` and enter real values. Keep `.env` private.

```env
PORT=3000
DB_HOST=127.0.0.1
DB_USER=homecare_user
DB_PASSWORD=your_database_password
DB_NAME=homecare
JWT_SECRET=a_long_random_authentication_secret
AGENT_ACTION_SECRET=a_different_long_random_action_secret
GEMINI_API_KEY=your_google_ai_studio_api_key
GEMINI_MODEL=gemini-3.1-flash-lite
CORS_ORIGIN=http://localhost:3000
AGENT_RATE_LIMIT_PER_MINUTE=15
```

Create a Gemini API key in Google AI Studio. Do not use `gemini-3.1-flash-lite-preview`; that preview endpoint has been shut down. The stable model ID is `gemini-3.1-flash-lite`.

## 2. Apply the database migration

Open MySQL Workbench or phpMyAdmin, select the same database configured in `DB_NAME`, and run:

```text
database/agent_migration.sql
```

Then run:

```text
migrations/20260817_unique_care_report_acknowledgement.sql
```

The first migration creates `AgentActionExecutions` for action replay protection and auditing. The second removes legacy duplicate report acknowledgements and adds a database-level rule that allows each family account to acknowledge a report only once. Back up the database before applying migrations.

## 3. Start and verify the backend

```bash
npm start
```

Open `http://localhost:3000/api/health`. The expected response contains:

```json
{"status":"ok"}
```

Run the automated tests:

```bash
npm test
```

The tests do not consume Gemini quota because Gemini is mocked.

### Health-prediction endpoints

- `GET /api/caregiver/health/:elderlyId/prediction`
- `GET /api/family/health/:elderlyId/prediction`

Both endpoints require a JWT and an active caregiver assignment or family link. The model needs five complete readings to learn a personal baseline. Before that, it returns training progress while still checking the latest values against the configured safety thresholds. No additional database table or Python service is required. See `docs/health-prediction-module.md` for the model details and response behavior.

## 4. Connect Flutter

The updated Flutter project already contains the agent model, service, Riverpod provider, chat screen and caregiver/family-only floating button.

Run Flutter with the correct backend URL:

```bash
# Chrome or Windows desktop when Node.js runs on the same computer
flutter run -d chrome --dart-define=API_BASE_URL=http://localhost:3000/api

# Android emulator
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api

# Physical phone on the same Wi-Fi (replace with the computer's IPv4 address)
flutter run --dart-define=API_BASE_URL=http://192.168.1.100:3000/api
```

For a physical Android phone, allow Node.js through Windows Firewall and confirm the phone can open `http://YOUR_PC_IP:3000/api/health`. Production Android builds should use an HTTPS backend.

## 5. End-to-end acceptance testing

Prepare one elderly account, one caregiver account and one family account. Pair the caregiver and family member to the elderly account before testing.

| Test | User message | Expected result |
| --- | --- | --- |
| Role visibility | Log in as elderly | No Care Agent button is visible. |
| Role visibility | Log in as caregiver/family | Care Agent button is visible. |
| Patient authorization | Select a linked senior | Chat works only for that linked senior. |
| Medication RAG | `Has the elderly taken medication today?` | Reply lists today's scheduled medicines and uses `TodayStatus`; it does not invent a dose. |
| Missing log | Ask the same question before confirming medicine | Reply says no taken record exists or that it is pending. |
| Fall guidance | `How should I react if the elderly falls in the bathroom?` | Immediate safety advice appears before prevention advice; serious warning signs lead to Malaysia 999 guidance. |
| Prediction training | Use a senior with fewer than five complete health records | Dashboard shows baseline-learning progress; the agent explains that more readings are needed. |
| Prediction ready | Use a senior with at least five complete health records and ask `What does the health prediction show?` | Dashboard and agent report the same risk level, trend summary and safety disclaimer. |
| Ambiguous action | `Create a reminder` | Agent asks for the missing date/time or title and does not show Confirm. |
| Task action | `Create a task to check blood pressure tomorrow at 9 AM` | A preview appears; no row exists before Confirm; one `Tasks` row exists after Confirm. |
| Medication action | `Schedule Metformin 500 mg daily at 8 AM starting tomorrow` | A medication preview appears and inserts one `Medications` row only after Confirm. |
| Reminder action | `Remind her about the clinic appointment Friday at 2 PM` | An appointment reminder preview appears and is visible in Reminders after Confirm. |
| Care report | `Create a care report: she ate well and walked for 15 minutes today` | A care-report preview appears and is visible in Reports after Confirm. |
| Cancel | Request any action and tap Cancel | No database row is created. |
| Replay protection | Submit the same confirmation token twice in Postman | Second call returns HTTP 409. |
| Cross-patient protection | Change `elderlyId` in Postman to an unlinked user | HTTP 403 is returned before any care data is retrieved. |

After every confirmed action, verify both the relevant Flutter screen and the MySQL table. Also inspect `AgentActionExecutions`: the successful row should have `Status = COMPLETED` and the created `ResourceId`.

## 6. Direct API testing with Postman

First log in through `/api/users/login` and copy the JWT. Add this header to both agent calls:

```text
Authorization: Bearer YOUR_JWT
Content-Type: application/json
```

Chat request:

```http
POST /api/agent/chat
```

```json
{
  "elderlyId": "LINKED_ELDERLY_UUID",
  "message": "Create a task to check blood pressure tomorrow at 9 AM",
  "history": []
}
```

If the response contains `action.token`, confirm it:

```http
POST /api/agent/actions/confirm
```

```json
{
  "actionToken": "SIGNED_TOKEN_FROM_CHAT_RESPONSE"
}
```

## 7. Troubleshooting

- **`GEMINI_NOT_CONFIGURED`**: `GEMINI_API_KEY` is absent from the backend `.env` or deployment secret.
- **Gemini 404 model error**: use `gemini-3.1-flash-lite`, not the retired preview ID.
- **HTTP 403**: confirm the JWT role is `caregiver` or `family` and the corresponding active pairing row exists.
- **`AgentActionExecutions` does not exist**: run `database/agent_migration.sql` in the configured database.
- **Flutter network error on Android emulator**: use `10.0.2.2`, not `localhost`.
- **Flutter network error on a phone**: use the PC's LAN IPv4 address, keep both devices on the same network and check the firewall.
- **Action preview expires**: ask the agent again; previews expire after ten minutes.
- **HTTP 429**: wait one minute or adjust `AGENT_RATE_LIMIT_PER_MINUTE` for local testing.
- **Gemini response is slow**: test a short prompt, check API quota, and inspect the backend console without logging patient prompts or API keys.

## Safety boundary

The agent is decision support, not a medical professional or emergency service. It must not diagnose, change prescriptions or delay emergency help. Care records are supplied to Gemini only for the current answer, and application conversation state remains in Flutter memory for the signed-in session.
