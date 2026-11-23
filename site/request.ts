/* The request for the listings. index.html runs this module on its own, so
   the download starts while the app's other modules are still arriving
   instead of after they run. app.ts's loadData takes that first request and
   starts a new one for each retry. */

const TIMEOUT_MS = 15_000;

export type ListingsRequest = {
  response: Promise<Response>;
  controller: AbortController;
  timeout: number;
};

function request(): ListingsRequest {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  // One generated snapshot (scripts/build_site_data.mts), so a page load
  // cannot mix listings from two deploys. A preload link cannot ask the
  // browser to revalidate, so the request is made here.
  const response = fetch('data/site.json', {
    cache: 'no-cache',
    signal: controller.signal,
  });
  // loadData handles a failure once it takes the request; until then it is
  // not an unhandled rejection.
  response.catch(() => {});
  return { response, controller, timeout };
}

let started: ListingsRequest | null = request();

/* The request made when the page loaded, then a new one on each call. */
export function requestListings() {
  const next = started || request();
  started = null;
  return next;
}
