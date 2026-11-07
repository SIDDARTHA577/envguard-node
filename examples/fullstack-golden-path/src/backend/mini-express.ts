import http from 'node:http';

export interface Request {
  method: string;
  url: string;
  pathname: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: any;
  headers: http.IncomingHttpHeaders;
}

export interface Response {
  status: (code: number) => Response;
  json: (data: any) => void;
  sendStatus: (code: number) => void;
  setHeader: (name: string, value: string) => void;
  raw?: http.ServerResponse;
}

export type Handler = (req: Request, res: Response, next: (err?: any) => void) => void;
export type ErrorHandler = (err: any, req: Request, res: Response, next: (err?: any) => void) => void;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: Handler;
}

export class Router {
  private routes: Route[] = [];

  private addRoute(method: string, pathPattern: string, handler: Handler) {
    const paramNames: string[] = [];
    const regexStr = '^' + pathPattern.replace(/:([a-zA-Z0-9_]+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    }) + '$';

    this.routes.push({
      method: method.toUpperCase(),
      pattern: new RegExp(regexStr),
      paramNames,
      handler,
    });
  }

  get(path: string, handler: Handler) {
    this.addRoute('GET', path, handler);
  }

  post(path: string, handler: Handler) {
    this.addRoute('POST', path, handler);
  }

  patch(path: string, handler: Handler) {
    this.addRoute('PATCH', path, handler);
  }

  delete(path: string, handler: Handler) {
    this.addRoute('DELETE', path, handler);
  }

  match(method: string, pathname: string): { handler: Handler; params: Record<string, string> } | null {
    const upperMethod = method.toUpperCase();
    for (const route of this.routes) {
      if (route.method !== upperMethod) continue;
      const match = pathname.match(route.pattern);
      if (match) {
        const params: Record<string, string> = {};
        route.paramNames.forEach((name, i) => {
          params[name] = match[i + 1];
        });
        return { handler: route.handler, params };
      }
    }
    return null;
  }
}

export interface InjectOptions {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: any;
}

export interface InjectResult {
  status: number;
  headers: Record<string, string>;
  body: any;
  json: () => any;
  text: () => string;
}

export class App {
  private middlewares: Handler[] = [];
  private routers: { prefix: string; router: Router }[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private server: http.Server | null = null;

  use(prefixOrHandler: string | Handler | ErrorHandler, router?: Router) {
    if (typeof prefixOrHandler === 'string' && router) {
      this.routers.push({ prefix: prefixOrHandler, router });
    } else if (typeof prefixOrHandler === 'function') {
      if (prefixOrHandler.length === 4) {
        this.errorHandlers.push(prefixOrHandler as ErrorHandler);
      } else {
        this.middlewares.push(prefixOrHandler as Handler);
      }
    }
  }

  get(path: string, handler: Handler) {
    const r = new Router();
    r.get(path, handler);
    this.routers.push({ prefix: '', router: r });
  }

  async inject(options: InjectOptions): Promise<InjectResult> {
    return new Promise((resolve) => {
      const urlObj = new URL(options.url, 'http://localhost');
      const pathname = urlObj.pathname;
      const query: Record<string, string> = {};
      urlObj.searchParams.forEach((v, k) => {
        query[k] = v;
      });

      const req: Request = {
        method: (options.method || 'GET').toUpperCase(),
        url: options.url,
        pathname,
        params: {},
        query,
        body: options.body || null,
        headers: options.headers || {},
      };

      let statusCode = 200;
      const responseHeaders: Record<string, string> = {};
      let responseBody = '';

      const res: Response = {
        status(code: number) {
          statusCode = code;
          return res;
        },
        setHeader(name: string, value: string) {
          responseHeaders[name.toLowerCase()] = value;
        },
        sendStatus(code: number) {
          statusCode = code;
          resolve({
            status: statusCode,
            headers: responseHeaders,
            body: '',
            json: () => ({}),
            text: () => '',
          });
        },
        json(data: any) {
          responseHeaders['content-type'] = 'application/json';
          responseBody = JSON.stringify(data);
          resolve({
            status: statusCode,
            headers: responseHeaders,
            body: data,
            json: () => data,
            text: () => responseBody,
          });
        },
      };

      this.dispatch(req, res);
    });
  }

  private dispatch(req: Request, res: Response) {
    let middlewareIdx = 0;
    const next = (err?: any) => {
      if (err) {
        if (this.errorHandlers.length > 0) {
          this.errorHandlers[0](err, req, res, () => {});
        } else {
          res.status(500).json({ success: false, error: { message: err.message } });
        }
        return;
      }

      if (middlewareIdx < this.middlewares.length) {
        const mw = this.middlewares[middlewareIdx++];
        try {
          mw(req, res, next);
        } catch (mwErr) {
          next(mwErr);
        }
        return;
      }

      for (const entry of this.routers) {
        let subPath = req.pathname;
        if (entry.prefix) {
          if (!req.pathname.startsWith(entry.prefix)) continue;
          subPath = req.pathname.slice(entry.prefix.length) || '/';
        }

        const matched = entry.router.match(req.method, subPath);
        if (matched) {
          req.params = matched.params;
          try {
            matched.handler(req, res, next);
          } catch (rErr) {
            next(rErr);
          }
          return;
        }
      }

      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
    };

    next();
  }

  listen(port: number, callback?: () => void): http.Server {
    this.server = http.createServer(async (rawReq, rawRes) => {
      const urlObj = new URL(rawReq.url || '/', `http://${rawReq.headers.host || 'localhost'}`);
      const pathname = urlObj.pathname;
      const query: Record<string, string> = {};
      urlObj.searchParams.forEach((v, k) => {
        query[k] = v;
      });

      let body: any = null;
      if (['POST', 'PATCH', 'PUT'].includes(rawReq.method || '')) {
        const chunks: Buffer[] = [];
        for await (const chunk of rawReq) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        const rawBody = Buffer.concat(chunks).toString('utf8');
        if (rawBody.trim()) {
          try {
            body = JSON.parse(rawBody);
          } catch {
            body = rawBody;
          }
        }
      }

      const req: Request = {
        method: rawReq.method || 'GET',
        url: rawReq.url || '/',
        pathname,
        params: {},
        query,
        body,
        headers: rawReq.headers,
      };

      let statusCode = 200;
      const res: Response = {
        raw: rawRes,
        status(code: number) {
          statusCode = code;
          rawRes.statusCode = code;
          return res;
        },
        setHeader(name: string, value: string) {
          rawRes.setHeader(name, value);
        },
        sendStatus(code: number) {
          rawRes.statusCode = code;
          rawRes.end();
        },
        json(data: any) {
          rawRes.statusCode = statusCode;
          rawRes.setHeader('Content-Type', 'application/json');
          rawRes.end(JSON.stringify(data));
        },
      };

      this.dispatch(req, res);
    });

    return this.server.listen(port, callback);
  }
}

export function express() {
  return new App();
}

express.Router = () => new Router();
express.json = () => (_req: Request, _res: Response, next: (err?: any) => void) => next();

export default express;
