# KisanSathi - Manual Test Plan

This document contains comprehensive end-to-end manual test cases for the **KisanSathi - Smart Crop Advisory Assistant** application. It verifies functional correctness, agronomic calculation accuracy, input validation, accessibility, mobile responsiveness, error recovery, and security hardening.

| ID | Area | Steps | Expected result | Actual result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |

## 1. Landing Page & Global Navigation

| ID | Area | Steps | Expected result | Actual result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| TC-01 | Home Page | 1. Open browser and navigate to `http://localhost:5000/`.<br>2. Observe hero section, feature cards, and quick advisory section. | Page loads without console errors. Hero displays clear headline, subtitle, quick action buttons, and feature cards with responsive layout. | | |
| TC-02 | Home Page | 1. Navigate to the "Quick Advisory" section.<br>2. Click on a recommended crop card (e.g., "Wheat - Varanasi"). | Form is auto-populated with selected crop parameters, background advisory is loaded, and user is directed to the advice or results view. | | |
| TC-03 | Header Navigation | 1. Click each navigation link in the header: "Home", "Get Advice", "Crop Library", "About".<br>2. Verify active link styling and URL hash updates. | Navigation transitions smoothly without full page reloads. Hash changes (`#home`, `#get-advice`, `#crop-library`, `#about`) and active tab highlights. | | |
| TC-04 | Footer Navigation | 1. Scroll to the footer.<br>2. Click on footer quick links ("Get Advisory", "Crop Library", "About Us"). | Smoothly scrolls to top and navigates to the corresponding page view. Backend online indicator dot shows green "Online" state. | | |

## 2. Theme Persistence

| ID | Area | Steps | Expected result | Actual result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| TC-05 | Dark Mode Toggle | 1. Click the theme toggle icon (Sun/Moon) in the header.<br>2. Inspect `<html>` tag class attribute. | Page switches seamlessly between light and dark themes. The `dark` class is added/removed on `<html>`, and all surface colors invert with high contrast. | | |
| TC-06 | Theme Persistence | 1. Toggle theme to Dark mode.<br>2. Reload the page in the browser. | Dark mode persists across reload without flicker. LocalStorage key `kisansathi-theme` stores `"dark"`. | | |

## 3. Advisory Form Validation Edge Cases

| ID | Area | Steps | Expected result | Actual result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| TC-07 | Empty Required Fields | 1. Navigate to "Get Advice".<br>2. Clear the "District" input field.<br>3. Click "Generate Advisory". | Form submission is halted client-side. District input receives focus, displays red border, and shows error message: "District is required". | | |
| TC-08 | Negative Land Size | 1. Navigate to "Get Advice".<br>2. Enter `-2.5` in "Land Size" input.<br>3. Click "Generate Advisory". | Client validation triggers `aria-invalid="true"`. Error message displays: "Land size must be a positive number up to 10,000". Form is not sent. | | |
| TC-09 | Zero Land Size | 1. Enter `0` in "Land Size".<br>2. Click "Generate Advisory". | Client rejects zero value with error message: "Land size must be a positive number up to 10,000". | | |
| TC-10 | Excessively Large Land Size | 1. Enter `10001` or `99999` in "Land Size".<br>2. Click "Generate Advisory". | Validation rejects input exceeding 10,000 max threshold with clear inline error message. | | |
| TC-11 | Character Limit on District | 1. In "District" field, attempt to type or paste a string exceeding 100 characters. | HTML `maxLength="100"` prevents typing beyond 100 characters. No buffer overflow or visual break. | | |

## 4. Advisory Generation Across Crops & Agronomic Logic

| ID | Area | Steps | Expected result | Actual result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| TC-12 | Crop 1: Wheat Advisory | 1. Select Crop: Wheat, Season: Rabi, Soil: Loamy, State: Uttar Pradesh, District: Varanasi, Land Size: 2 Acres, Water: Canal.<br>2. Click "Generate Advisory". | Advisory generates successfully (HTTP 200). Returns tailored fertilizer schedule (Urea, DAP, MOP), irrigation stages (CRI, tillering), and harvest guide. | | |
| TC-13 | Crop 2: Rice Advisory | 1. Select Crop: Rice (Paddy), Season: Kharif, Soil: Clayey, State: Punjab, District: Ludhiana, Land Size: 5 Acres, Water: Tube Well.<br>2. Submit form. | Advisory generates with Kharif nursery management, water standing guidelines, zinc deficiency warnings, and stem borer control. | | |
| TC-14 | Crop 3: Potato Advisory | 1. Select Crop: Potato, Season: Rabi, Soil: Loamy, State: Uttar Pradesh, District: Agra, Land Size: 3 Acres, Water: Drip Irrigation.<br>2. Submit form. | Generates tuber cultivation advisory, earthing up timeline, Late Blight prevention fungicide advisory, and cold storage guidance. | | |
| TC-15 | Crop 4: Cotton Advisory | 1. Select Crop: Cotton, Season: Kharif, Soil: Black, State: Maharashtra, District: Nagpur, Land Size: 4 Acres, Water: Rainfed.<br>2. Submit form. | Generates advisory with square formation and boll development stages, Pink Bollworm pheromone trap advisory, and rainfed moisture conservation. | | |
| TC-16 | Crop 5: Maize Advisory | 1. Select Crop: Maize, Season: Kharif, Soil: Loamy, State: Bihar, District: Samastipur, Land Size: 1.5 Hectares, Water: Canal.<br>2. Submit form. | Generates tasseling and silking irrigation warnings, Fall Armyworm scouting guide, and potash top-dressing advisory. | | |
| TC-17 | Season Mismatch Warning | 1. Select Crop: Wheat (a Rabi crop).<br>2. Intentionally select Season: Kharif.<br>3. Submit the advisory form. | Results page generates with a prominent amber warning banner indicating wheat is ideally grown in Rabi season, detailing potential heat stress risks. | | |
| TC-18 | Soil Mismatch Warning | 1. Select Crop: Cotton (ideally Black/Loamy soil).<br>2. Select Soil Type: Sandy.<br>3. Submit the advisory form. | Results page displays a contextual amber warning banner recommending organic matter addition and soil suitability advisories. | | |
| TC-19 | Land Unit Conversion | 1. Generate advisory for Wheat with 2 Acres.<br>2. Re-run advisory with 0.809 Hectares.<br>3. Re-run advisory with 3.2 Bigha. | Fertilizer quantities (kg) and total expected yield scale proportionately according to the normalized acre conversion. | | |

## 5. Results Page Content & Agronomic Plan

| ID | Area | Steps | Expected result | Actual result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| TC-20 | Results Page Structure | 1. Review complete results page after generating advisory. | Page displays summary cards (Crop, Land, Expected Yield, Water Source), tabbed or stacked sections for Fertilizer, Irrigation, Pests, and Harvest. | | |
| TC-21 | Fertilizer Schedule | 1. Inspect the Fertilizer Management section.<br>2. Check Basal, Vegetative, and Reproductive dosage tables. | Shows exact fertilizer split (Urea, DAP, MOP, SSP), application timings (Days After Sowing), and application method (Broadcasting / Fertigation). | | |
| TC-22 | Irrigation Schedule | 1. Inspect the Irrigation Management section. | Displays critical growth stage irrigation requirements, interval in days, and water-saving tips tailored to the selected water source. | | |
| TC-23 | Pest & Disease Cards | 1. Inspect the Pest & Disease Management section.<br>2. Check symptoms, organic remedies, and chemical controls. | Each identified pest/disease card shows clear identification symptoms, preventive measures, biopesticides (Neem oil), and recommended chemical controls. | | |
| TC-24 | Harvest & Storage | 1. Inspect the Harvest & Storage section. | Displays harvest maturity signs, moisture content for storage, grading guidelines, and post-harvest handling steps. | | |
| TC-25 | Mandi Rates Table | 1. Inspect the APMC Mandi Market Prices section on Results page. | Displays current modal prices (Min, Max, Modal price per Quintal) for nearby APMC mandis with recent trend indicators (Up/Down/Stable). | | |

## 6. Crop Knowledge Library & Modals

| ID | Area | Steps | Expected result | Actual result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| TC-26 | Crop Search (English) | 1. Navigate to "Crop Library".<br>2. Type "mustard" in the search bar. | Library list dynamically filters to display Mustard crop card with scientific name and category badge. | | |
| TC-27 | Crop Category & Season Filters | 1. In Crop Library, click "Cereal" category chip.<br>2. Click "Rabi" season chip. | List updates instantly to show only cereal crops suitable for Rabi (e.g., Wheat, Barley). Resetting filters restores full 18-crop catalog. | | |
| TC-28 | Cultivation Guide Modal | 1. Click "View Cultivation Guide" on any crop card (e.g., Chickpea). | Modal opens showing detailed agronomic requirements, temperature ranges, seed rate, spacing, and recommended varieties. | | |
| TC-29 | Modal A11y & Keyboard Trap | 1. Open Cultivation Guide modal.<br>2. Press `Tab` repeatedly.<br>3. Press `Escape` key. | Focus is trapped inside modal elements. Pressing `Escape` closes the modal immediately and returns keyboard focus to the triggering card button. | | |
| TC-30 | Request New Crop Modal | 1. Click "Can't find your crop? Request Crop" in Crop Library.<br>2. Enter crop name, region, and submit. | Modal opens with accessible inputs, validates input, shows confirmation message on submit, and closes cleanly. | | |

## 7. AI Advisory Insights & Contextual Follow-up Chat

| ID | Area | Steps | Expected result | Actual result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| TC-31 | AI Explanation Generation | 1. On Results page, check the "AI Agronomist Explanation" box when backend has `GEMINI_API_KEY` configured. | AI explanation generates a tailored paragraph explaining why this fertilizer and irrigation plan was selected for the specific soil/crop combination. | | |
| TC-32 | AI Fallback Behavior | 1. Unset or invalidate `GEMINI_API_KEY` in `backend/.env`.<br>2. Restart backend and generate advisory. | Results page gracefully falls back to expert rule-based agronomic explanation without errors, crashes, or broken UI elements. | | |
| TC-33 | Follow-up Chat: Agronomic Query | 1. Scroll to the "Ask KisanSathi Assistant" follow-up chat box on Results page.<br>2. Type: "How should I apply the second dose of urea?" and click Send. | Chat sends request to `/api/chat` with advisory context. Assistant responds with precise agronomical instructions regarding top-dressing. | | |
| TC-34 | Follow-up Chat: Off-topic Query | 1. In follow-up chat, type: "Who won the cricket world cup?" and send. | Guardrail intercepts query and responds politely redirecting user to agricultural questions related to crops, soil, pests, or farming. | | |
| TC-35 | Follow-up Chat: Input Length Limit | 1. Attempt to enter or paste a message exceeding 500 characters into the chat input. | Input length is restricted by `maxLength={500}`. Server also validates and rejects queries > 500 characters with 400 Bad Request. | | |
| TC-36 | Rapid Chat Submissions (Rate Limit) | 1. Click send repeatedly in rapid succession (simulating automated spamming). | Submit button is disabled while request is pending. If rate limit is exceeded, user receives friendly 429 warning without application crash. | | |

## 8. Network Robustness, System State & Resiliency

| ID | Area | Steps | Expected result | Actual result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| TC-37 | Server Offline Banner | 1. Stop backend service.<br>2. Wait for 30-second health poll or attempt navigation to "Get Advice". | Red offline banner appears below header informing user: "Server is offline. Start the backend and refresh." Dismiss button works. | | |
| TC-38 | Automatic Online Recovery | 1. Restart backend service while banner is visible.<br>2. Wait up to 30 seconds for next poll cycle. | Health check detects backend availability (`/api/health`), offline banner automatically disappears, and footer status changes to green. | | |
| TC-39 | Slow Network / High Latency | 1. In Chrome DevTools Network tab, throttle connection to "Slow 3G".<br>2. Submit advisory form. | Loading spinner displays with polite `aria-live="polite"` indicator. Form does not submit duplicate requests on double-click. | | |
| TC-40 | Browser Back / Forward Navigation | 1. Navigate from Home -> Get Advice -> Results.<br>2. Click browser "Back" button.<br>3. Click browser "Forward" button. | State is preserved, URL hashes update correctly, and view transitions smoothly without losing entered form data. | | |
| TC-41 | Page Refresh on Results View | 1. On Results page (`#results`), press `F5` / reload. | Application reloads smoothly, restores stored advisory result from state/session, and renders results without crashing to a blank white screen. | | |

## 9. Accessibility, Mobile Viewport & Printing

| ID | Area | Steps | Expected result | Actual result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| TC-42 | Mobile Responsiveness (360px) | 1. Open Chrome DevTools Device Mode.<br>2. Set viewport width to `360px` (e.g., Galaxy S8 / Android small).<br>3. Browse Home, Get Advice, and Results pages. | No horizontal page scrolling or layout overflow. All cards, tables, and buttons adapt fluidly. Tables scroll horizontally inside container. | | |
| TC-43 | Mobile Touch Targets | 1. Inspect buttons, inputs, dropdowns, and modal close triggers on mobile viewport. | All interactive touch targets measure at least 44x44px bounding box for easy finger tapping. | | |
| TC-44 | Keyboard-Only Navigation | 1. Unplug or disable mouse.<br>2. Use `Tab`, `Shift+Tab`, `Enter`, and `Space` to navigate from header to form submission. | Focus indicators (ring-2 focus-visible) are prominently visible on every active element. Form dropdowns and buttons are fully operable via keyboard. | | |
| TC-45 | Screen Reader ARIA Attributes | 1. Inspect DOM with accessibility inspector.<br>2. Check form inputs, error messages, and loading spinners. | Inputs have associated `<label>` via `htmlFor`/`id`. Dynamic error alerts have `role="alert"` and `aria-describedby`. Live areas have `aria-live="polite"`. | | |
| TC-46 | Print / PDF Advisory Export | 1. On Results page, click "Print / Save PDF" or press `Ctrl+P`. | Print media stylesheet hides header, footer, chat widget, and navigation buttons. Advisory content formats cleanly for A4 paper export. | | |
