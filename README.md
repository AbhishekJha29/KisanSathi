# KisanSathi - Smart Crop Advisory Assistant

Smart farming advice, scientific fertilizer schedules, growth stage irrigation, and pest management tailored for Indian farmers across all major agricultural regions.

## Architecture Overview

- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS, Lucide / Material Symbols.
- **Backend:** Python Flask application factory, SQLite (`sqlite3` standard library, zero ORM dependencies), Flask-CORS, python-dotenv.

---

## Getting Started

### Frontend + backend together

#### Development:
1. **Start the Flask backend:**
   ```bash
   python -m backend.app
   ```
   *The backend runs on `http://localhost:8000`.*

2. **Start the Vite frontend development server:**
   ```bash
   cd frontend
   npm run dev
   ```
   *Open `http://localhost:3000` in your browser. Vite proxies `/api` requests to port 8000.*

#### Production:
1. **Build the production frontend:**
   ```bash
   cd frontend
   npm run build
   ```

2. **Start the backend server:**
   ```bash
   python -m backend.app
   ```
   *Open `http://localhost:8000` in your browser. Flask serves the production build directly.*

### 1. Frontend (React + Vite + TypeScript)

**Prerequisites:** Node.js 18+

```bash
# Install dependencies
npm install

# Run Vite development server (port 3000, proxies /api requests to port 8000)
npm run dev
```

### 2. Backend (Python + Flask + SQLite)

**Prerequisites:** Python 3.10+

1. Create and activate a Python virtual environment:
   ```bash
   python -m venv venv
   # Windows (PowerShell/CMD):
   venv\Scripts\activate
   # macOS / Linux:
   source venv/bin/activate
   ```

2. Install dependencies:
   ```bash
   pip install -r backend/requirements.txt
   ```

3. Configure environment:
   ```bash
   cp backend/.env.example backend/.env
   ```

4. Initialize and Seed the SQLite Database:
   ```bash
   python -m backend.seed
   ```
   *Populates `backend/data/kisansathi.db` with 18 core crops, 36 Indian states/UTs, and detailed agronomy profiles (fertilizer schedules, irrigation rules, pest/disease controls, harvest stages).*

5. Start the API server:
   ```bash
   python -m backend.app
   ```
   *Runs on `http://localhost:8000` (or `PORT` defined in `.env`).*

6. Run the automated test suite:
   ```bash
   python -m pytest backend/tests
   ```

   To run tests with test coverage reporting (requires `backend/requirements-dev.txt`):
   ```bash
   pip install -r backend/requirements-dev.txt
   python -m pytest backend/tests --cov=backend --cov-report=term-missing
   ```

---

## Database

### Database File Location
The SQLite database file is stored at:
```
backend/data/kisansathi.db
```
Its path is configured via the `DATABASE_PATH` environment variable (computed as an absolute path relative to `backend/config.py`).

### How to Seed the Database
To initialize tables and populate all agronomic data, run the seed script from the project root:
```bash
python -m backend.seed
```
This performs an idempotent transaction:
1. Executes `CREATE TABLE IF NOT EXISTS` for all 8 tables and indexes.
2. Validates all JSON files in `backend/data/seed/` before touching the database.
3. Clears existing crop-related tables and re-inserts all 18 crops, 36 Indian states/UTs, and associated agronomy child records.
4. Outputs the exact counts of inserted crops, states, and child records.

### Table-by-Table Schema Description
The database uses a normalized relational design using standard library `sqlite3` (no ORM):
- **`crops`**: Core metadata, botanical info, duration days, water need, expected yield, mandi price range, descriptions, and scores in English. Primary key: `id` (e.g. `'wheat'`).
- **`crop_seasons`**: Junction table mapping crops to cropping cycles (`'kharif'`, `'rabi'`, `'zaid'`). Composite PK: `(crop_id, season)`. Foreign key cascade on `crop_id`.
- **`crop_soils`**: Soil compatibility mapping (e.g., `'alluvial'`, `'black'`, `'loamy'`). Composite PK: `(crop_id, soil)`. Foreign key cascade on `crop_id`.
- **`fertilizer_stages`**: Split fertigation stages with stage order, English names, timing, fertilizer formulation, dose per acre, and application methods. Foreign key cascade on `crop_id`.
- **`irrigation_rules`**: Growth stage watering frequencies, runtimes, critical stages, water conserved, and best practice tips in English. Foreign key cascade on `crop_id`.
- **`pests_diseases`**: Diagnostic symptoms, severity level (`High Alert`, `Medium Risk`, `Preventive`), pest/disease classification, and IPM control remedies in English. Foreign key cascade on `crop_id`.
- **`harvest_steps`**: Ordered harvesting indicators, handling procedures, and storage guidelines in English. Foreign key cascade on `crop_id`.
- **`states`**: All 36 Indian states and union territories mapped to agro-climatic zones (`North`, `South`, `East`, `West`, `Central`, `North-East`, `Himalayan`). Primary key: `name`.

**Integrity & Security:**
- Foreign keys with `ON DELETE CASCADE`.
- B-tree indexes on foreign keys (`crop_id`).
- 100% parameterized SQL queries (`?` placeholders) protecting against SQL injection attacks.
- English-only schema with camelCase serialization matching TypeScript interfaces.

---

## API Endpoints & Example Responses

### 1. `GET /api/health`
System health status and current UTC timestamp.
- **Query Parameters:** None
- **Response `200 OK`:**
```json
{
  "service": "kisansathi-api",
  "status": "ok",
  "time": "2026-10-18T10:30:00.000000+00:00",
  "version": "0.1.0"
}
```

### 2. `GET /api/crops`
List crop summaries with optional season filtering and name search.
- **Query Parameters:**
  - `season` (*optional*): `'kharif'`, `'rabi'`, or `'zaid'`. Invalid values return `400 Bad Request`.
  - `search` (*optional*): Case-insensitive search string matching English crop names.
- **Response `200 OK` (`GET /api/crops?season=rabi`):**
```json
{
  "count": 9,
  "crops": [
    {
      "avgYield": "18 - 24 Quintal / Acre (approx.)",
      "badge": "Rabi Staple",
      "badgeType": "rabi",
      "category": ["rabi", "cash"],
      "description": "India's premier winter food grain crop. Requires cool winter during vegetative growth and warm dry weather during ripening.",
      "descriptionEn": "India's premier winter food grain crop. Requires cool winter during vegetative growth and warm dry weather during ripening.",
      "duration": "110–130 Days",
      "durationDays": 120,
      "expectedYield": "18 - 24 Quintal / Acre (approx.)",
      "hubs": "Punjab, Haryana, Uttar Pradesh, Madhya Pradesh, Rajasthan",
      "id": "wheat",
      "imageAlt": "Golden amber ripe wheat fields swaying under bright blue winter sky",
      "imageUrl": "https://lh3.googleusercontent.com/aida-public/AB6AXuD4xm5fTpRz2tXPmffI55gBXZbEHdnVzhpZosxwKY8UhXwJhOlhi6xPwAO_St_sXT3cjs9XJtxRy_FqF5DOKvKNfSVx11wMQF6QU2KFz5VhSxjtqMb0eZcjZ9nVUQyrMgd0C4WhdlwIDbSr7G20EocWTbQX3Nhy5artkh4YfZlUb8Le4z-pUVZ24DtuJGOP51gsgjwHr6rbjIKTZfjqrjSLSkugE5Sn1-g3BwS6MOIKFs9v-HMLcOfj",
      "idealSoil": "Well-drained Loamy & Alluvial",
      "mandiPriceRange": "₹2,275 - ₹2,450 / Qtl (approx.)",
      "marketPrice": "₹2,275 - ₹2,450 / Qtl (approx.)",
      "metricTitle": "National Staple",
      "metricValue": "High Demand",
      "nameEn": "Wheat",
      "popularityScore": 97,
      "profitScore": 88,
      "scientificName": "Triticum aestivum",
      "seasons": ["rabi"],
      "soils": ["alluvial", "loamy"],
      "tagline": "Major Rabi cereal crop feeding the nation",
      "varietyTag": "HD-2967 / PBW-343 / Lokwan",
      "waterLevel": "medium",
      "waterNeed": "Medium (4–6 Irrigations)"
    }
  ]
}
```

### 3. `GET /api/crops/<crop_id>`
Full nested agronomic profile for a crop including fertilizer stages, irrigation, pests/diseases, and harvest stages.
- **Parameters:** `crop_id` (e.g. `wheat`)
- **Response `200 OK` (`GET /api/crops/wheat`):**
```json
{
  "id": "wheat",
  "nameEn": "Wheat",
  "scientificName": "Triticum aestivum",
  "seasons": ["rabi"],
  "soils": ["alluvial", "loamy"],
  "seedRate": "40–45 kg / acre",
  "sowingDepth": "4–5 cm into moist seedbed",
  "spacing": "20–22.5 cm row spacing",
  "harvestingIndicator": "Grains turn hard and golden; straw turns yellow and brittle with moisture below 12%.",
  "introTipEn": "Crown Root Initiation (CRI at 21 DAS) is the most critical stage. Never delay the first irrigation and top-dressing dose of Urea.",
  "efficiencyGain": "20% yield boost with timely CRI irrigation",
  "micronutrientNote": "Zinc deficiency causes yellowing between leaf veins. Spray 0.5% ZnSO4 + 0.25% Lime if deficient.",
  "stagnationAlert": "Avoid stagnant water for more than 24 hours. Prolonged waterlogging suffocates root respiration and turns leaves yellow.",
  "fertilizerStages": [
    {
      "applicationMethod": "Drill 4–5 cm below seed level during sowing",
      "fertilizerEn": "DAP + Muriate of Potash + Zinc Sulphate",
      "quantityPerAcre": "50 kg DAP + 20 kg MOP + 10 kg ZnSO4",
      "stageEn": "Basal Dose",
      "stageOrder": 1,
      "timingEn": "At sowing"
    }
  ],
  "irrigation": {
    "criticalStagesEn": "Crown Root Initiation (20–25 DAS), Booting & Flowering (70–85 DAS), Grain Filling (95–105 DAS)",
    "frequencyEn": "Every 18–22 Days (4–5 irrigations)",
    "runtimePerZone": "2.5 hours per rotation",
    "tipsEn": "Avoid stagnant water for more than 24 hours.",
    "waterConserved": "~30% via furrow / sprinkler"
  },
  "pestsDiseases": [
    {
      "controlEn": "Spray Propiconazole 25% EC (1 ml/L water) at the first notice of pustules.",
      "nameEn": "Yellow / Brown Rust",
      "severity": "High Alert",
      "symptomsEn": "Yellow to orange-brown powdery pustules arranged in stripes on leaves.",
      "type": "disease"
    }
  ],
  "harvestSteps": [
    {
      "letter": "A",
      "stepOrder": 1,
      "textEn": "Grain moisture should drop below 12% and straw becomes dry golden yellow.",
      "titleEn": "Maturity Testing"
    }
  ]
}
```

### 4. `GET /api/options`
Dropdown form options for agricultural advisory selection.
- **Query Parameters:** None
- **Response `200 OK`:**
```json
{
  "seasons": [
    { "id": "kharif", "nameEn": "Kharif" },
    { "id": "rabi", "nameEn": "Rabi" },
    { "id": "zaid", "nameEn": "Zaid / Summer" }
  ],
  "soils": [
    { "id": "alluvial", "nameEn": "Alluvial Soil" },
    { "id": "black", "nameEn": "Black Soil / Regur" },
    { "id": "red", "nameEn": "Red Soil" },
    { "id": "laterite", "nameEn": "Laterite Soil" },
    { "id": "sandy", "nameEn": "Sandy / Desert Soil" },
    { "id": "loamy", "nameEn": "Loamy Soil" },
    { "id": "clay", "nameEn": "Clay Soil" },
    { "id": "mountain", "nameEn": "Mountain / Forest Soil" }
  ],
  "states": [
    { "name": "Andaman and Nicobar Islands", "region": "South" },
    { "name": "Andhra Pradesh", "region": "South" },
    { "name": "Arunachal Pradesh", "region": "North-East" },
    { "name": "Assam", "region": "North-East" },
    { "name": "Bihar", "region": "East" },
    { "name": "Chandigarh", "region": "North" },
    { "name": "Chhattisgarh", "region": "Central" },
    { "name": "Dadra and Nagar Haveli and Daman and Diu", "region": "West" },
    { "name": "Delhi", "region": "North" },
    { "name": "Goa", "region": "West" },
    { "name": "Gujarat", "region": "West" },
    { "name": "Haryana", "region": "North" },
    { "name": "Himachal Pradesh", "region": "Himalayan" },
    { "name": "Jammu and Kashmir", "region": "Himalayan" },
    { "name": "Jharkhand", "region": "East" },
    { "name": "Karnataka", "region": "South" },
    { "name": "Kerala", "region": "South" },
    { "name": "Ladakh", "region": "Himalayan" },
    { "name": "Lakshadweep", "region": "South" },
    { "name": "Madhya Pradesh", "region": "Central" },
    { "name": "Maharashtra", "region": "West" },
    { "name": "Manipur", "region": "North-East" },
    { "name": "Meghalaya", "region": "North-East" },
    { "name": "Mizoram", "region": "North-East" },
    { "name": "Nagaland", "region": "North-East" },
    { "name": "Odisha", "region": "East" },
    { "name": "Puducherry", "region": "South" },
    { "name": "Punjab", "region": "North" },
    { "name": "Rajasthan", "region": "West" },
    { "name": "Sikkim", "region": "North-East" },
    { "name": "Tamil Nadu", "region": "South" },
    { "name": "Telangana", "region": "South" },
    { "name": "Tripura", "region": "North-East" },
    { "name": "Uttar Pradesh", "region": "North" },
    { "name": "Uttarakhand", "region": "Himalayan" },
    { "name": "West Bengal", "region": "East" }
  ],
  "units": [
    { "id": "acres", "nameEn": "Acres" },
    { "id": "hectares", "nameEn": "Hectares" },
    { "id": "bigha", "nameEn": "Bigha" }
  ],
  "waterSources": [
    { "id": "rainfed", "nameEn": "Rainfed / Dryland" },
    { "id": "canal", "nameEn": "Canal Irrigation" },
    { "id": "borewell", "nameEn": "Borewell / Tubewell" },
    { "id": "drip", "nameEn": "Drip Irrigation" },
    { "id": "sprinkler", "nameEn": "Sprinkler Irrigation" },
    { "id": "pond_river", "nameEn": "Pond / River / Lift" }
  ]
}
```

### 5. `POST /api/advisory`
Generates a comprehensive, tailored agronomic advisory report from field parameters.

- **Endpoint:** `POST /api/advisory`
- **Headers:** `Content-Type: application/json`
- **Validation Constraints:**
  - `crop`: Required string, must match an existing crop `id` in the database (e.g. `'wheat'`, `'rice'`).
  - `soilType` (or `soil`): Required string, must be one of: `'alluvial'`, `'black'`, `'red'`, `'laterite'`, `'sandy'`, `'loamy'`, `'clay'`, `'mountain'`.
  - `season`: Required string, must be one of: `'kharif'`, `'rabi'`, `'zaid'`.
  - `state`: Required string, must match an Indian state or union territory from the `states` table.
  - `district`: Required string, 1 to 100 characters.
  - `block` (*optional*): String, up to 100 characters.
  - `landSize`: Required positive number, `0 < landSize <= 10000`.
  - `landUnit`: Required string, must be one of: `'acres'`, `'hectares'`, `'bigha'`.
  - `waterSource`: Required string, must be one of: `'rainfed'`, `'canal'`, `'borewell'`, `'drip'`, `'sprinkler'`, `'pond_river'`.
  - `farmerName` (*optional*): String, up to 100 characters.

- **Example JSON Request:**
```json
{
  "crop": "wheat",
  "soilType": "loamy",
  "season": "rabi",
  "state": "Uttar Pradesh",
  "district": "Varanasi",
  "block": "Pindra",
  "landSize": 5.0,
  "landUnit": "acres",
  "waterSource": "canal"
}
```

- **Abridged JSON Response (`200 OK`):**
```json
{
  "efficiencyGain": "20% yield boost with timely CRI irrigation",
  "expectedYield": "18 - 24 Quintal / Acre (approx.)",
  "fertilizerPlan": [
    {
      "applicationMethod": "Drill 4–5 cm below seed level during sowing",
      "fertilizerName": "DAP + Muriate of Potash + Zinc Sulphate",
      "qtyPerAcre": "250 kg DAP + 100 kg MOP + 50 kg ZnSO4",
      "stage": "Basal Dose"
    },
    {
      "applicationMethod": "Broadcast just before first irrigation",
      "fertilizerName": "Neem-Coated Urea",
      "qtyPerAcre": "175 kg Urea",
      "stage": "First Top Dressing (21–25 DAS / CRI)"
    }
  ],
  "fieldData": {
    "block": "Pindra",
    "crop": "wheat",
    "district": "Varanasi",
    "landSize": 5.0,
    "landUnit": "acres",
    "season": "rabi",
    "soil": "loamy",
    "soilType": "loamy",
    "state": "Uttar Pradesh",
    "waterSource": "canal"
  },
  "generatedDate": "October 2026 / Rabi Season",
  "harvestSteps": [
    {
      "desc": "Grain moisture should drop below 12% and straw becomes dry golden yellow.",
      "letter": "A",
      "title": "Maturity Testing"
    }
  ],
  "irrigationFrequency": "Every 18–22 Days (4–5 irrigations)",
  "mandiRates": [
    {
      "cropName": "Wheat (Grade-A / Premium)",
      "marketYard": "North APMC Benchmark Yard",
      "rateRange": "₹2,275 - ₹2,450 / Qtl",
      "trend": "trending_up",
      "trendText": "+₹40 / Qtl this week",
      "variety": "HD-2967 / PBW-343 / Lokwan"
    }
  ],
  "micronutrientNote": "Zinc deficiency causes yellowing between leaf veins. Spray 0.5% ZnSO4 + 0.25% Lime if deficient.",
  "moistureStages": [
    {
      "status": "Most Critical - Do not miss",
      "step": 1,
      "title": "Crown Root Initiation (20–25 DAS)"
    }
  ],
  "personalizedIntro": "Hello! For your 5.0 acres plot in Varanasi (Pindra), Uttar Pradesh (North Region), Crown Root Initiation (CRI at 21 DAS) is the most critical stage. Never delay the first irrigation and top-dressing dose of Urea. With canal irrigation, maintain optimal soil moisture and scout leaves regularly for pests.",
  "pests": [
    {
      "control": "Spray Propiconazole 25% EC (1 ml/L water) at the first notice of pustules.",
      "name": "Yellow / Brown Rust",
      "severity": "High Alert",
      "symptoms": "Yellow to orange-brown powdery pustules arranged in stripes on leaves."
    }
  ],
  "runtimePerZone": "2.5 hours per rotation",
  "stagnationAlert": "Avoid stagnant water for more than 24 hours. Prolonged waterlogging suffocates root respiration and turns leaves yellow.",
  "waterConserved": "~30% via furrow / sprinkler",
  "zoneName": "North Agro-Climatic Region (Uttar Pradesh)"
}
```

### How the Advisory Engine Works
The advisory engine processes agricultural advice through a deterministic four-stage pipeline without external network dependencies:
1. **Validation & Normalization:** Incoming JSON payloads are sanitized against strict schemas and database foreign keys; numeric land measurements are standardized to acres using verified agricultural conversion ratios (1 hectare = 2.47105 acres, 1 bigha = 0.4 acre).
2. **Profile Retrieval:** The complete hierarchical crop profile (botanical characteristics, split fertigation stages, irrigation benchmarks, pest controls, harvest indicators) and state agro-climatic region are fetched from SQLite using parameterized queries.
3. **Domain Rule Engine:** Pure agronomic algorithms evaluate crop-season-soil compatibility (generating contextual warnings when sowing off-cycle or on non-ideal soil), linearly scale chemical and organic fertilizer dosages to plot area, adjust irrigation runtimes and frequencies based on water delivery method and soil water-holding capacity, and build APMC benchmark price tickers.
4. **Agronomic Synthesis:** English advice stream is generated with standardized salutations ("Hello!") and serialized into the exact `AdvisoryResultData` contract required by the React frontend.

---

## Gemini AI Features

KisanSathi integrates Google Gemini AI to deliver conversational advisory synthesis and interactive farmer follow-up chat, grounded strictly in ICAR and state agricultural university agronomic guidelines.

### 1. API Key Setup
1. Obtain an API key from [Google AI Studio](https://aistudio.google.com/).
2. Place the key in your local `backend/.env` file:
   ```env
   GEMINI_API_KEY=your_actual_api_key_here
   GEMINI_MODEL=gemini-2.5-flash
   AI_TIMEOUT_SECONDS=15
   AI_RATE_LIMIT_PER_MINUTE=10
   AI_CACHE_TTL_SECONDS=3600
   ```
3. Install backend dependencies (including the official `google-genai` Python SDK):
   ```bash
   pip install -r backend/requirements.txt
   ```

> [!IMPORTANT]
> **Server-Side Security:** The Gemini API key remains strictly on the server and is read exclusively from the environment. The key is **never** sent to the frontend, included in HTTP responses, printed in application logs, or committed to Git (`backend/.env` is ignored by `.gitignore`).

### 2. Behavior Without an API Key (Graceful Fallback)
If no `GEMINI_API_KEY` is provided, or if the Gemini service times out or is unreachable, the system automatically falls back:
- **Advisory Explanations:** Deterministic, rule-based English templates are generated directly from the crop, soil, fertilizer, irrigation, and pest data. The frontend labels these with `"Basic explanation (AI unavailable)"`.
- **Follow-Up Chat:** A polite message is returned in English informing the farmer that the AI assistant is currently unavailable and advising them to reference the verified plan sections above or consult their local Krishi Vigyan Kendra (KVK).
The core advisory engine, charts, tables, and PDF export function 100% offline without AI credentials.

### 3. AI Endpoints & Examples

#### `POST /api/advisory/explain`
Generates a concise (~120 words), plain-text conversational explanation of the field advisory.
- **Request Body:**
  ```json
  {
    "form": {
      "crop": "wheat",
      "soilType": "loamy",
      "season": "rabi",
      "state": "Uttar Pradesh",
      "district": "Varanasi",
      "block": "Pindra",
      "landSize": 5.0,
      "landUnit": "acres",
      "waterSource": "canal"
    }
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "explanation": "Hello! For your 5.0 acres wheat plot in Varanasi on loamy soil, balanced nutrition and timely watering are essential...",
    "source": "ai"
  }
  ```

#### `POST /api/chat`
Answers farmer follow-up questions grounded in the generated advisory context.
- **Request Body:**
  ```json
  {
    "form": {
      "crop": "wheat",
      "soilType": "loamy",
      "season": "rabi",
      "state": "Uttar Pradesh",
      "district": "Varanasi",
      "landSize": 5.0,
      "landUnit": "acres",
      "waterSource": "canal"
    },
    "question": "When should I apply the second dose of urea?",
    "history": [
      { "role": "user", "text": "Is canal water sufficient?" },
      { "role": "assistant", "text": "Yes, canal irrigation every 18-22 days is suitable." }
    ]
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "answer": "Apply the second top dressing of urea at the booting stage (60–65 DAS) just prior to irrigation to ensure maximum nitrogen uptake.",
    "source": "ai"
  }
  ```

### 4. Sliding-Window Rate Limiting & In-Memory Cache
- **Rate Limiting:** Both endpoints enforce a thread-safe sliding-window rate limit by client IP (`request.remote_addr`), defaulting to 10 requests per minute (`AI_RATE_LIMIT_PER_MINUTE`). When exceeded, the server returns HTTP `429 Too Many Requests` (`{"error": "Too many requests, please wait a minute"}`).
- **In-Memory TTL Cache:** Identical explanation requests are cached using a thread-safe LRU cache (200 entries, default 3600 seconds TTL, configurable via `AI_CACHE_TTL_SECONDS`). The cache key is computed as `SHA-256(sorted_form_json)`. Chat responses are not cached.

### 5. How the AI Part Works
When a farmer requests an explanation or asks a question, the Flask backend first validates all field inputs against the database schema and reconstructs the verified agronomic advisory on the server—client-sent advisories are never trusted. The server constructs a prompt combining the scientific plan with the farmer's question, enclosing untrusted user inputs (`question`, `district`, `block`) inside explicit delimiters (`<user_question>`, `<district>`, `<block>`) with system instructions stating that enclosed text is data, not instructions. The request is dispatched to Google Gemini via the `google-genai` SDK inside a worker thread with an enforced execution timeout (`AI_TIMEOUT_SECONDS`). High-frequency calls are throttled by an in-memory sliding-window limiter, identical explanation requests are instantly served from a TTL-backed hash cache, and any API errors, timeouts, or missing credentials automatically resolve to deterministic English fallbacks without leaking secrets or stack traces.

---

## Production Build & Single-Page Application (SPA) Serving

To serve the application entirely from Flask:
```bash
# 1. Build the frontend production bundle
npm run build

# 2. Start the backend server
python -m backend.app
```
Access the application at `http://localhost:8000`. Flask serves static assets from `dist/` and routes all non-API paths to `dist/index.html`.

