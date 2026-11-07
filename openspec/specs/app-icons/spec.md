# app-icons Specification

## Purpose
Defines how FlowLedger's existing brand mark appears in browser tabs, iOS home-screen shortcuts, and supported PWA installations, on any hostname.

## Requirements

### Requirement: Consistent icons derived from the in-app mark

Every app icon SHALL show the same mark as the in-app logo, and SHALL be served from root-relative paths with no hostname dependency.

#### Scenario: Browser tab
- **WHEN** a browser that does not use SVG favicons opens the app
- **THEN** a 32x32 raster favicon of the mark is available at `/favicon.ico`

#### Scenario: Any host
- **WHEN** the app is served from production or staging
- **THEN** the same icon and manifest URLs resolve to their real files with correct image and manifest content types

### Requirement: iOS home-screen icon

The app SHALL provide opaque, full-bleed PNGs at `/apple-touch-icon.png` (180x180) and `/apple-touch-icon-240x240.png` (240x240), and declare both in the HTML. A request for any other missing root-level icon path SHALL receive a 404, not the app shell.

#### Scenario: Add to home screen
- **WHEN** a user adds FlowLedger to the iOS home screen
- **THEN** the shortcut shows the FlowLedger mark instead of a generated letter

#### Scenario: iOS probes a missing icon path
- **WHEN** iOS requests `/apple-touch-icon-240x240-precomposed.png` or `/apple-touch-icon-precomposed.png`
- **THEN** the response is a 404, not the app shell's HTML

#### Scenario: Client routes still work
- **WHEN** a browser requests a client route such as `/login`
- **THEN** the response is the app shell with its icon declarations

#### Scenario: Opaque corners
- **WHEN** iOS applies its own corner mask to the icon
- **THEN** no transparent corner pixels exist that could render as black

### Requirement: PWA installation metadata

The app SHALL declare a web app manifest with the app name, standalone display, and 192x192, 512x512, and 512x512 maskable icons. The maskable icon SHALL keep the mark inside its safe zone. The app SHALL NOT add a service worker for this purpose.

#### Scenario: Manifest icons
- **WHEN** the manifest is evaluated
- **THEN** every listed icon resolves to a PNG with its declared dimensions

#### Scenario: Launching the installed app
- **WHEN** an installed app launches
- **THEN** it opens the login route, which sends a signed-in user straight into the app
