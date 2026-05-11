# Cookie Banner CSS Selectors

CSS selectors for hiding common cookie consent banners via style injection.

## Selector List

```css
#cookie-banner,
#cookie-consent,
#cookie-notice,
#cookie-popup,
#cookiebar,
#cookies-banner,
#consent-banner,
#consent-popup,
#gdpr-banner,
#gdpr-consent,
#onetrust-banner-sdk,
#onetrust-consent-sdk,
#CybotCookiebotDialog,
#CybotCookiebotDialogBodyUnderlay,
#usercentrics-root,
.cookie-banner,
.cookie-consent,
.cookie-notice,
.cookie-popup,
.cookies-overlay,
.consent-banner,
.consent-popup,
.gdpr-banner,
.cc-banner,
.cc-window,
.js-cookie-consent,
[class*="cookie-banner"],
[class*="cookie-consent"],
[class*="cookie-notice"],
[class*="CookieConsent"],
[id*="cookie-banner"],
[id*="cookie-consent"],
[aria-label*="cookie"],
[aria-label*="Cookie"],
[aria-label*="consent"],
[data-testid*="cookie"],
[data-testid*="consent"],
.osano-cm-window,
.truste-consent-track,
#sp-cc,
.fc-consent-root,
.qc-cmp2-container,
.evidon-consent-button,
#notice-cookie-block,
#cookie-law-info-bar
{
  display: none !important;
  visibility: hidden !important;
}
```

## Usage

Inject this CSS via `page.add_style_tag()` in Playwright or the `css` param in ScreenshotOne API.
