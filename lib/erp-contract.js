import {isDeepStrictEqual} from 'node:util';

export const ERP_SYSTEM='oracle_netsuite';

// Legacy names are accepted on input only. Never silently prefer one order over
// another when a request supplies both versions of an identity-bearing field.
export function readErpAlias(input,canonical,legacy){
  const hasCanonical=Object.hasOwn(input,canonical),hasLegacy=Object.hasOwn(input,legacy);
  if(hasCanonical&&hasLegacy&&!isDeepStrictEqual(input[canonical],input[legacy])){
    throw Error('Conflicting ERP order / QR aliases.');
  }
  return hasCanonical?input[canonical]:hasLegacy?input[legacy]:undefined;
}

export function assertErpSystem(input){
  if(Object.hasOwn(input,'erp_system')&&input.erp_system!==ERP_SYSTEM){
    throw Error('ERP system must be oracle_netsuite.');
  }
}
