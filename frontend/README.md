# KisanSathi - Smart Crop Advisory Assistant

Smart farming advice, scientific fertilizer schedules, growth stage irrigation, and pest management tailored for Indian farmers across all major agricultural regions.

## Architecture Overview

- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS, Lucide / Material Symbols.
- **Backend:** Python Flask application factory, SQLite (`sqlite3` standard library, zero ORM dependencies), Flask-CORS, python-dotenv.

---

## Getting Started

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

---

## Database Architecture & Design

The backend uses a normalized SQLite database designed with `sqlite3` without ORMs:
- **`crops`**: Core metadata, botanical info, duration, water requirements, yields, and economics.
- **`crop_seasons`**: Many-to-many relationship mapping crops to cropping cycles (`kharif`, `rabi`, `zaid`).
- **`crop_soils`**: Soil compatibility associations (e.g., `alluvial`, `black`, `loamy`, etc.).
- **`fertilizer_stages`**: Ordered fertigation stages with English/Hindi instructions and dose rates.
- **`irrigation_rules`**: Growth stage watering frequencies, runtimes, and water conservation practices.
- **`pests_diseases`**: Common pests and crop diseases, symptom profiles, severity, and IPM controls.
- **`harvest_steps`**: Sequential harvesting indicators and instructions in English and Hindi.
- **`states`**: All 36 Indian states and union territories mapped to agro-climatic regions.

**Integrity & Security:**
- Foreign keys with `ON DELETE CASCADE`.
- B-tree indexes on foreign keys (`crop_id`).
- 100% parameterized SQL queries (`?` placeholders) protecting against SQL injection attacks.
- Bilingual schema (`_en` and `_hi` columns) with camelCase serialization matching TypeScript interfaces.

---

## API Endpoints

| Method | Endpoint | Description | Query Parameters |
|---|---|---|---|
| `GET` | `/api/health` | System health status and current UTC time | None |
| `GET` | `/api/ping` | Simple liveness probe returning `{"message": "pong"}` | None |
| `GET` | `/api/crops` | List crop summaries | `?season=kharif\|rabi\|zaid`<br>`?search=<text>` (matches EN / HI name) |
| `GET` | `/api/crops/<crop_id>` | Full nested agronomic details for a single crop | None |
| `GET` | `/api/options` | Categorical dropdown options (soils, seasons, water sources, units, states) | None |

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
