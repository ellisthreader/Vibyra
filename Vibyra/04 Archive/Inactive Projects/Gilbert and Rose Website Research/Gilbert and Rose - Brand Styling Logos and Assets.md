---
title: Gilbert and Rose - Brand Styling Logos and Assets
date: 2026-07-11
tags:
  - website-research/design
  - brand-assets
  - gilbert-and-rose
related: "[[Gilbert and Rose Website Research]]"
---

# Gilbert and Rose - Brand Styling Logos and Assets

## Visual identity

| Element | Observed implementation |
| --- | --- |
| Primary dark | `#363636` charcoal; also used as browser theme colour |
| Primary accent | `#fff200` vivid yellow; nearby variants include `#faf400` and `#f3e700` |
| Neutrals | White, near-black `#1a1a1a`, light greys such as `#f3f4f6`, `#f7f7f7`, borders around `#e5e7eb` |
| Typography | Google Font **Rubik**, weights 300–900 including italics; **Square Peg** is also asynchronously loaded for script-style accents |
| UI character | Bold/uppercase headings, strong yellow CTAs, rounded cards and controls, shadows, large editorial photography and generous section spacing |
| Responsive approach | Utility-driven responsive layouts using Tailwind CSS 2.2.19 plus custom classes |

## Core logos

- [Primary SVG logo](https://gilbertandrose.co.uk/images/GandR-Logo-SVG.svg)
- [512px application logo](https://gilbertandrose.co.uk/images/GandR-Logo-png-512x512.png)
- [Alternative G&R logo](https://gilbertandrose.co.uk/images/gnrLogo.png)
- [Alternative site logo](https://gilbertandrose.co.uk/images/logo.png)
- [Niche Homes logo](https://gilbertandrose.co.uk/images/Niche-Logo.png)
- [Niche gateway graphic](https://gilbertandrose.co.uk/images/niche.png)
- [192px application icon](https://gilbertandrose.co.uk/images/GandR-Logo-png-192x192.png)

The web-app manifest identifies the product as **G&R Property Portal**, uses `#faf400` as its background colour and `#363636` as its theme colour, and references desktop/mobile application screenshots.

## Social profiles and social logos

Social actions use Font Awesome 6.4 icons rather than separate raster logo files.

- [Facebook](https://www.facebook.com/gilbertandroseestateagents/)
- [Instagram](https://www.instagram.com/gilbertnrosebenfleet/)
- [TikTok](https://www.tiktok.com/@gilbertnrose/)
- [YouTube](https://www.youtube.com/channel/UC4rRW_GzBdRT6bl7QT5QSEw/)
- [WhatsApp](https://wa.me/441702595225)
- [Six Years of Excellence video](https://www.youtube.com/watch?v=6BeyZrSXDLM)

LinkedIn advertising/tracking is installed, but a public LinkedIn profile URL was not found in the inspected navigation/footer HTML.

## Partner, portal and accreditation logos

- Rightmove
- Zoopla
- OnTheMarket
- The Property Ombudsman
- Trading Standards Institute Approved Code
- RightBiz
- BusinessesForSale
- Daltons Business
- Prime
- Bradleys Countrywide
- Fixflo
- Goodlord
- PayProp
- Rex
- mydeposits
- Inventory Hive

Common partner assets live under `https://gilbertandrose.co.uk/images/partners/`. Examples include `Rightmove.png`, `Zoopla-Logo.png`, `On-The-Market.png`, `The-Proprety-Ombudsman-Logo.png`, `tsi-Approved-Code.png`, `Rightbiz.png`, `Businessforsale.png`, `DB-Logo.png`, `FixFlo-Logo.png`, `GoodLord-Logo.png` and `PayProp-Logo.png`.

Footer accreditation artwork is stored as `footer-1.png` through `footer-4.png`. The linked evidence identifies Property Ombudsman, ICO and Propertymark certificates; `footer-3.png` is the remaining footer accreditation graphic. Commercial/business category SVGs include All, Office, Retail, Warehouse, Land, Workshop, Hotel/Guest House, Hairdresser/Barber, Coffee Shop and Restaurant/Takeaway.

## Photography and illustration families

- Sales: `sell1.png`–`sell6.png`, drone series, `drone2.png`, `matterport.png`, business-card and website mock-ups
- Lettings: `tenant-hero.jpg`, `Pic-1.png`, `Pic-5.png`, tenant FAQ and team imagery
- Landlords: `landlordhero.jpg`, `landlordservices.png`, Rex/Goodlord/Fixflo/PayProp/Inventory Hive interface graphics and compliance illustrations
- New homes: `New-Homes.jpg`, `Land-and-developments.jpg`, development logos and FAQ imagery
- Commercial/business: `commercial-hero.jpg`, `commercial-1.jpg`, `commercial-2.jpg`, coffee shop, beauty salon and chip shop photography
- Locations: dedicated Essex location photographs under `/images/locations/`
- Global: footer imagery, review animation GIF, office/shop photos and property imagery served from Rex CDN

Across the inspected core pages, approximately **350 unique linked image/document URLs** were visible, including current-listing thumbnails. This count excludes the full galleries across all 954 property URLs.

## Motion and interaction style

- AOS scroll reveals
- GSAP and ScrollTrigger sequences
- Swiper and Slick carousels
- Smooth Scrollbar
- Animated review/media blocks
- Property-image galleries and modals
- Mapbox maps
- Font Awesome icons
- Occasional celebratory effects through Party.js

## Design pattern summary

The design repeatedly alternates dark or photographic hero sections with bright white content blocks and yellow actions. Content is organised into editorial image/text pairs, metric cards, partner strips, listing carousels, FAQs and full-width valuation banners. On property pages, visual hierarchy prioritises photography first, then price/status/facts, description and conversion actions.

## Render-verified responsive specification

### Desktop

- Light-grey `#f3f4f6` page canvas with a centered content shell approximately 1,224px wide at a 1,440px viewport.
- Fixed rounded dark-gradient navigation card with the outlined yellow G&R monogram, uppercase links and a solid-yellow Login button.
- Sales hero is a wide rounded media panel. A dark review pill sits at top left; uppercase yellow eyebrow and very large white stacked headline sit over the image; the property-location search is a white rounded card with yellow submit button.
- Partner/accreditation marks form a horizontally spaced monochrome strip below the hero.
- Team page uses centered title, two rows of rounded department-filter pills and a three-column card grid. Cards use large 4:3 portraits, white captions, bold names, grey job titles, subtle shadow and arrow affordance.
- Property detail places address/type at upper left, status/price at upper right, then a nearly full-shell rounded hero image.
- A circular live-chat control is fixed near the lower-right corner.

### Mobile

- Charcoal top bar with compact G&R monogram and hamburger; desktop links disappear.
- A full-width yellow “Get your free instant valuation today” strip sits directly beneath navigation.
- Main content uses approximately 12px outer gutters.
- Sales hero becomes a tall rounded portrait panel. Review pill, centered yellow eyebrow, centered stacked white headline and search card overlay the media.
- Partner strip reduces the number of simultaneously visible logos.
- Media/cards become single-column and retain rounded corners.

### Global shell behaviour

- Main page content has rounded lower corners and a large bottom margin above a fixed charcoal footer, producing a layered reveal effect.
- Desktop navigation hides while scrolling down and returns while scrolling upward; this behaviour is disabled on mobile.
- Reduced-motion CSS collapses transition and animation duration to near-zero.
