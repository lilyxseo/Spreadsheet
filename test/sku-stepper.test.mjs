import test from "node:test";
import assert from "node:assert/strict";
import { hasSkuSequence, stepSku } from "../assets/js/sku-stepper.mjs";

test("mengubah hanya angka terakhir dan mempertahankan padding", () => {
  assert.equal(stepSku("GN-210047", 10).value, "GN-210057");
  assert.equal(stepSku("GN-000100", -1).value, "GN-000099");
  assert.equal(stepSku("GN-000001", 1).value, "GN-000002");
});

test("menolak SKU tanpa nomor urut", () => {
  assert.equal(hasSkuSequence("GOTO-BLUE"), false);
  assert.deepEqual(stepSku("GOTO-BLUE", 1), { ok: false, reason: "missing-sequence", value: "GOTO-BLUE" });
});

test("menjaga batas minimum, panjang digit, dan presisi angka besar", () => {
  assert.equal(stepSku("GN-000000", -1).reason, "minimum");
  assert.equal(stepSku("GN-999999", 1).reason, "maximum");
  assert.equal(stepSku("SKU-999999999999999998", 1).value, "SKU-999999999999999999");
});
