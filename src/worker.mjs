import { handleRequest } from './core/http.mjs';

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, {
      env,
      ctx,
      fetch: globalThis.fetch.bind(globalThis),
      signal: request.signal
    });
  }
};
