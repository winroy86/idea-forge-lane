# Idea Forge Lane

## Project info

**URL**: Local deployment (see run instructions below)

## How can I edit this code?

There are several ways of editing your application.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will be reflected in your Git repository.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

## Environment configuration

Copy `.env.example` to `.env` and fill values only when you want cloud features:

```sh
cp .env.example .env
```

### Local-first mode (no env vars)

If `.env` is empty, the app still boots and all local features work (Rooms, Agents, Skills, Providers via browser storage).

### Cloud-enabled mode (Supabase)

Set both values to enable:

- Persona generation
- Document extraction for non-text formats
- Cloud chat/summarizer path via your configured providers

Required vars:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

The app header includes a **Capabilities** indicator showing which of these are enabled at runtime.

## Readiness audit (what can be tested without changing features)

Run this audit to quickly check whether key roadmap items are in place and identify gaps before manual QA:

```sh
npm run check:readiness
```

The script reports:
- implemented readiness signals (✅)
- missing/high-risk areas that still need work (⚠️)

It is read-only and does not disable or remove any functionality.

## Production smoke boot

Validate production boot locally:

```sh
npm run smoke:prod
```

This runs a production build and starts Vite preview.

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

