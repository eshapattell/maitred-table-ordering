# MaîtreD

A collaborative table-ordering platform for restaurants. Diners scan a table QR code, join a shared live cart, and order together, with allergy-aware safety checks and an AI-assisted "surprise" dish mode.

**Status: in development.** The architecture and project structure are set up; features are being built phase by phase.

## Planned features
- QR join with no login or app install (nickname only)
- Real-time shared cart for everyone at a table, with per-person item attribution (Socket.io)
- Allergy-aware safety: unsafe dishes are filtered by rule-based code (not AI) and highlighted on kitchen tickets
- Kitchen dashboard with live order status (placed, preparing, ready, served)
- Bill split: equal, by item, or custom share
- Gemini-powered recommendations and a "Surprise Me" mode, restricted to a pre-validated safe dish pool
- Restaurant tools: menu management, table management, QR generation
- Multi-restaurant design (data scoped by `restaurantId`)

## Tech stack
MongoDB, Express, React (Vite), Node.js, Socket.io, Gemini API

## Key design rules
1. Allergy filtering is plain code (`backend/utils/allergyFilter.js`); AI never decides safety.
2. The server is the source of truth; clients send intents and the server validates and broadcasts.
3. Cart updates use atomic MongoDB operations.
4. Surprise dish identity is hidden at the API level until the order is served.

## Project structure
```
maitred/
  backend/   config, models, routes, controllers, middleware, sockets, utils, services, data
  frontend/  src/{Components, pages, routes, context, services, utils}
```

## Future scope
Online payments (Razorpay), subscription plans for restaurants, per-restaurant branding, wait-time estimates, owner analytics, "surprise a friend" mode.

## Setup (coming soon)
Copy `backend/.env.example` to `backend/.env` and fill in the values.
