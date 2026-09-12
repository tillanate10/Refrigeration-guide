# Refrigerator Sealed-System Tech v3 — Installable PWA

A mobile-first refrigerator sealed-system technician app designed to be installed on iPhone, Android, and desktop and shared by URL.

## What changed in v3
- Installable PWA with app manifest and icons
- Offline shell caching with service worker
- Add-to-Home-Screen / Install button where supported
- Native share button using the device share sheet when available
- Shareable URL architecture
- Docker deployment support
- Render deployment configuration
- Existing exact-model research, rating-plate analysis, verification gates, checklists and repair history retained

## Run locally
1. Python 3.11+ recommended.
2. `cd backend`
3. `pip install -r requirements.txt`
4. Copy `.env.example` to `.env` and add `OPENAI_API_KEY`.
5. `uvicorn app:app --reload`
6. Open `http://127.0.0.1:8000`.

## Deploy and share
The easiest path is a managed HTTPS host that can run the included Dockerfile. Render is preconfigured in `render.yaml`.

1. Put this folder in a Git repository.
2. Create a Render Web Service from the repository.
3. Render will use the Dockerfile.
4. Set `OPENAI_API_KEY` as a secret environment variable.
5. Deploy.
6. The resulting HTTPS URL can be shared with other technicians.

The app needs HTTPS (or localhost) for normal PWA installation. On iPhone/iPad, open the deployed HTTPS URL in a supported browser and use the browser's Share menu to add it to the Home Screen. On supported desktop/Android browsers, an Install option may appear in the browser UI. See MDN's PWA installation guidance for platform-specific behavior.

## Security
- Never put the OpenAI API key in frontend JavaScript.
- Keep `.env` out of Git.
- The current repair history is stored in each user's browser local storage.
- If this becomes a multi-technician product, add authentication and a server-side database before storing shared customer/service records.

## Safety behavior
The research engine is deliberately conservative. If exact-model refrigerant or factory charge is not sufficiently verified, the app does not invent a value and flags the repair before charging.
