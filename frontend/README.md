# SmartB Frontend

Next.js + TypeScript + ESLint frontend in FSD style.

## Stack
- Next.js (App Router)
- TypeScript
- ESLint
- JWT auth against backend

## Setup

1. Configure env:
```bash
cp .env.example .env.local
```

2. Install dependencies:
```bash
npm install
```

3. Run dev server:
```bash
npm run dev
```

Open: http://localhost:3000

## API contract expected from backend
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `GET /api/v1/users`
- `GET /api/v1/companies`
