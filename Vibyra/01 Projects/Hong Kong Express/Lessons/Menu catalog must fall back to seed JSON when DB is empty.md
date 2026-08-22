---
title: Menu catalog must fall back to seed JSON when DB is empty
date: 2026-07-02
tags:
  - project/hong-kong-express
  - lessons/menu-catalog
status: fixed
related:
  - "[[01 Projects/Hong Kong Express/Hong Kong Express]]"
---

# Menu catalog must fall back to seed JSON when DB is empty

> [!bug] Failure mode
> The public menu showed "No dishes found" because the local SQLite database had `0` restaurants, `0` categories, and `0` menu items. The menu UI was organised correctly, but `MenuCatalogService` had no database rows to send to React.

## Permanent Fix

`app/Services/MenuCatalogService.php` now treats `database/seeders/data/restaurants.json` as the fallback catalog whenever no active database restaurant exists.

The fallback path:

- resolves the seeded restaurant by slug, or uses the first seeded restaurant
- flattens organised seed categories into the same `MenuFeedItem` shape used by the React menu
- normalizes image paths through `ImageUrl::normalize`
- preserves options, prices, categories, descriptions, and basic tags
- supports `/menu/items` pagination from the seed data
- supplies checkout item data as well, so basket images/details still resolve on `/checkout`

## Files Changed

- `app/Services/MenuCatalogService.php`
- `tests/Feature/MenuCatalogFallbackTest.php`

## Verification

- `php -l app/Services/MenuCatalogService.php` passed.
- `php artisan test tests/Feature/MenuCatalogFallbackTest.php tests/Unit/ImageUrlTest.php tests/Feature/PublicImageResponseTest.php` passed.
- `buildHomePayload(null)` returned `179` initial dishes while the DB was empty.
- `GET http://127.0.0.1:8000/menu` returned `200`.
- `GET http://127.0.0.1:8000/menu/items` returned seeded dishes.
- `GET http://127.0.0.1:8000/checkout` returned `200`.

## Follow-Up

- [ ] If production should never use seed fallback, add an environment guard or alert before deploy.
- [ ] When reseeding local dev, confirm both database rows and seed JSON stay aligned.

## Related

- [[01 Projects/Hong Kong Express/Hong Kong Express]]
- [[01 Projects/Hong Kong Express/Lessons/Menu image assets must be synced to live DB]]
