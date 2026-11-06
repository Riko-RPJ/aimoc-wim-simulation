export function assessODOL(dimensions,grossKg,limits){
 const keys=['length_m','width_m','height_m'];
 const dimensionValid=keys.every(k=>Number.isFinite(dimensions?.[k])&&dimensions[k]>0);
 const massValid=Number.isFinite(grossKg)&&grossKg>0;
 const rows=keys.map(k=>({key:k,value:dimensionValid?dimensions[k]:null,limit:limits[k],excess:dimensionValid?Math.max(0,dimensions[k]-limits[k]):null}));
 rows.push({key:'gross_kg',value:massValid?grossKg:null,limit:limits.gross_kg,excess:massValid?Math.max(0,grossKg-limits.gross_kg):null});
 const over_dimension=dimensionValid?rows.slice(0,3).some(r=>r.excess>1e-8):null;
 const over_load=massValid?grossKg>limits.gross_kg:null;
 return {screening_only:true,over_dimension,over_load,status:over_dimension&&over_load?'ODOL':over_dimension?'OD':over_load?'OL':dimensionValid&&massValid?'WITHIN_EXAMPLE_LIMITS':'PENDING',rows};
}
