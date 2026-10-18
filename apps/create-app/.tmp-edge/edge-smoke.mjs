// Artefak edge dijalankan seperti platform edge: modul default { fetch }.
const mod = await import("./dist/edge/index.js");
const fetchHandler = mod.default.fetch;

const halaman = await fetchHandler(new Request("http://edge.local/"));
if (halaman.status !== 200) throw new Error("status halaman: " + halaman.status);
const html = await halaman.text();
if (!html.includes("Halo dari SSR Ramonyx")) throw new Error("SSR tidak jalan");
if (!html.includes("window.__RAMONYX__")) throw new Error("payload hydration hilang");
if (!html.includes("/assets/client-")) throw new Error("script klien ber-hash hilang");

const api = await fetchHandler(new Request("http://edge.local/api/halo/edge"));
if (api.status !== 200) throw new Error("status api: " + api.status);
const data = await api.json();
if (data.halo !== "edge") throw new Error("isi api: " + JSON.stringify(data));

const form = new FormData();
form.set("nama", "Edge");
const aksi = await fetchHandler(new Request("http://edge.local/", { method: "POST", body: form }));
if (aksi.status !== 200) throw new Error("status action: " + aksi.status);
if (!(await aksi.text()).includes("Halo, Edge!")) throw new Error("action tidak jalan");

const hilang = await fetchHandler(new Request("http://edge.local/tidak-ada"));
if (hilang.status !== 404) throw new Error("status 404: " + hilang.status);
if (!(await hilang.text()).includes("404")) throw new Error("404 bukan HTML");

console.log("EDGE SMOKE OK");
