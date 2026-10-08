---
title: Gilbert and Rose - Property Data and Search
date: 2026-07-11
tags:
  - website-research/property-data
  - gilbert-and-rose
related: "[[Gilbert and Rose Website Research]]"
---

# Gilbert and Rose - Property Data and Search

## Inventory scale

- XML sitemap total: 969 URLs
- Core/system URLs in XML sitemap: 15
- Property-detail URLs: **954**
- The catalogue includes current and likely historical/under-offer properties; sitemap presence should not be treated as proof of current availability.
- Canonical full inventory: [live XML sitemap](https://gilbertandrose.co.uk/sitemap.xml)
- Human-readable inventory: [site map](https://gilbertandrose.co.uk/sitemap)

## Search segments and query patterns

| Segment | URL pattern |
| --- | --- |
| Residential sales | `/properties?sale_type=buy&listing_type=residential` |
| Residential lettings | `/properties?sale_type=rent&listing_type=residential` |
| New homes | `/properties?listing_type=residential&newhome=true` |
| Commercial | `/properties?listing_type=commercial` |
| Businesses | `/properties?listing_type=business` |

The property finder also exposes location, price, bedroom and category controls, and the site uses saved favourites/alerts for signed-in users.

## Property-page schema observed

- URL slug and page title
- Street/location and postcode sector
- Listing type: residential, commercial or business
- Property subtype, e.g. detached house
- Marketing status, e.g. Under Offer
- Price qualifier and amount, e.g. Guide Price
- Bedroom and bathroom count
- Floor area when available
- CRM property/listing ID
- Summary strapline
- Long-form description
- Main image and gallery thumbnails/full images
- Optional video tour
- Floor plan
- EPC chart
- Map/local area, train station and education sections
- Viewing form
- Telephone contact action
- Related properties
- Bottom-of-page instant valuation promotion

## Example verified record

[Eastwood Road, Leigh-on-Sea SS9](https://gilbertandrose.co.uk/properties/eastwood-road-leigh-on-sea-ss9):

- CRM property ID: 585162
- Detached house
- Under Offer
- Guide Price £575,000
- Four bedrooms and two bathrooms
- Gallery with 28+ additional photos
- Floor plan and EPC supplied
- Main media hosted under Rex account/listing CDN path `accounts/3562/listings/585162`

## Media hosting

Most listing photography, floor plans and EPC images are delivered by `uk-crm.cdns.rexsoftware.com/app/livestore/accounts/3562/listings/...`. Common renditions include `80x60`, `400x300`, `800x600` and original-size images. Core marketing images remain on the Gilbert & Rose domain.

## Data/rebuild implications

For a future implementation, treat property records, status, media, floor plans, EPCs and descriptions as CRM-owned external data. Import through a validated adapter, retain the CRM identifier, normalise listing types/statuses, preserve canonical slugs, proxy or allowlist external media hosts, and avoid coupling frontend components directly to Rex-specific payloads.

> [!warning] Personal data
> Login, registration, favourites, alerts, viewing requests and valuation submissions are private user data and were intentionally not accessed. Only public listing content and public routes were researched.
