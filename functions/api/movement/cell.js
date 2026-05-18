import { onRequestPatch as patch } from '../_cell-update.js';

const MOVEMENT_FIELD_COLUMNS = {
  tanggal: "A",
  from: "B",
  to: "C",
  sku: "D",
  namaBarang: "E",
  stokDiLokasiAwal: "F",
  stokAktual: "G"
};
export async function onRequestPatch(ctx){return patch(ctx,{fieldMap:MOVEMENT_FIELD_COLUMNS,sheetName:'Movement',spreadsheetIdEnv:'SHEET_ID_INVENTORY',invalidFieldMessage:'Invalid movement field',blockedFields:['sku','namaBarang']});}
