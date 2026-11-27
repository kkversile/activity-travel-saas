# Voya mobile account navigation and experience animation

27 November 2026. Staging only. No commit, push, deployment or live database change.

## Requested behavior

- Mobile sign-in and sign-up forms now sit after all landing content, animated gallery and FAQs, immediately before the footer.
- Tapping Create account opens registration and jumps to the bottom form. Tapping Log in opens the bottom sign-in form. The selected section receives keyboard focus without automatically opening the mobile keyboard.
- Desktop account forms remain beside the introduction.
- Added two animated Voya photo ribbons with gentle vertical tile motion, using existing Voya imagery plus four licensed Kerala photographs. No Headout artwork, text, bundle code or styles were copied into the application.
- Includes Pause/Resume motion, hover pause, offscreen suspension, reduced-motion static layout and hidden loop copies for assistive technology.
- All colors continue to use saved admin theme tokens.

## REA investigation

Reference: https://hub.headout.com/ (resolved from the previously supplied Magic Listing reference).

Used the requested reverse-engineer-anything skill and REA CLI 6.10.1 with the bundled supported Node 24.22.3 runtime. No REA configuration, MCP registration or native-provider installation was needed.

REA statically inspected the public 62,024-byte page JavaScript artifact. Parent Evidence: `ev_51926885d8a2c0c2aba995cab96bc477d7e1cd066d6c05230806e3bb2b4992c7`. Complete evidence is retained locally under outputs/voya-experience-refresh-20261127/rea-motion-static-evidence. The public downloaded artifacts remain under tmp/voya-motion-reference-20261127 and are not application assets.

Observed in the Codex browser: continuous horizontal travel, vertical category offsets and a reduced-motion override. One reference track reports a 40-second CSS loop. REA static analysis is bounded to one selected shipped script and has partial/unknown dynamic relationships; it does not prove all runtime behavior or exact equivalence. Browser observations are retained separately in reference-motion-browser.json.

Voya's independent implementation uses 52/64-second desktop loops and 44/54-second mobile loops, different image windows, original copy and licensed local photographs. There is no new dependency for animation.

## Verification

- Full frontend suite: 461 passed, 0 failed, 144 reported suites.
- Production TypeScript/Vite build: PASS.
- Entry budget: PASS, 271,142 bytes raw / 83,059 bytes gzip; heavy routes deferred.
- Nine final Codex browser assertions: bottom registration jump, bottom sign-in jump, body/page containment at 390/768/1440px, reduced-motion layout, continuous motion, pause and resume.
- Existing backend/API verification remains 958 backend tests and 104 isolated staging API checks from the parent implementation; no backend runtime code changed in this follow-up.
- Protected staging finance and existing catalogue comparison rerun: all 12 finance and 12 catalogue table hashes/counts unchanged.
- An existing settlement-dialog focus assertion exposed an asynchronous timing race. The test now waits for the focus effect; no financial behavior or settlement implementation changed.

During layout checking, the inherited centered-grid alignment allowed the new ribbon's intrinsic width to stretch the guide. The guide now has an explicit contained width, and mobile grid columns use minmax(0,1fr). Final checks verify body width and form left/right position, as well as document width.

The generic browser viewport capability stopped targeting the staging tab after a reference tab was opened. Tab-scoped CDP emulation inside the Codex browser was used for the final 390/768/1440 checks. Both emulation and viewport overrides were cleared afterward. The staging tab and user-owned browser tabs were left open.

## New photographs

- Kathakali at Nishagandhi dance festival 2024 (266), Shagil Kannur, CC BY-SA 3.0.
- Periyar lake, Kerala, India (bird photograph), Abhirami.c, CC BY-SA 4.0.
- Varkala Cliff by KS, Krissubh, CC BY-SA 4.0.
- En Ooru — Chembra Peak View, Ingo Mehling, CC BY-SA 4.0.

Original source/license links appear in the gallery's Photo credits disclosure and in the new motion/credits.json asset manifest. The existing Munnar, Alleppey and Kochi credits are also repeated there; the coastal image reuses the existing Voya asset.

## Review

Open http://127.0.0.1:3074/. Scroll to “An experience for every kind of day” to view the two ribbons and try Pause/Resume. On mobile, tap the header's Create account button: registration should appear at the bottom with its heading about 20px below the viewport top. Tap Log in to verify the same behavior for sign-in.

Evidence: mobile-motion-tests.json, mobile-motion-build.log, mobile-motion-budget.log, voya-motion-browser-checks.json, voya-experience-animation-full.jpg and verification-summary.json in outputs/voya-experience-refresh-20261127.


## Latest client refinement: pause button removed

Removed the visible Pause/Resume motion control at the client’s request. Continuous animation, hover pause, offscreen suspension and reduced-motion static rendering remain. Updated the existing ribbon tests to remove the obsolete manual-control expectation. Focused ribbon/account/login tests and the production build passed; the Codex browser confirmed zero ribbon buttons and continuing movement. No push, deployment or live data change. See remove-pause-tests.log, remove-pause-build.log and remove-pause-browser.json in the evidence directory.
