import type { Middleware } from "ramonyx";

const requestLogger: Middleware = async (context, next) => {
  const started = performance.now();
  const response = await next();
  context.log.info("request", {
    method: context.request.method,
    path: new URL(context.request.url).pathname,
    status: response.status,
    ms: Math.round(performance.now() - started),
  });
  return response;
};

export default [requestLogger] satisfies Middleware[];
