# Action counts

The static site can POST fixed action names to the Cloudflare Zaraz HTTP Events API at `/_actions`. No SDK or page-load analytics request is added. No Pages Functions, Worker, cookies, visitor IDs, model/hardware choices, URLs or user content are sent. Requests omit credentials and referrers. Existing Cloudflare Web Analytics remains separate.

## Activation

1. In Cloudflare Zaraz, configure the [HTTP Events API](https://developers.cloudflare.com/zaraz/http-events-api/) endpoint as `/_actions`.
2. Keep automatic script injection, iframe injection, automatic pageviews, data layer compatibility and advanced monitoring **off**. Configure **no third-party tools**. Enable the privacy settings that trim IPs and user agents and remove query strings and external referrers. Stay on the free plan; do not enable a paid subscription.
3. Send one explicitly named QA event and verify it appears in Monitoring or the [Monitoring API](https://developers.cloudflare.com/zaraz/monitoring/monitoring-api/). A 200 response alone does not prove the counter was recorded. Confirm the homepage HTML contains no injected Zaraz script and the endpoint sets no cookies.
4. Only then set Cloudflare Pages production build variable `PUBLIC_ACTION_EVENTS=1` and rebuild. Unset it to disable collection. Until activation is verified, leave it unset: the site sends no action requests.

## Reading counts

Use Zaraz Monitoring for totals over the same date range. Events are:

| Event | Meaning |
| --- | --- |
| `fit_check` | Deliberate detector selection, context change or detection |
| `setup_open` | Click on an internal setup link |
| `install_click` | Click on the primary runtime install link in setup |
| `command_copy` | Clipboard write resolved successfully |
| `demo_load_started` / `demo_loaded` / `demo_failed` | Browser runtime load attempt / readiness / failure |
| `demo_succeeded` | A browser task returned completed metrics, not merely loaded weights |
| `setup_worked` / `setup_blocked` | Voluntary feedback click, not a verified installation |

Counts measure actions, not people. Repeated clicks/runs count again; ad blockers, privacy opt-outs and bots can affect totals. There is no session stitching or unique conversion funnel. Compare useful completed actions alongside search visits rather than treating requests as genuine users.

Local/preview origins, WebDriver, Do Not Track and Global Privacy Control are excluded. For manual production QA, enter with `?qa=1` or `#qa=1`; this latches a boolean in tab session storage across navigation. `qa=0` clears it. No QA flag or identifier is transmitted. A fresh tab without the flag resumes normal counting after activation.
