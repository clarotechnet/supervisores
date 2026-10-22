// Keep the reviewed HTML's calculations intact; bind only rendered identities.
export function applySlaDirectoryBindings(input) {
  let code = input;
  const replace = (from, to) => {
    if (!code.includes(from)) throw Error(`Missing SLA directory binding: ${from.slice(0, 65)}`);
    code = code.replaceAll(from, to);
  };
  replace(
    "function tooltip(d){return `${d.name}:",
    "function tooltip(d){return `${d.technicianLabel||d.name}:",
  );
  replace(
    " const step=daily?76:volumeOnly?68:140,W=Math.max(volumeOnly?600:460,data.length*step+88),H=daily?280:250,ml=45,mr=43,mt=43,mb=volumeOnly?72:40,ih=H-mt-mb,iw=W-ml-mr,s=iw/data.length;",
    " const named=volumeOnly&&data.some(d=>d.technicianLabel);\n const step=daily?76:volumeOnly?68:140,W=Math.max(volumeOnly?600:460,data.length*step+88+(named?55:0)),H=daily?280:named?310:250,ml=named?100:45,mr=43,mt=43,mb=volumeOnly?(named?132:72):40,ih=H-mt-mb,iw=W-ml-mr,s=iw/data.length;",
  );
  replace(
    "const name=daily?shortDate(d.name):d.name;",
    "const name=daily?shortDate(d.name):(d.axisName||d.name);",
  );
  replace(
    '${esc(name)}</text>`:`<text class="lab"',
    '${esc(name)}${d.technicianLabel?`<tspan x="${cx}" dy="13">${esc(d.axisLogin)}</tspan>`:\'\'}</text>`:`<text class="lab"',
  );
  replace(
    "renderCombo('techChart',techData.slice(0,25),",
    "renderCombo('techChart',techData.slice(0,25).map(d=>technicians.chart(d)),",
  );
  replace(
    "techData.map(d=>`<tr><td>${esc(d.name)}</td>",
    "techData.map(d=>`<tr><td>${technicians.cell(d.name)}</td>",
  );
  replace("<td>${esc(g.tech)}</td>", "<td>${technicians.cell(g.tech)}</td>");
  replace('<span class="muted">${esc(g.tech)}</span>', "${technicians.cell(g.tech)}");
  replace(
    "function searchText(r){return fold([",
    "function searchText(r){return fold([technicians.text(r.tech),",
  );
  return code;
}
