/**
 * Cloudflare Workers の fetch Request/Response を
 * Node.js の IncomingMessage/ServerResponse に変換するブリッジ
 */
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { Readable } from "node:stream";

/**
 * Workers の Request を Node.js の IncomingMessage に変換
 */
export function toNodeRequest(request: Request): IncomingMessage {
  const url = new URL(request.url);

  const socket = new Socket();

  const req = new IncomingMessage(socket);
  req.method = request.method;
  req.url = url.pathname + url.search;
  req.headers = {};

  request.headers.forEach((value, key) => {
    req.headers[key.toLowerCase()] = value;
  });

  // host ヘッダーを設定
  if (!req.headers.host) {
    req.headers.host = url.host;
  }

  // リクエストボディがある場合、ストリームに書き込む
  if (request.body) {
    const readable = Readable.from(readableStreamToAsyncIterable(request.body));
    readable.pipe(req as unknown as NodeJS.WritableStream);
    // IncomingMessage にデータをプッシュ
    (async () => {
      const reader = request.clone().body?.getReader();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            req.push(null);
            break;
          }
          req.push(Buffer.from(value));
        }
      } else {
        req.push(null);
      }
    })();
  } else {
    req.push(null);
  }

  return req;
}

async function* readableStreamToAsyncIterable(
  stream: ReadableStream<Uint8Array>
): AsyncIterableIterator<Uint8Array> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Node.js の ServerResponse からのレスポンスをキャプチャし、
 * Workers の Response に変換するPromiseを返す
 */
export function captureNodeResponse(
  req: IncomingMessage
): { res: ServerResponse; responsePromise: Promise<Response> } {
  const res = new ServerResponse(req);

  const responsePromise = new Promise<Response>((resolve) => {
    const chunks: Buffer[] = [];

    // write のオーバーライド
    const originalWrite = res.write.bind(res);
    res.write = function (
      chunk: any,
      encodingOrCallback?: BufferEncoding | ((error: Error | null | undefined) => void),
      callback?: (error: Error | null | undefined) => void
    ): boolean {
      if (typeof chunk === "string") {
        const encoding =
          typeof encodingOrCallback === "string" ? encodingOrCallback : "utf-8";
        chunks.push(Buffer.from(chunk, encoding));
      } else if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      } else if (chunk instanceof Uint8Array) {
        chunks.push(Buffer.from(chunk));
      }
      if (typeof encodingOrCallback === "function") {
        encodingOrCallback(null);
      } else if (typeof callback === "function") {
        callback(null);
      }
      return true;
    };

    // end のオーバーライド
    const originalEnd = res.end.bind(res);
    res.end = function (
      chunkOrCallback?: any,
      encodingOrCallback?: BufferEncoding | (() => void),
      callback?: () => void
    ): ServerResponse {
      if (chunkOrCallback && typeof chunkOrCallback !== "function") {
        if (typeof chunkOrCallback === "string") {
          const encoding =
            typeof encodingOrCallback === "string" ? encodingOrCallback : "utf-8";
          chunks.push(Buffer.from(chunkOrCallback, encoding));
        } else if (Buffer.isBuffer(chunkOrCallback)) {
          chunks.push(chunkOrCallback);
        } else if (chunkOrCallback instanceof Uint8Array) {
          chunks.push(Buffer.from(chunkOrCallback));
        }
      }

      const body = Buffer.concat(chunks);
      const headers = new Headers();

      const rawHeaders = res.getHeaders();
      for (const [key, value] of Object.entries(rawHeaders)) {
        if (value !== undefined) {
          if (Array.isArray(value)) {
            for (const v of value) {
              headers.append(key, v);
            }
          } else {
            headers.set(key, String(value));
          }
        }
      }

      const status = res.statusCode || 200;

      // 3xx リダイレクトなどボディ不要のステータスコード
      const hasBody = status !== 204 && status !== 304 && body.length > 0;

      resolve(
        new Response(hasBody ? body : null, {
          status,
          headers,
        })
      );

      if (typeof chunkOrCallback === "function") {
        chunkOrCallback();
      } else if (typeof encodingOrCallback === "function") {
        encodingOrCallback();
      } else if (typeof callback === "function") {
        callback();
      }

      return res;
    };
  });

  return { res, responsePromise };
}
