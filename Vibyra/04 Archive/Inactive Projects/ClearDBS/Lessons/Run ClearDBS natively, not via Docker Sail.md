---
title: Run ClearDBS natively (PHP + SQLite), not via Docker/Sail
type: lesson
project: ClearDBS
date: 2026-07-06
status: active
tags:
  - lesson
  - project/cleardbs
---

# Run ClearDBS natively (PHP + SQLite), not via Docker/Sail

## Rule

Ignore the README's Docker/Sail instructions — run the site natively. `.env` uses `DB_CONNECTION=sqlite` (`database/database.sqlite`), so no MySQL container is needed.

## Evidence

Docker Desktop's engine was erroring (500) on 2026-06-28; native PHP 8.4 serve worked immediately and has been the working setup since. Starting Docker is slow and unnecessary.

## How to apply

From `C:\Users\Ellis\ClearDBS`:

```bash
php artisan serve --host=127.0.0.1 --port=8084   # app
npm run dev                                       # Vite
```

Open http://localhost:8084 — demo login `admin@cleardbs.test` / `password`.

## 2026-07-07 GitHub checkout notes

Docker Desktop still was not available: `docker ps` could not connect to `npipe:////./pipe/dockerDesktopLinuxEngine`. The latest GitHub checkout worked natively with SQLite.

For a fresh GitHub checkout such as `C:\Users\Ellis\Desktop\ClearDBS-GitHub`, bootstrap natively:

```bash
php composer.phar install --no-interaction
copy .env.example .env
php artisan key:generate --force
npm install
php artisan migrate:fresh --seed --force
php artisan serve --host=127.0.0.1 --port=8084
npm run dev -- --host 127.0.0.1 --port 5298
```

Use SQLite in `.env`: `DB_CONNECTION=sqlite`, `DB_DATABASE=database/database.sqlite`, blank `DB_USERNAME`, blank `DB_PASSWORD`.

## Prompt impact

Include in run/debug prompts: "Run natively with artisan serve on :8084 + Vite; do NOT start Docker/Sail even though the README says so."
