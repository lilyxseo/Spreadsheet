import { onRequestPatch as patch } from '../_cell-update.js';

const FIELD_MAP={tanggal:'A',lokasi:'B',sku:'C',nama:'D',bulky:'E',retail:'F',aktualBulky:'G',aktualRetail:'H',catatan:'I'};
export async function onRequestPatch(ctx){return patch(ctx,{fieldMap:FIELD_MAP,sheetName:'Cycle Count'});}
