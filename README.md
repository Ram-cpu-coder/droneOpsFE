# DroneOps Frontend

DroneOps Frontend is the web portal for the DroneOps fleet management platform. It provides operational screens for dashboard monitoring, telemetry and geofences, fleet management, mission planning, maintenance, pilots, incidents, reports, users, settings, notifications, global search, profile management, and AI assistance.

The frontend is built with React, Vite, React Router, Redux Toolkit, Leaflet, Socket.IO client, Lucide icons, and document/report export libraries.

## Frontend Responsibilities

- Provide a responsive operations portal for administrators, pilots, and operations users.
- Display live dashboard metrics, alerts, mission queue, fleet status, and operational summaries.
- Support mission creation, route planning, council permission review, risk assessment, mission approval, start, completion, and mission profile review.
- Display telemetry, geofences, route replay, drone history, and live operational maps.
- Manage fleet records, drone profiles, drone lifecycle, certification, telemetry configuration, and maintenance history.
- Manage pilot credentials, licence expiry, mission history, and profile views.
- Support incident creation, incident profile review, evidence upload, and black-box telemetry evidence.
- Generate, preview, export, and review reports.
- Provide user management, organisation settings, alert thresholds, profile editing, authentication screens, and password reset flow.
- Display the floating operational alert center and AI assistant.

## Technology Stack

- React 19
- Vite
- React Router
- Redux Toolkit
- Leaflet
- Socket.IO client
- Lucide React icons
- jsPDF and jspdf-autotable
- docx
- xlsx
- Vanta and Three.js visual background support
- Oxlint

## Folder Structure

```text
FE/
  public/                 Static public assets
  src/
    assets/               Images and visual assets
    components/           Shared UI, layouts, maps, visual components
    data/                 Local support data
    features/             Feature-level auth and state logic
    hooks/                Shared React hooks
    pages/                Main application modules
    routes/               Route definitions and guards
    services/             API client, feedback bus, realtime client
    store/                Redux store setup
    utils/                Shared frontend helpers
    App.jsx               App shell
    main.jsx              React entrypoint
    styles.css            Global application styling
```

## Prerequisites

- Node.js 20 or later
- npm
- Running DroneOps backend API

## Environment Setup

Create `.env` from `.env-sample`:

```bash
cp .env-sample .env
```

Required:

```env
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

Production example:

```env
VITE_API_BASE_URL=https://your-backend-domain/api/v1
```

Optional public frontend keys:

```env
VITE_GOOGLE_CLIENT_ID=
VITE_MAPBOX_TOKEN=
```

These are public browser variables. They must be restricted at the provider dashboard level where possible. For example, Mapbox and Google OAuth credentials should be limited to approved domains.

## Installation

```bash
npm install
```

## Running Locally

```bash
npm run dev
```

The frontend usually runs on:

```text
http://localhost:5173
```

Make sure the backend `CLIENT_ORIGIN` includes the local frontend origin.

## Production Build

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Available Scripts

```bash
npm run dev       Start local Vite dev server
npm run build     Build production assets
npm run lint      Run Oxlint
npm run preview   Preview production build locally
```

## Main Application Areas

- Dashboard: operational metrics, mission queue, fleet overview, and alert summaries.
- Telemetry and Geofences: live tracking, replay, drone history, geofence creation, and geofence inspection.
- Fleet: drone register, drone profiles, lifecycle, telemetry configuration, and maintenance linkage.
- Missions: mission table, mission creation wizard, route planning, assignment, risk assessment, approval, start, completion, and profile view.
- Maintenance: service schedule, maintenance records, completion, and drone release workflow.
- Pilots: pilot directory, credentials, licences, certification expiry, and mission history.
- Incidents: incident register, incident creation, profile review, evidence, and black-box telemetry.
- Reports: report generation, export, report profile, and operational summaries.
- Users: organisation user management and profile handling.
- Settings: organisation details, join code, alert thresholds, and catalog management.
- Notifications and Alerts: operational alert center, unread counts, and action links.
- AI Assistant: permission-aware operational assistant connected to backend tools.

## API Integration

All API calls are centralised through:

```text
src/services/apiClient.js
src/services/droneOpsApi.js
```

The API client handles:

- Base URL normalization
- Access token attachment
- HttpOnly refresh-token flow
- Session expiry handling
- Request feedback messages
- Activity refresh events
- Upload requests
- Duplicate GET request protection

## Deployment Notes

The frontend is designed for Vercel-style deployment:

- Set `VITE_API_BASE_URL` to the deployed backend `/api/v1` URL.
- Set optional public keys only when the corresponding feature is used.
- Deploy with `npm run build`.
- Confirm backend CORS includes the deployed frontend URL.
- Confirm password reset and email verification links use the deployed frontend URL from backend `CLIENT_PUBLIC_URL`.

## Post-Deployment Checklist

Verify these workflows after deployment:

- Login and logout.
- Signup and email verification.
- Password reset link opens the frontend reset page.
- Dashboard loads live backend data.
- Mission creation, route analysis, assignment, save, approval, and profile view.
- Fleet profile and drone lifecycle tabs.
- Telemetry live/replay and geofence map controls.
- Incident creation and evidence upload.
- Maintenance scheduling and completion.
- Reports generation and export.
- Alert center count, profile, open actions, and read behaviour.
- Theme switcher and responsive layouts.
- AI assistant availability and provider error handling.

## Client Handover Notes

The frontend is an operational interface and should remain aligned with backend validation rules. If backend mission, fleet, maintenance, telemetry, or permission logic changes, update the frontend eligibility messages and disabled states at the same time so users understand why an action is allowed or blocked.
