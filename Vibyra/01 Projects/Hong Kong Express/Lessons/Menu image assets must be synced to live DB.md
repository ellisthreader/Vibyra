---
title: Menu image assets must be synced to live DB
date: 2026-07-01
project: HKE
tags:
  - hke
  - incident
  - menu-images
  - laravel
  - prevention
status: logged
---

# Menu image assets must be synced to live DB

> [!bug] Incident
> Starter images were generated and saved under `public/images/menu-items`, and `database/seeders/data/restaurants.json` was updated, but the menu page still showed images only for Aromatic Crispy Duck and Aromatic Crispy Lamb.

## Cause

The live page does not read `database/seeders/data/restaurants.json` directly. It reads menu data from the active SQLite database through `App\Services\MenuCatalogService`.

`MenuCatalogService::mapMenuItem()` returns:

```php
'imageUrl' => $item->thumbnail ?? $item->image_url,
```

That means the rendered image comes from the related `images` record first, then `menu_items.image_url`.

The new image paths had been added only to:

- `public/images/menu-items/*.png`
- `database/seeders/data/restaurants.json`

They had not been synced into:

- `menu_items.image_url`
- `images.path`

## Impact

The generated files existed on disk, but the customer-facing menu payload still had `NULL` image paths for starter items such as `Extra Pancakes`, `Shredded Roast Duck with Pancakes`, and `Gourmet Appetiser for Two`.

## Fix Applied

Synced all starter image paths from `database/seeders/data/restaurants.json` into the active SQLite database:

- updated `menu_items.image_url`
- updated or inserted related `images` rows with `type = menu-item`
- set `images.path` to the same public image path
- cleared Laravel caches with `php artisan optimize:clear`

Verification after the fix:

- `31` starter items
- `0` missing `menu_items.image_url`
- `0` missing `images.path`

## Prevention

When adding generated menu images, always complete all of these steps:

1. Save the final image file under `public/images/menu-items`.
2. Add or update `imageUrl` in `database/seeders/data/restaurants.json`.
3. Sync the same path into the live database.
4. Sync the related `images.path` row because thumbnails may override `menu_items.image_url`.
5. Verify the frontend data source, not just the file system.

Use this database check after future menu image imports:

```sql
select
  count(*) as total,
  sum(case when coalesce(mi.image_url, '') = '' then 1 else 0 end) as missing_item_image_url,
  sum(case when coalesce(i.path, '') = '' then 1 else 0 end) as missing_image_record_path
from menu_items mi
join menu_categories mc on mc.id = mi.menu_category_id
left join images i
  on i.imageable_id = mi.id
 and i.imageable_type = 'App\\Models\\MenuItem'
 and i.type = 'menu-item'
where mc.name = 'Starters';
```

## Rule

> [!important]
> Updating seed data is not enough for an already-seeded local app. For visible page changes, update the active database rows or rerun the seeder intentionally.
