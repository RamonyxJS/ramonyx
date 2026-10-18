//! Web shim minimal untuk runtime (dijalankan sebagai script sebelum BOOTSTRAP).
//!
//! Cakupan (ADR-0027/0030/0031): `TextEncoder`/`TextDecoder` (UTF-8, mode stream), `URL`/
//! `URLSearchParams` (subset absolut+relatif), `Headers`/`Request`/`Response` (body streaming
//! via `ReadableStream`), `ReadableStream` minimal (termasuk `type: "bytes"` untuk scheduler
//! React), `fetch` (http:// saja, via `op_fetch`), `crypto.getRandomValues`/`randomUUID`
//! (via `op_random_bytes`), `setTimeout`/`clearTimeout` (`op_sleep`), dan `MessageChannel`.
//!
//! Semua global dipasang dengan pola `?? ` (tidak menimpa bila sudah ada) supaya dapat diganti
//! implementasi native/deno_web di masa depan.

pub const WEB_SHIM: &str = r#"
class RamonyxTextEncoder {
  encode(input) {
    const str = String(input ?? "");
    const bytes = [];
    for (let i = 0; i < str.length; i += 1) {
      let code = str.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
        const next = str.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
          i += 1;
        }
      }
      if (code < 0x80) {
        bytes.push(code);
      } else if (code < 0x800) {
        bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code < 0x10000) {
        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      } else {
        bytes.push(
          0xf0 | (code >> 18),
          0x80 | ((code >> 12) & 0x3f),
          0x80 | ((code >> 6) & 0x3f),
          0x80 | (code & 0x3f),
        );
      }
    }
    return new Uint8Array(bytes);
  }
}

class RamonyxTextDecoder {
  constructor(label) {
    this.encoding = String(label ?? "utf-8").toLowerCase();
    this.fatal = false;
    // Byte sisa dari urutan multibyte yang terpotong antar-chunk (mode stream).
    this._pending = new Uint8Array(0);
  }
  decode(input, options) {
    const stream = options?.stream === true;
    const incoming =
      input == null ? new Uint8Array(0) : input instanceof Uint8Array ? input : new Uint8Array(input);
    let bytes;
    if (this._pending.length > 0) {
      bytes = new Uint8Array(this._pending.length + incoming.length);
      bytes.set(this._pending, 0);
      bytes.set(incoming, this._pending.length);
      this._pending = new Uint8Array(0);
    } else {
      bytes = incoming;
    }
    let out = "";
    let i = 0;
    while (i < bytes.length) {
      const b0 = bytes[i];
      let code;
      let extra;
      if (b0 < 0x80) {
        code = b0;
        extra = 0;
      } else if ((b0 & 0xe0) === 0xc0) {
        code = b0 & 0x1f;
        extra = 1;
      } else if ((b0 & 0xf0) === 0xe0) {
        code = b0 & 0x0f;
        extra = 2;
      } else if ((b0 & 0xf8) === 0xf0) {
        code = b0 & 0x07;
        extra = 3;
      } else {
        out += "\ufffd";
        i += 1;
        continue;
      }
      if (i + extra >= bytes.length) {
        if (stream) {
          // Simpan sisa urutan yang belum lengkap untuk panggilan berikutnya.
          this._pending = bytes.slice(i);
        } else {
          out += "\ufffd";
        }
        break;
      }
      let valid = true;
      for (let k = 1; k <= extra; k += 1) {
        const b = bytes[i + k];
        if ((b & 0xc0) !== 0x80) {
          valid = false;
          break;
        }
        code = (code << 6) | (b & 0x3f);
      }
      if (!valid) {
        out += "\ufffd";
        i += 1;
        continue;
      }
      if (code > 0xffff) {
        code -= 0x10000;
        out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
      } else {
        out += String.fromCharCode(code);
      }
      i += extra + 1;
    }
    return out;
  }
}

class RamonyxURLSearchParams {
  constructor(init) {
    this._entries = [];
    if (typeof init === "string") {
      const query = init.startsWith("?") ? init.slice(1) : init;
      if (query.length > 0) {
        for (const pair of query.split("&")) {
          if (pair.length === 0) {
            continue;
          }
          const separators = pair.split("=");
          const rawKey = separators.shift() ?? "";
          const rawValue = separators.join("=");
          this._entries.push([
            decodeURIComponent(rawKey.replace(/\+/g, " ")),
            decodeURIComponent(rawValue.replace(/\+/g, " ")),
          ]);
        }
      }
    } else if (Array.isArray(init)) {
      for (const pair of init) {
        this._entries.push([String(pair[0]), String(pair[1])]);
      }
    } else if (init && typeof init === "object") {
      for (const key of Object.keys(init)) {
        this._entries.push([key, String(init[key])]);
      }
    }
  }
  get(name) {
    const found = this._entries.find((entry) => entry[0] === name);
    return found === undefined ? null : found[1];
  }
  getAll(name) {
    return this._entries.filter((entry) => entry[0] === name).map((entry) => entry[1]);
  }
  has(name) {
    return this._entries.some((entry) => entry[0] === name);
  }
  set(name, value) {
    this.delete(name);
    this._entries.push([String(name), String(value)]);
  }
  append(name, value) {
    this._entries.push([String(name), String(value)]);
  }
  delete(name) {
    this._entries = this._entries.filter((entry) => entry[0] !== name);
  }
  keys() {
    return this._entries.map((entry) => entry[0])[Symbol.iterator]();
  }
  entries() {
    return this._entries[Symbol.iterator]();
  }
  [Symbol.iterator]() {
    return this.entries();
  }
  toString() {
    return this._entries
      .map((entry) => encodeURIComponent(entry[0]) + "=" + encodeURIComponent(entry[1]))
      .join("&");
  }
}

function ramonyxParseUrl(input, base) {
  let href = String(input);
  if (base !== undefined) {
    const baseParts = ramonyxParseUrl(base);
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href)) {
      if (href.startsWith("//")) {
        href = baseParts.protocol + href;
      } else if (href.startsWith("/")) {
        href = baseParts.protocol + "//" + baseParts.host + href;
      } else {
        const directory = baseParts.pathname.endsWith("/")
          ? baseParts.pathname
          : baseParts.pathname.slice(0, baseParts.pathname.lastIndexOf("/") + 1);
        href = baseParts.origin + directory + href;
      }
    }
  }
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*:)(\/\/[^/?#]*)?([^?#]*)(\?[^#]*)?(#.*)?$/.exec(href);
  if (!match) {
    throw new TypeError("URL tidak valid: " + input);
  }
  const protocol = match[1].toLowerCase();
  const authority = match[2] ?? "";
  const host = authority.slice(2);
  let hostname = host;
  let port = "";
  const colon = host.lastIndexOf(":");
  if (colon >= 0 && /^\d*$/.test(host.slice(colon + 1))) {
    hostname = host.slice(0, colon);
    port = host.slice(colon + 1);
  }
  const pathname = match[3] && match[3].length > 0 ? match[3] : authority ? "/" : "";
  return {
    protocol,
    host,
    hostname,
    port,
    pathname,
    search: match[4] ?? "",
    hash: match[5] ?? "",
  };
}

class RamonyxURL {
  constructor(input, base) {
    const parts = ramonyxParseUrl(input, base);
    this.protocol = parts.protocol;
    this.host = parts.host;
    this.hostname = parts.hostname;
    this.port = parts.port;
    this.pathname = parts.pathname;
    this.search = parts.search;
    this.hash = parts.hash;
    this.origin = parts.host ? parts.protocol + "//" + parts.host : "null";
    this.searchParams = new RamonyxURLSearchParams(parts.search);
  }
  get href() {
    const query = this.searchParams.toString();
    return (
      (this.origin === "null" ? this.protocol : this.origin) +
      this.pathname +
      (query.length > 0 ? "?" + query : "") +
      this.hash
    );
  }
  toString() {
    return this.href;
  }
  toJSON() {
    return this.href;
  }
}

class RamonyxHeaders {
  constructor(init) {
    this._map = new Map();
    if (init instanceof RamonyxHeaders) {
      init.forEach((value, name) => this.append(name, value));
    } else if (Array.isArray(init)) {
      for (const pair of init) {
        this.append(pair[0], String(pair[1]));
      }
    } else if (init && typeof init === "object") {
      for (const name of Object.keys(init)) {
        this.append(name, String(init[name]));
      }
    }
  }
  _key(name) {
    return String(name).toLowerCase();
  }
  append(name, value) {
    const key = this._key(name);
    const existing = this._map.get(key);
    this._map.set(key, existing === undefined ? String(value) : existing + ", " + String(value));
  }
  set(name, value) {
    this._map.set(this._key(name), String(value));
  }
  get(name) {
    const value = this._map.get(this._key(name));
    return value === undefined ? null : value;
  }
  has(name) {
    return this._map.has(this._key(name));
  }
  delete(name) {
    this._map.delete(this._key(name));
  }
  forEach(callback) {
    for (const entry of this._map) {
      callback(entry[1], entry[0], this);
    }
  }
  entries() {
    return this._map.entries();
  }
  keys() {
    return this._map.keys();
  }
  values() {
    return this._map.values();
  }
  [Symbol.iterator]() {
    return this.entries();
  }
  getSetCookie() {
    const value = this._map.get("set-cookie");
    return value === undefined ? [] : value.split(", ");
  }
}

// --- ReadableStream minimal (ADR-0030) -------------------------------------------------
//
// Mendukung konstruksi dengan underlying source `{ start, pull, cancel }` —
// termasuk `new ReadableStream({ type: "bytes", pull })` yang dipakai scheduler
// React server — plus reader (`read`/`cancel`/`releaseLock`) dan `for await`.
class RamonyxReadableStream {
  constructor(source, strategy) {
    const underlying = source ?? {};
    const options = strategy ?? {};
    this._queue = [];
    this._queueBytes = 0;
    this._state = "readable"; // readable | closed | errored
    this._storedError = undefined;
    this._wakeups = [];
    this._pullInFlight = false;
    this._locked = false;
    this._highWaterMark =
      typeof options.highWaterMark === "number" ? options.highWaterMark : 1;
    this._pull = typeof underlying.pull === "function" ? underlying.pull.bind(underlying) : null;
    this._cancel =
      typeof underlying.cancel === "function" ? underlying.cancel.bind(underlying) : null;
    const self = this;
    this._controller = {
      get desiredSize() {
        return self._state === "readable" ? self._highWaterMark - self._queueBytes : null;
      },
      enqueue(chunk) {
        self._enqueue(chunk);
      },
      close() {
        self._close();
      },
      error(error) {
        self._error(error);
      },
      byobRequest: null,
    };
    try {
      const started = underlying.start?.(this._controller);
      if (started && typeof started.then === "function") {
        started.catch((error) => self._error(error));
      }
    } catch (error) {
      self._error(error);
    }
  }
  get locked() {
    return this._locked;
  }
  _enqueue(chunk) {
    if (this._state !== "readable") {
      return;
    }
    this._queue.push(chunk);
    this._queueBytes += chunk && typeof chunk.byteLength === "number" ? chunk.byteLength : 1;
    this._wake();
  }
  _close() {
    if (this._state !== "readable") {
      return;
    }
    this._state = "closed";
    this._wake();
  }
  _error(error) {
    if (this._state !== "readable") {
      return;
    }
    this._state = "errored";
    this._storedError = error;
    this._wake();
  }
  _wake() {
    const wakeups = this._wakeups;
    this._wakeups = [];
    for (const wake of wakeups) {
      wake();
    }
  }
  async _requestPull() {
    if (this._pull === null || this._state !== "readable" || this._pullInFlight) {
      return;
    }
    this._pullInFlight = true;
    try {
      await this._pull(this._controller);
    } catch (error) {
      this._error(error);
    } finally {
      this._pullInFlight = false;
    }
  }
  _shift() {
    if (this._queue.length > 0) {
      const value = this._queue.shift();
      this._queueBytes -= value && typeof value.byteLength === "number" ? value.byteLength : 1;
      return { kind: "chunk", value };
    }
    if (this._state === "closed") {
      return { kind: "done" };
    }
    if (this._state === "errored") {
      return { kind: "error", error: this._storedError };
    }
    return { kind: "wait" };
  }
  async _read() {
    for (;;) {
      const result = this._shift();
      if (result.kind === "chunk") {
        return { value: result.value, done: false };
      }
      if (result.kind === "done") {
        return { value: undefined, done: true };
      }
      if (result.kind === "error") {
        throw result.error;
      }
      const wake = new Promise((resolve) => this._wakeups.push(resolve));
      // Minta data ke underlying source; pull berikutnya dipicu oleh read berikutnya.
      this._requestPull();
      await wake;
    }
  }
  getReader() {
    const stream = this;
    this._locked = true;
    return {
      read: () => stream._read(),
      cancel: (reason) => stream.cancel(reason),
      releaseLock: () => {
        stream._locked = false;
      },
    };
  }
  async cancel(reason) {
    if (this._state === "readable") {
      this._state = "closed";
      this._wake();
      if (this._cancel !== null) {
        try {
          await this._cancel(reason);
        } catch {
          // error saat cancel tidak boleh menjatuhkan pemanggil
        }
      }
    }
  }
  [Symbol.asyncIterator]() {
    const stream = this;
    return {
      next: () => stream._read(),
      return: async () => {
        await stream.cancel();
        return { value: undefined, done: true };
      },
    };
  }
}

function ramonyxToBytes(body) {
  if (body instanceof Uint8Array) {
    return body;
  }
  if (body instanceof ArrayBuffer) {
    return new Uint8Array(body);
  }
  if (ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  }
  return new RamonyxTextEncoder().encode(String(body));
}

function ramonyxStreamFromBytes(bytes) {
  return new RamonyxReadableStream({
    start(controller) {
      if (bytes.byteLength > 0) {
        controller.enqueue(bytes);
      }
      controller.close();
    },
  });
}

async function ramonyxReadStreamText(stream) {
  if (stream === null) {
    return "";
  }
  const reader = stream.getReader();
  const decoder = new RamonyxTextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    text += typeof value === "string" ? value : decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

class RamonyxResponse {
  constructor(body, init) {
    const options = init ?? {};
    this.status = options.status ?? 200;
    this.statusText = options.statusText ?? "";
    this.ok = this.status >= 200 && this.status < 300;
    this.headers =
      options.headers instanceof RamonyxHeaders
        ? options.headers
        : new RamonyxHeaders(options.headers);
    this.url = options.url ?? "";
    this.type = "default";
    this.redirected = false;
    this.bodyUsed = false;
    this._bodyText = null;
    if (body instanceof RamonyxReadableStream) {
      this.body = body;
    } else if (body == null) {
      this._bodyText = "";
      this.body = ramonyxStreamFromBytes(new Uint8Array(0));
    } else if (typeof body === "string") {
      this._bodyText = body;
      this.body = ramonyxStreamFromBytes(new RamonyxTextEncoder().encode(body));
    } else {
      const bytes = ramonyxToBytes(body);
      this._bodyText = new RamonyxTextDecoder().decode(bytes);
      this.body = ramonyxStreamFromBytes(bytes);
    }
  }
  static json(data, init) {
    const response = new RamonyxResponse(JSON.stringify(data), init);
    if (!response.headers.has("content-type")) {
      response.headers.set("content-type", "application/json");
    }
    return response;
  }
  async text() {
    if (this._bodyText === null) {
      this._bodyText = await ramonyxReadStreamText(this.body);
    }
    this.bodyUsed = true;
    return this._bodyText;
  }
  async json() {
    return JSON.parse(await this.text());
  }
  clone() {
    if (this._bodyText === null) {
      throw new Error(
        "Response.clone() untuk body stream belum didukung runtime ini (ADR-0030)",
      );
    }
    const copy = new RamonyxResponse(this._bodyText, {
      status: this.status,
      statusText: this.statusText,
    });
    copy.headers = new RamonyxHeaders(this.headers);
    copy.url = this.url;
    return copy;
  }
}

class RamonyxRequest {
  constructor(input, init) {
    const options = init ?? {};
    if (input instanceof RamonyxRequest) {
      this.url = input.url;
      this.method = (options.method ?? input.method ?? "GET").toUpperCase();
      this.headers = new RamonyxHeaders(options.headers ?? input.headers);
      this.signal = options.signal ?? input.signal;
      if (options.body !== undefined) {
        this._bodyText =
          options.body == null ? null : new RamonyxTextDecoder().decode(ramonyxToBytes(options.body));
      } else {
        this._bodyText = input._bodyText;
      }
    } else {
      this.url = String(input);
      this.method = String(options.method ?? "GET").toUpperCase();
      this.headers = new RamonyxHeaders(options.headers);
      this.signal = options.signal ?? new RamonyxAbortSignal();
      const body = options.body ?? null;
      this._bodyText =
        body === null || body instanceof RamonyxReadableStream
          ? null
          : new RamonyxTextDecoder().decode(ramonyxToBytes(body));
    }
    this.bodyUsed = false;
    if (options.body instanceof RamonyxReadableStream) {
      this.body = options.body;
    } else if (this._bodyText === null) {
      // Body stream tidak dapat dibaca dua kali: salinan request (mis. middleware yang
      // mengganti header) meneruskan stream yang sama ke hilir (ADR-0035).
      this.body = input instanceof RamonyxRequest ? input.body : null;
    } else {
      this.body = ramonyxStreamFromBytes(new RamonyxTextEncoder().encode(this._bodyText));
    }
  }
  async text() {
    if (this._bodyText === null && this.body !== null) {
      this._bodyText = await ramonyxReadStreamText(this.body);
    }
    this.bodyUsed = true;
    return this._bodyText ?? "";
  }
  async json() {
    return JSON.parse(await this.text());
  }
  clone() {
    return new RamonyxRequest(this);
  }
}

globalThis.TextEncoder = globalThis.TextEncoder ?? RamonyxTextEncoder;
globalThis.TextDecoder = globalThis.TextDecoder ?? RamonyxTextDecoder;
globalThis.URL = globalThis.URL ?? RamonyxURL;
globalThis.URLSearchParams = globalThis.URLSearchParams ?? RamonyxURLSearchParams;
globalThis.Headers = globalThis.Headers ?? RamonyxHeaders;
globalThis.Response = globalThis.Response ?? RamonyxResponse;
globalThis.Request = globalThis.Request ?? RamonyxRequest;
globalThis.ReadableStream = globalThis.ReadableStream ?? RamonyxReadableStream;

// `fetch` minimal (ADR-0030): http:// saja, tanpa redirect otomatis; transport
// dibuffer di Rust (`op_fetch`) dengan batas ukuran + permission `--allow-net`.
globalThis.fetch = globalThis.fetch ?? (async function fetch(input, init) {
  const options = init ?? {};
  let url;
  let method;
  let headers;
  let body = "";
  if (input instanceof RamonyxRequest) {
    url = input.url;
    method = String(options.method ?? input.method ?? "GET").toUpperCase();
    headers =
      options.headers !== undefined
        ? new RamonyxHeaders(options.headers)
        : new RamonyxHeaders(input.headers);
    if (options.body !== undefined && options.body !== null) {
      body = new RamonyxTextDecoder().decode(ramonyxToBytes(options.body));
    } else if (input._bodyText !== null) {
      body = input._bodyText;
    }
  } else {
    url = input instanceof RamonyxURL ? input.href : String(input);
    method = String(options.method ?? "GET").toUpperCase();
    headers = new RamonyxHeaders(options.headers);
    if (options.body !== undefined && options.body !== null) {
      body = new RamonyxTextDecoder().decode(ramonyxToBytes(options.body));
    }
  }
  let reply;
  try {
    reply = await Deno.core.ops.op_fetch(method, url, [...headers.entries()], body);
  } catch (error) {
    throw new TypeError(
      "fetch failed: " + (error && error.message !== undefined ? error.message : String(error)),
    );
  }
  const response = new RamonyxResponse(reply.body, {
    status: reply.status,
    statusText: reply.status_text,
    headers: reply.headers,
  });
  response.url = reply.url;
  response.type = "basic";
  return response;
});

// `crypto` minimal (ADR-0031): `getRandomValues`/`randomUUID` dari OS via `op_random_bytes`.
// `crypto.subtle` sengaja tidak disediakan (belum didukung — jangan diklaim).
(() => {
  if (globalThis.crypto !== undefined) {
    return;
  }
  const shim = {
    getRandomValues(array) {
      if (!ArrayBuffer.isView(array)) {
        throw new TypeError("getRandomValues membutuhkan typed array");
      }
      const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      const filled = Deno.core.ops.op_random_bytes(bytes.length);
      bytes.set(filled);
      return array;
    },
    randomUUID() {
      const bytes = shim.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = [];
      for (const byte of bytes) {
        hex.push(byte.toString(16).padStart(2, "0"));
      }
      const value = hex.join("");
      return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
    },
  };
  globalThis.crypto = shim;
})();

(() => {
  const timers = new Map();
  let nextTimerId = 0;
  globalThis.setTimeout = (callback, ms, ...args) => {
    const id = ++nextTimerId;
    const entry = { cleared: false };
    timers.set(id, entry);
    (async () => {
      try {
        await Deno.core.ops.op_sleep(Math.max(0, Math.trunc(Number(ms) || 0)));
      } catch {
        // runtime berhenti sebelum timer selesai
      }
      timers.delete(id);
      if (entry.cleared) {
        return;
      }
      try {
        callback(...args);
      } catch (error) {
        Deno.core.ops.op_log_error("setTimeout callback error: " + error);
      }
    })();
    return id;
  };
  globalThis.clearTimeout = (id) => {
    const entry = timers.get(id);
    if (entry !== undefined) {
      entry.cleared = true;
    }
  };
})();

// MessageChannel minimal: cukup untuk pola scheduler React
// (`port1.onmessage = fn; port2.postMessage(null)`); pengiriman melalui
// microtask antrean, bukan macrotask.
(() => {
  class RamonyxMessagePort {
    constructor() {
      this._peer = null;
      this._listeners = new Set();
      this.onmessage = null;
    }
    addEventListener(type, listener) {
      if (type === "message" && typeof listener === "function") {
        this._listeners.add(listener);
      }
    }
    removeEventListener(type, listener) {
      if (type === "message") {
        this._listeners.delete(listener);
      }
    }
    start() {}
    close() {}
    postMessage(value) {
      const peer = this._peer;
      if (peer === null) {
        return;
      }
      const event = { type: "message", data: value, target: peer, ports: [] };
      queueMicrotask(() => {
        try {
          if (typeof peer.onmessage === "function") {
            peer.onmessage(event);
          }
          for (const listener of [...peer._listeners]) {
            listener.call(peer, event);
          }
        } catch (error) {
          Deno.core.ops.op_log_error("MessageChannel listener error: " + error);
        }
      });
    }
  }
  globalThis.MessageChannel = globalThis.MessageChannel ?? class {
    constructor() {
      this.port1 = new RamonyxMessagePort();
      this.port2 = new RamonyxMessagePort();
      this.port1._peer = this.port2;
      this.port2._peer = this.port1;
    }
  };
})();
"#;
