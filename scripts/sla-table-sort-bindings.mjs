// Display ordering only. Preserve the reviewed calculations and chart rankings.
export const slaTableSortSetup = `
const serviceSort=createSlaTableSort(document,'serviceBody',[
 {type:'text',value:r=>r.name},
 {type:'number',value:r=>r.os},
 {type:'number',value:r=>r.os},
 {type:'number',value:r=>r.total},
 {type:'number',value:r=>r.revis},
 {type:'number',value:r=>r.logs},
 {type:'number',value:r=>r.sla}
],()=>renderServiceTable());
const techSort=createSlaTableSort(document,'techBody',[
 {type:'text',value:r=>technicians.text(r.name)},
 {type:'number',value:r=>r.total},
 {type:'number',value:r=>r.good},
 {type:'number',value:r=>r.revis},
 {type:'number',value:r=>r.logs},
 {type:'number',value:r=>r.sla}
],()=>renderTechTable());
const detailSort=createSlaTableSort(document,'detailBody',[
 {type:'date',value:r=>r.reportDate},
 {type:'text',value:r=>r.contract},
 {type:'text',value:r=>r.city},
 {type:'text',value:r=>technicians.text(r.tech)},
 {type:'text',value:r=>r.businessUnit},
 {type:'text',value:r=>r.os},
 {type:'number',value:r=>r.taskCount},
 {type:'number',value:r=>r.logs},
 {type:'text',value:r=>r.revisit?'SEM PADRÃO':'COM PADRÃO'},
 {type:'text',value:r=>r.typeOS}
],()=>{page=1;renderDetails();});
`;

export function applySlaTableSortBindings(input) {
  let code = input;
  for (const [body, data, sort, render] of [
    ["serviceBody", "serviceData", "serviceSort", "renderServiceTable"],
    ["techBody", "techData", "techSort", "renderTechTable"],
  ]) {
    const statement = code.split("\n").find((line) => line.includes(`$('${body}').innerHTML=`));
    if (!statement || !statement.includes(`${data}.map(`))
      throw Error(`Missing SLA table rendering: ${body}`);
    code = code.replace(statement, ` ${render}();`);
    code += `\nfunction ${render}(){${statement.replace(`${data}.map(`, `${sort}.rows(${data}).map(`)}}\n`;
  }
  const from = "return q?groupedCurrent.filter(r=>searchText(r).includes(q)):groupedCurrent;";
  if (!code.includes(from)) throw Error("Missing SLA analytic filter binding.");
  code = code.replace(
    from,
    "return detailSort.rows(q?groupedCurrent.filter(r=>searchText(r).includes(q)):groupedCurrent);",
  );
  const header = "$('detailsOSHeader').textContent=detailed?'OS de origem':'OS registrada';";
  if (!code.includes(header)) throw Error("Missing SLA dynamic OS heading.");
  return code.replace(header, `${header}detailSort.syncHeaders();`);
}
