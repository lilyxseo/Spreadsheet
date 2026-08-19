/**
 * Mengubah hanya nomor urut yang berada tepat di akhir SKU.
 * BigInt digunakan agar SKU panjang tidak kehilangan presisi.
 */
export function stepSku(value, delta) {
  const sku = String(value ?? "");
  const match = sku.match(/(\d+)$/);
  if (!match) return { ok: false, reason: "missing-sequence", value: sku };

  const digits = match[1];
  const next = BigInt(digits) + BigInt(delta);
  if (next < 0n) return { ok: false, reason: "minimum", value: sku };

  const nextDigits = next.toString();
  if (nextDigits.length > digits.length) {
    return { ok: false, reason: "maximum", value: sku };
  }

  return {
    ok: true,
    reason: "",
    value: `${sku.slice(0, -digits.length)}${nextDigits.padStart(digits.length, "0")}`
  };
}

export function hasSkuSequence(value) {
  return /\d+$/.test(String(value ?? ""));
}
