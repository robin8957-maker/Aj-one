# ALJWHARAH ONE — Complete Brand Asset Production Brief

Copy this entire document to the design agent.

You already have the approved logo. Do not invent a new mark, a new name, or a new visual style. Produce every production asset the product needs, at the required sizes and backgrounds, then deliver one ZIP.

Product name: ALJWHARAH ONE  
Short name: ONE  
Legal / file slug: aljwharah-one  
App id: one.aljwharah.app  
Languages that appear on assets: English and Arabic  

Prepare the identity for BOTH surfaces as one system:

1. Website — marketing site, login, docs, share cards, PWA install, browser tab
2. Application — workstation web app, desktop Tauri host, overlay, tray, installer

Same mark. Same theme. Same buttons. Same icon language. Do not make a “web logo” and a different “app logo”.

Do not decide product architecture. Do not write code. Do not change the logo concept. Export production-ready files only.

---

## 1. Delivery

Create one folder, then zip it:

```
aljwharah-one-brand-pack.zip
```

Inside:

```
aljwharah-one-brand-pack/
  00-README.txt
  01-source/
  02-logo/
  03-favicon-pwa/
  04-social/
  05-desktop-tauri/
  06-installer/
  07-vscode-lens/
  08-theme/
  09-ui-icons/
  10-buttons/
  11-wallpaper-empty/
  12-avatars-agents/
  13-docs-print/
  14-previews/
```

`00-README.txt` must list every file, pixel size, background, color mode, and intended drop path.

Also include `MANIFEST.csv` with columns:

`path,width,height,format,background,safe-zone,drop-into,notes`

---

## 2. Hard rules

1. Use the approved logo only. Do not redraw a different symbol.
2. Do not add slogans unless a file below asks for wordmark text.
3. Wordmark text when required: `ALJWHARAH ONE`
4. Arabic lockup when required: `الجوهرة ون`
5. Keep a safe zone of at least 12% of the shortest side around the mark.
6. The mark must stay recognizable at 16 px.
7. Do not put fine lines that disappear below 24 px. Provide a simplified 16/24 px version if needed.
8. Do not put the full wordmark inside icons smaller than 64 px.
9. Do not put photographs, mock UI, or screenshots inside logos.
10. Do not put the word Grok, OpenAI, Anthropic, or any other vendor on any asset.
11. Do not put secrets, QR codes, or URLs except where social cards need the product name.
12. Export crisp edges. No dirty matte. No color fringing on transparent PNGs.
13. SVG must be clean, outlined or with a small set of reusable colors, no embedded raster unless unavoidable.
14. PNG must be sRGB, 8-bit, no EXIF junk.
15. JPEG social cards must stay under 600 KB.
16. Provide both transparent and solid-background versions wherever listed.
17. Provide dark-surface and light-surface versions wherever listed.
18. Do not lock the product to one accent color in the filename. Use `on-dark` / `on-light` / `mono-pos` / `mono-neg`.
19. Include a one-page contact sheet PNG of the whole pack in `14-previews/`.

---

## 3. Backgrounds required for every logo lockup

For each lockup listed in section 4, export these backgrounds:

| Suffix | Background | Use |
|---|---|---|
| `transparent` | true alpha | web, overlay, UI |
| `on-dark` | solid near-black `#0A0C10` | dark app chrome |
| `on-light` | solid near-white `#F4F2EC` | light theme |
| `on-black` | `#000000` | stores / video |
| `on-white` | `#FFFFFF` | print / docs |
| `on-elevated` | `#141820` | dark panels |
| `mono-pos` | transparent, single dark ink | print / fax / stamp |
| `mono-neg` | transparent, single light ink | dark embroidery / invert |

If a lockup is already one-color, still produce `mono-pos` and `mono-neg`.

---

## 4. Logo lockups — `02-logo/`

Master source in `01-source/`:

- editable vector (SVG and PDF)
- layered source if you have one (AI / FIG / SVG)
- clear-space diagram
- minimum-size diagram

Export lockups:

### 4.1 App mark only (no type)

Files:

- `logo/mark/aljwharah-mark-{size}-{bg}.png`
- `logo/mark/aljwharah-mark-{bg}.svg`

Sizes in px: `16, 24, 32, 48, 64, 96, 128, 180, 192, 256, 512, 1024`

Also SVG at viewBox `0 0 64 64` and `0 0 256 256`.

### 4.2 Horizontal lockup (mark + ALJWHARAH ONE)

Sizes: `320x80, 640x160, 1280x320, 2560x640`

SVG required.

### 4.3 Stacked lockup (mark above name)

Sizes: `256x256, 512x512, 1024x1024`

### 4.4 Wordmark only (no symbol)

English: `ALJWHARAH ONE`  
Arabic: `الجوهرة ون`

Sizes: `640x160, 1280x320`

### 4.5 Bilingual lockup

English over Arabic or side by side. Keep both readable.

Size: `1600x600` and SVG.

### 4.6 Compact badge

For avatars and tiny chrome: mark in a rounded square.

Sizes: `32, 64, 128, 256`  
Corner radius: 22% of size.

### 4.7 Open Graph / in-product header strip

`2400x400` transparent and on-dark.

---

## 5. Favicon + PWA — `03-favicon-pwa/`

Drop targets in the real app:

- `public/favicon.svg`
- `public/icon-180.png`
- `public/icon-192.png`
- `public/icon-512.png`
- `public/__grok/icon-180.png` (same 180 as apple-touch)

Required files:

| File | Size | Background | Notes |
|---|---|---|---|
| `favicon.svg` | 32 viewBox, scalable | transparent | must read at 16 px tab size |
| `favicon-16.png` | 16x16 | transparent + on-dark + on-light | |
| `favicon-32.png` | 32x32 | transparent + on-dark + on-light | |
| `favicon-48.png` | 48x48 | transparent | |
| `apple-touch-icon-180.png` | 180x180 | opaque, no alpha | iOS adds mask; keep mark inset 12% |
| `icon-192.png` | 192x192 | opaque | PWA |
| `icon-512.png` | 512x512 | opaque | PWA / splash |
| `maskable-192.png` | 192x192 | opaque | safe zone inside 80% center |
| `maskable-512.png` | 512x512 | opaque | safe zone inside 80% center |
| `mstile-150.png` | 150x150 | opaque | Windows tile |
| `mstile-310.png` | 310x310 | opaque | |
| `safari-pinned-tab.svg` | monochrome | single-color silhouette | |

Also produce dark-theme and light-theme favicon PNG pairs.

`theme-color` reference swatches only (do not invent extra themes):

- dark chrome: `#0B0D11` and `#0A0C10`
- light chrome: `#D8DDE6` and `#F4F2EC`

---

## 6. Social / share cards — `04-social/`

JPEG preferred, under 600 KB. Also PNG master.

| File | Size | Safe text area | Required versions |
|---|---|---|---|
| `og-default.jpg` | 1200x630 | center 1000x500 | on-dark, on-light |
| `og-ar.jpg` | 1200x630 | same | Arabic product name |
| `og-en.jpg` | 1200x630 | same | English product name |
| `twitter-summary.jpg` | 1200x630 | same | |
| `linkedin.jpg` | 1200x627 | same | |
| `square-share-1080.jpg` | 1080x1080 | center 860 | |
| `story-1080x1920.jpg` | 1080x1920 | upper 1080x1200 | |

Content allowed on cards: mark, product name, one short line of product function.  
Do not write fake metrics, awards, or “AI powered” badges.

Suggested one-line function if you need type:  
`Governed intelligence workstation`

Arabic equivalent if needed:  
`محطة عمل ذكاء محكومة`

Do not add more copy.

---

## 7. Desktop / Tauri — `05-desktop-tauri/`

Windows host product name: ALJWHARAH ONE  
Window sizes in product: main 1280x800, overlay 560x240, frameless.

Required:

| File | Size | Format | Notes |
|---|---|---|---|
| `icon.ico` | multi | ICO | 16, 24, 32, 48, 64, 128, 256 in one file |
| `icon-16.png` … `icon-256.png` | listed | PNG | masters for the ICO |
| `icon.icns` | multi | ICNS | 16 through 1024 including @2x |
| `linux-256.png` | 256 | PNG | |
| `linux-512.png` | 512 | PNG | |
| `tray-light.png` | 32, 64 | PNG | menu-bar / tray on light OS chrome |
| `tray-dark.png` | 32, 64 | PNG | tray on dark OS chrome |
| `tray-template.png` | 32, 64 | PNG | macOS template: black + alpha only |
| `overlay-mark-64.png` | 64 | PNG transparent | commander overlay |
| `window-badge-24.png` | 24 | PNG | titlebar |

Keep tray icons extremely simple. If the full mark fails at 16–24 px, export a reduced tray glyph derived from the same mark.

---

## 8. Installer / store — `06-installer/`

Windows NSIS / MSI / MSIX. Unsigned packaging is a product fact; still deliver store-grade images.

| File | Size | Background |
|---|---|---|
| `installer-header.bmp` | 150x57 | opaque |
| `installer-welcome.bmp` | 164x314 | opaque |
| `msi-banner.bmp` | 493x58 | opaque |
| `msi-dialog.bmp` | 493x312 | opaque |
| `msix-store-logo.png` | 50x50, 150x150, 300x300 | opaque |
| `msix-wide-310x150.png` | 310x150 | opaque |
| `msix-splash-620x300.png` | 620x300 | opaque |
| `store-hero-1920x1080.png` | 1920x1080 | |
| `store-icon-300.png` | 300x300 | |

Do not put “signed” or certificate claims on artwork.

---

## 9. VS Code extension (Lens) — `07-vscode-lens/`

Extension display name: ALJWHARAH ONE Lens

| File | Size | Notes |
|---|---|---|
| `extension-icon-128.png` | 128x128 | Marketplace / sidebar |
| `extension-icon-256.png` | 256x256 | retina source |
| `activity-bar-dark.svg` | 24 viewBox | monochrome for dark UI |
| `activity-bar-light.svg` | 24 viewBox | monochrome for light UI |

---

## 10. Theme tokens sheet — `08-theme/`

Do not redesign the product theme. Produce a visual token board that matches the shipping CSS, plus logo-on-theme proofs.

Shipping surfaces to support:

1. Pearl dark  
2. Pearl light  

Token board PNG + SVG + `tokens.json`.

Include swatches exactly named:

Dark:

- `bg #0A0C10`
- `bg-elevated #141820`
- `bg-subtle #1B202A`
- `bg-hover #252B38`
- `fg #F2EFE8`
- `fg-muted #A4AAB6`
- `fg-subtle #717886`
- `accent #EADFCF`
- `accent-fg #0A0C10`
- `mind #C9D0DC`
- `ok #8FB392`
- `warn #C9AE7A`
- `danger #C98980`
- `info #8EA0B3`
- `gutter #0D1016`

Light:

- `bg #D8DDE6`
- `bg-elevated #F4F2EC`
- `bg-subtle #E6E3DA`
- `bg-hover #D8D4C9`
- `fg #15171C`
- `fg-muted #4E5560`
- `accent #1C212B`
- `accent-fg #F4F2EC`

Also export:

- `theme-proof-dark-1280x800.png` — mark + wordmark + 4 buttons on dark chrome
- `theme-proof-light-1280x800.png` — same on light chrome
- `theme-proof-overlay-560x240.png` — overlay panel
- `wallpaper-dark-1920x1080.png`
- `wallpaper-dark-2560x1440.png`
- `wallpaper-light-1920x1080.png`

Wallpaper may use quiet gradients only. No photography. No fake desktop icons.

---

## 11. Product UI icon set — `09-ui-icons/`

The app uses small chrome icons. Deliver a matching set derived from the approved mark language (stroke weight, corners, terminals). Do not invent a second mascot.

Format: SVG 24x24 viewBox, 1.5–2 px stroke unless the mark is filled.  
Also PNG 24, 48, 72 for each.

Required names (file slug = name):

Navigation / shell  
`start, search, settings, workstation, connections, control, hub, radar, fleet, memory, knowledge, resources, artifacts, approvals, automations, decisions, overlay, login`

Mission  
`mission, mission-running, mission-paused, mission-blocked, mission-failed, mission-complete, plan, verify, repair, checkpoint, rollback, worktree, sandbox, ledger, audit, proof`

Agents / roles  
`commander, architect, backend, frontend, database, tester, debugger, security, reviewer, red-team, verifier`

Actions  
`run, stop, pause, resume, panic, submit, approve, deny, connect, disconnect, probe, local-only, attach, copy, diff, terminal, browser, git, secret, model`

Status  
`ok, warn, danger, info, unknown, offline, rate-limit, denied, unavailable`

Language  
`lang-en, lang-ar`

Each icon needs:

- `outline` on-dark
- `outline` on-light
- `filled` optional only if outline fails at 16 px

Do not use another company’s icons. Original set only.

---

## 12. Buttons and controls — `10-buttons/`

The product already has four button variants. Produce a visual kit, not code:

Variants: `primary, ghost, line, danger`  
Themes: dark and light  
States: `default, hover, active, focus, disabled, loading, pressed`

Sizes:

- compact height 32
- default height 44 (`min-h-11`)
- large height 48

Widths to show: 120, 160, 240, full-row 560

Also produce:

- icon-only 32 and 44
- split button
- toggle (ONE / WORK)
- tab
- input + submit row
- checkbox / radio / switch
- toast / banner: ok, warn, danger, info

Export:

- `buttons-dark.png` 2000x wide contact sheet
- `buttons-light.png`
- individual SVGs for the four filled button backgrounds if they are graphic, otherwise a Figma/SVG component sheet is enough
- `focus-ring.svg`

Corner radius to respect from product CSS: 4 / 8 / 12 / 16 / 22 px.  
Do not invent a different radius system.

---

## 13. Wallpaper, empty states, desktop chrome — `11-wallpaper-empty/`

| File | Size |
|---|---|
| `desktop-wallpaper-dark.png` | 1920x1080, 2560x1440, 3840x2160 |
| `desktop-wallpaper-light.png` | same |
| `login-panel-bg.png` | 1440x900 |
| `empty-missions.svg` | 480x320 |
| `empty-artifacts.svg` | 480x320 |
| `empty-approvals.svg` | 480x320 |
| `spinner-64.svg` | 64 |
| `wordmark-header.svg` | 320x40 |

Empty states: quiet, no characters, no fake screenshots.

---

## 14. Agent avatars — `12-avatars-agents/`

Abstract avatars for roles. Same geometry language as the mark. No faces required.

Roles:  
`commander, architecture-lead, backend-engineer, frontend-engineer, database-engineer, test-engineer, security-reviewer, red-team, final-verifier, browser-verifier`

Sizes: 32, 64, 128  
Backgrounds: transparent, on-dark, on-light

---

## 15. Docs / print — `13-docs-print/`

| File | Size |
|---|---|
| `letterhead-a4.pdf` | A4 |
| `letterhead-ltr.pdf` | US Letter |
| `cover-a4.pdf` | A4 |
| `stamp-mark.pdf` | 40mm |
| `favicon-print-20mm.pdf` | 20mm |
| `email-header.png` | 1200x240 |

CMYK PDF + RGB PNG preview.

---

## 15. Website pack — `15-website/`

The public site and login page are a website, not only an app shell. Produce a full marketing + web identity kit.

Required pages to artboard (PNG + SVG where possible). Do not invent extra product claims.

| File | Size | Theme | Notes |
|---|---|---|---|
| `site-home-desktop.png` | 1440x900 | dark + light | hero, mark, primary CTA, no fake metrics |
| `site-home-mobile.png` | 390x844 | dark + light | |
| `site-login-desktop.png` | 1440x900 | dark + light | matches `/login` two-column layout |
| `site-login-mobile.png` | 390x844 | dark + light | |
| `site-docs-cover.png` | 1440x900 | | report / docs landing |
| `nav-header-dark.svg` | 1440x64 | transparent | mark + wordmark + 4 nav slots |
| `nav-header-light.svg` | 1440x64 | transparent | |
| `nav-header-mobile.svg` | 390x56 | | |
| `footer-dark.svg` | 1440x160 | | mark + legal name only |
| `footer-light.svg` | 1440x160 | | |
| `hero-mark-960.svg` | 960x960 | transparent | large website hero |
| `cookie-none` | — | — | do not design a cookie wall |

Website image slots:

| File | Size | Use |
|---|---|---|
| `og-website.jpg` | 1200x630 | site share; ≤600 KB |
| `og-login.jpg` | 1200x630 | | 
| `favicon` | already in §5 | same files for the site |
| `blog-cover-1600x900.jpg` | 1600x900 | optional docs cover |
| `email-header-1200x240.png` | 1200x240 | |

Website must ship EN and AR header wordmarks.

---

## 16. Web application chrome — `16-web-app/`

In-product website/app (workstation). Artboards only, same theme tokens.

| File | Size | Theme |
|---|---|---|
| `app-workstation-desktop.png` | 1440x900 | dark + light |
| `app-workstation-laptop.png` | 1280x800 | dark + light |
| `app-workstation-mobile.png` | 390x844 | dark + light |
| `app-work-room.png` | 1280x800 | |
| `app-overlay-560x240.png` | 560x240 | commander overlay |
| `app-login-inapp.png` | 1280x800 | |
| `app-settings.png` | 1280x800 | language + theme controls visible |
| `app-empty-missions.png` | 1280x800 | |

Also export isolated chrome pieces as SVG:

- sidebar 232 px wide
- top bar 48 px
- composer / submit row
- mission list row 32 px
- status pills: running, paused, blocked, failed, complete

These are visual masters for developers. Do not ship a second UI kit style.

---

## 17. PWA / install-to-homescreen — `17-pwa-install/`

The site and the web app install as a PWA. Same icons as §5, plus install tutorial art.

| File | Size | Notes |
|---|---|---|
| `splash-iphone-1290x2796.png` | 1290x2796 | opaque, mark centered, dark + light |
| `splash-iphone-1179x2556.png` | 1179x2556 | |
| `splash-iphone-1170x2532.png` | 1170x2532 | |
| `splash-ipad-2048x2732.png` | 2048x2732 | |
| `splash-android-1080x1920.png` | 1080x1920 | |
| `install-card-390x844.png` | 390x844 | “Add to Home Screen” instruction frame; no OS trademark misuse |
| `manifest-icon-192.png` | 192 | same as public/icon-192 |
| `manifest-icon-512.png` | 512 | same as public/icon-512 |
| `manifest-maskable-512.png` | 512 | 80% safe zone |

`theme_color` / `background_color` on the board:

- dark: `#0B0D11` / `#0A0C10`
- light: `#D8DDE6` / `#F4F2EC`

---

## 18. App drop map

Tell the implementer where files go. Put this in README.

```
WEBSITE + WEB APP
public/favicon.svg                         <- 03-favicon-pwa/favicon.svg
public/icon-180.png                        <- apple-touch 180
public/icon-192.png                        <- PWA 192
public/icon-512.png                        <- PWA 512
public/__grok/icon-180.png                 <- same 180
public/og.jpg                              <- 04-social/og-default.jpg or 15-website/og-website.jpg (≤600 KB)

IN-APP MARK
src/components/brand/mark.tsx              <- 02-logo SVG paths (developer ports)

DESKTOP APPLICATION
apps/desktop/src-tauri/icons/              <- 05-desktop-tauri ico/icns/png + tray

VS CODE
extensions/aljwharah-lens/icon.png         <- 07-vscode-lens 128
```

Do not edit application code. Only produce the files.

---

## 19. Quality checklist before zipping

- [ ] Mark is identical to the approved logo
- [ ] 16 px favicon is still the same product
- [ ] Transparent PNGs have clean alpha
- [ ] Dark and light theme proofs exist
- [ ] Arabic lockup is correctly shaped and right-to-left
- [ ] No third-party logos
- [ ] No placeholder “lorem” or “your brand here”
- [ ] og.jpg under 600 KB
- [ ] ICO contains 16 through 256
- [ ] Maskable icons keep the mark inside the 80% safe circle
- [ ] Tray 16–24 px is not a blur
- [ ] MANIFEST.csv lists every file
- [ ] Contact sheet in `14-previews/`
- [ ] Website home + login exist in dark and light, desktop and mobile
- [ ] Web app workstation artboards exist in dark and light
- [ ] PWA splash + maskable icons exist
- [ ] Desktop ICO/ICNS + tray exist
- [ ] Site and app use the same mark file, not two logos

---

## 18. What you must not do

- Do not pick a new logo.
- Do not write a brand story essay instead of files.
- Do not deliver only a moodboard.
- Do not deliver one PNG.
- Do not skip Arabic.
- Do not skip light theme.
- Do not skip tray / favicon / og / desktop icons.
- Do not claim Marketplace, signed installer, or store listing in the art.

---

## 21. Done means

One ZIP: `aljwharah-one-brand-pack.zip`  
Every folder above has real files, including website, web app, PWA, and desktop.  
README + MANIFEST.csv are accurate.  
A human can drop the files into the public website, the web app, PWA, Tauri icons, and the Lens extension without redrawing anything.
