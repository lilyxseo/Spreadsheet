import { onRequestPatch as patch } from '../_cell-update.js';

const FIELD_MAP={tanggal:'A',lokasi:'B',sku:'C',nama:'D',stok:'E',aktual:'F',catatan:'G'};
export async function onRequestPatch(ctx){return patch(ctx,{fieldMap:FIELD_MAP,sheetName:'Cycle Count'});}
