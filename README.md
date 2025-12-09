# PaceCtrl MVP (backend + widget)

Minimal proof-of-concept for PaceCtrl with a FastAPI backend and an embeddable widget bundle. No database is used; intents are stored in memory for the lifetime of the process.

## Backend (FastAPI)

Location: `backend/`

Requirements: Python 3.11+

Install and run locally:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Key endpoints:
- `GET /health` – service check
- `GET /api/v1/public/widget/config?external_trip_id=HEL-TLL-2025-12-12` – returns static trip config + theme
- `POST /api/v1/public/choice-intents` with `{ external_trip_id, reduction_pct }` – validates bounds, stores intent in memory, returns `{ intent_id }`
- `GET /widget.js` – serves the built widget bundle from `widget/dist/widget.js`

CORS is fully open to allow embedding from external origins.

## Widget bundle

Location: `widget/`

Build the UMD-style bundle (exposed as `window.PaceCtrlWidget`):

```powershell
cd widget
npm install
npm run build
```

Output: `widget/dist/widget.js` (served by the backend).

Init API:
```html
<div id="pacectrl-widget" data-external-trip-id="HEL-TLL-2025-12-12"></div>
<script src="https://YOUR-RAILWAY-URL/widget.js"></script>
<script>
  window.PaceCtrlWidget.init({
    container: "#pacectrl-widget",
    apiBaseUrl: "https://YOUR-RAILWAY-URL",
    // optional
    onIntentCreated: (intent) => console.log(intent)
  });
</script>
```

React/local test snippet (index.html inside your app):
```html
<div id="pacectrl-widget" data-external-trip-id="HEL-TLL-2025-12-12"></div>
<script src="https://YOUR-RAILWAY-URL/widget.js"></script>
<script>
  window.PaceCtrlWidget.init({
    container: "#pacectrl-widget",
    apiBaseUrl: "https://YOUR-RAILWAY-URL"
  });
</script>
```

A simple manual demo is available at `widget/demo.html`; it loads the local bundle and posts to `http://localhost:8000` by default. Adjust `apiBaseUrl` in the script if using Railway.

## Railway deployment

1) Ensure `widget/dist/widget.js` exists (`npm run build` in `widget/`). Commit artifacts if deploying directly from repo.
2) Create a new Railway service from this folder, set the root to `backend/`.
3) Railway will read `backend/Procfile` and start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
4) No env vars are required for this milestone.
5) After deploy, your public widget URL is `https://<railway-host>/widget.js` and API base is `https://<railway-host>`.

## Notes
- Static trip is hardcoded to `HEL-TLL-2025-12-12` with the provided speed/theme values.
- Intents live in memory only (cleared on restart) until Postgres is added later.
- CORS allows all origins to simplify embedding during MVP.
