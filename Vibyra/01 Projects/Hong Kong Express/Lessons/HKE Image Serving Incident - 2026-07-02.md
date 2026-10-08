---
title: HKE Image Serving Incident - 2026-07-02
date: 2026-07-02
project: HKE
tags:
  - hke
  - incident
  - laravel
  - static-assets
  - prevention
aliases:
  - HKE images returned HTML
---

# HKE Image Serving Incident - 2026-07-02

## Summary

Menu images were not visible on the Hong Kong Express site even though every image request returned HTTP `200`.

The real fault was that the local PHP server was started with `public/index.php` as the router:

```powershell
php -S 0.0.0.0:8000 -t public public/index.php
```

That made image URLs such as `/images/menu-items/001-...png` return the Laravel HTML app instead of PNG bytes. The browser treated the request as completed, but image decoding failed, so each image had `naturalWidth: 0`.

## Evidence

- Image URL returned `200 OK`.
- Response header was wrong:

```text
Content-Type: text/html; charset=utf-8
```

- Response body started with:

```html
<!DOCTYPE html>
```

- Browser diagnosis showed:

```text
img.complete = true
img.naturalWidth = 0
img.naturalHeight = 0
```

After the fix, the same URL returned:

```text
Content-Type: image/png
Content-Length: 2403329
```

and browser decoding showed:

```text
naturalWidth = 1254
naturalHeight = 1254
```

## Root Cause

The PHP built-in server was being used with the wrong router file. `public/index.php` is Laravel's front controller, not a static-file-aware router for PHP's built-in server.

When used as the built-in server router, static asset requests were not allowed to short-circuit to the real files in `public/`. Laravel/Inertia returned the application shell HTML at image paths, which gave misleading `200` statuses.

## Fix

Added a static-file-aware development router:

```php
// public/dev-router.php
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$file = __DIR__.str_replace('/', DIRECTORY_SEPARATOR, rawurldecode($path));

if ($path !== '/' && is_file($file)) {
    return false;
}

require __DIR__.'/index.php';
```

Correct local server command:

```powershell
php -S 127.0.0.1:8000 -t public public/dev-router.php
```

## Repo Changes Made

- Added `public/dev-router.php`.
- Updated Electron startup in `electron/main.cjs` to use `public/dev-router.php`.
- Added `npm run serve:local`.
- Updated `composer dev` to use the static-file-aware router.
- Added `tests/Feature/PublicImageResponseTest.php`.
- Kept image URL normalization in `App\Support\ImageUrl` so public, storage, and app-absolute URLs stay stable.
- Updated `README.md` with the rule: do not run `php -S ... public/index.php`.

## Prevention Rule

> [!warning]
> Never serve this Laravel app locally with `public/index.php` as the PHP built-in server router. Use `public/dev-router.php` so static files are served as real files before Laravel handles app routes.

## Verification Checklist

- [x] `curl -I http://127.0.0.1:8000/images/menu-items/001-aromatic-crispy-duck-with-pancakes-hke-menu-warm-v2-1024.png` returns `Content-Type: image/png`.
- [x] First bytes of the response are PNG bytes, not `<!DOCTYPE html>`.
- [x] Browser image `naturalWidth` is greater than `0`.
- [x] `php artisan test tests\Feature\PublicImageResponseTest.php tests\Unit\ImageUrlTest.php` passes.
- [x] Electron restarts against the fixed local server.

## Related Files

- [[01 Projects/Hong Kong Express/Hong Kong Express|HKE]]
- `/home/ellis/Desktop/HKE/public/dev-router.php`
- `/home/ellis/Desktop/HKE/electron/main.cjs`
- `/home/ellis/Desktop/HKE/tests/Feature/PublicImageResponseTest.php`
- `/home/ellis/Desktop/HKE/app/Support/ImageUrl.php`
