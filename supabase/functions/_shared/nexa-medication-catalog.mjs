// Lexical review catalog. Entries never establish patient use, formulation or dose.
export const catalogVersion='2026-11-01-lexical-pilot-2';
export const catalogSources=Object.freeze({
  dcb:{label:'Anvisa DCB, IN 473/2026',url:'https://www.gov.br/anvisa/pt-br/assuntos/noticias-anvisa/2026/anvisa-publica-lista-atualizada-das-denominacoes-comuns-brasileiras-2',checkedAt:'2026-11-01'},
  novalgina:{label:'Rótulo Novalgina no portal de consultas da Anvisa',url:'https://consultas.anvisa.gov.br/api/consulta/medicamento/1/25351617747202347/rotulo/P/34730560?Authorization=Guest',checkedAt:'2026-11-01'}
});
const generic=name=>({id:name,names:[name],activeIngredient:name,source:'dcb',confidence:'lexical_candidate'});
export const medicines=Object.freeze([
  generic('omeprazol'),generic('losartana'),generic('metformina'),generic('paracetamol'),
  generic('amoxicilina'),generic('ibuprofeno'),generic('salbutamol'),generic('prednisona'),
  generic('atorvastatina'),generic('sinvastatina'),generic('enalapril'),generic('levotiroxina'),
  {id:'dipirona',names:['novalgina','dipirona'],activeIngredient:'dipirona',source:'novalgina',confidence:'verified_brand_relationship'},
  {id:'celestrat',names:['celestrat'],activeIngredient:null,source:null,confidence:'unverified_literal'}
]);
