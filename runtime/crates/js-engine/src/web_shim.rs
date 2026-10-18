//! Web shim minimal untuk runtime (dijalankan sebagai script sebelum BOOTSTRAP).
//!
//! Cakupan (ADR-0027): `TextEncoder`/`TextDecoder` (UTF-8), `URL`/`URLSearchParams`
//! (subset absolut+relatif), `Headers`/`Request`/`Response` minimal (yang dipakai framework),
//! `setTimeout`/`clearTimeout` berbasis `op_sleep`, dan `MessageChannel` minimal
//! (scheduler React memakainya; pengiriman pesan antrean microtask).
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
  }
  decode(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input ?? []);
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
        out += "\ufffd";
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

class RamonyxResponse {
  constructor(body, init) {
    const options = init ?? {};
    this._body = body == null ? "" : typeof body === "string" ? body : String(body);
    this.status = options.status ?? 200;
    this.statusText = options.statusText ?? "";
    this.ok = this.status >= 200 && this.status < 300;
    this.headers = options.headers instanceof RamonyxHeaders ? options.headers : new RamonyxHeaders(options.headers);
    this.body = null; // ReadableStream belum ada (ADR-0027)
  }
  static json(data, init) {
    const response = new RamonyxResponse(JSON.stringify(data), init);
    if (!response.headers.has("content-type")) {
      response.headers.set("content-type", "application/json");
    }
    return response;
  }
  async text() {
    return this._body;
  }
  async json() {
    return JSON.parse(this._body);
  }
  clone() {
    const copy = new RamonyxResponse(this._body, { status: this.status, statusText: this.statusText });
    copy.headers = new RamonyxHeaders(this.headers);
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
      this._body = options.body == null ? input._body : String(options.body);
      this.signal = options.signal ?? input.signal;
    } else {
      this.url = String(input);
      this.method = String(options.method ?? "GET").toUpperCase();
      this.headers = new RamonyxHeaders(options.headers);
      this._body = options.body == null ? "" : String(options.body);
      this.signal = options.signal ?? new RamonyxAbortSignal();
    }
    this.body = null; // ReadableStream belum ada (ADR-0027)
  }
  async text() {
    return this._body;
  }
  async json() {
    return JSON.parse(this._body);
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
