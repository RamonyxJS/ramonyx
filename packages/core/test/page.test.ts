import assert from "node:assert/strict";
import { test } from "node:test";
import { formDataToObject } from "../src/index.ts";

test("formDataToObject: nilai tunggal → string, berulang → array, kosong → {}", () => {
  const form = new FormData();
  form.set("nama", "Rina");
  form.append("tag", "a");
  form.append("tag", "b");
  form.set("berkas", new File(["isi"], "catatan.txt", { type: "text/plain" }));

  const obj = formDataToObject(form);
  assert.equal(obj.nama, "Rina");
  assert.deepEqual(obj.tag, ["a", "b"]);
  assert.ok(obj.berkas instanceof File);

  assert.deepEqual(formDataToObject(new FormData()), {});
});
