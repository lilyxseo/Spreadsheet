import { onRequestPatch as patch } from '../_cell-update.js';

const FIELD_MAP={tanggal:'A',from:'B',to:'C',sku:'D',nama:'E',stok_lokasi_awal:'F',stok_aktual:'G',keterangan:'H'};
export async function onRequestPatch(ctx){return patch(ctx,{fieldMap:FIELD_MAP,sheetName:'Movement'});}
