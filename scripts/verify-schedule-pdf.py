"""Validate synthetic browser exports: text, theme, vector content, totals and pagination."""
import json
import re
import sys
from pathlib import Path
import pdfplumber
from pypdf import PdfReader

root = Path(sys.argv[1] if len(sys.argv) > 1 else "tmp/pdfs/schedule-qa")
expected = json.loads((root / "expected.json").read_text(encoding="utf-8"))
compact = lambda text: re.sub(r"\s+", "", text)
results = []
for record in expected["records"]:
    path = root / record["file"]
    reader = PdfReader(path)
    texts = [page.extract_text() for page in reader.pages]
    combined = compact("\n".join(texts))
    assert "NAO_EXPORTAR_OUTRO_MES" not in combined
    assert len(reader.pages) >= (2 if record["notes"] else 1)
    for person in record["selected"]:
        assert combined.count(person["login"]) == 1, (path, person["login"])
        assert compact(person["name"]) in combined, (path, person["name"])
    for person in expected["allPeople"]:
        if person not in record["selected"]:
            assert person["login"] not in combined, (path, "Unselected person leaked", person)
    for index, (page, text) in enumerate(zip(reader.pages, texts)):
        assert float(page.mediabox.width) > float(page.mediabox.height)
        assert abs(float(page.mediabox.width) - 1190.55) < .1
        assert abs(float(page.mediabox.height) - 841.89) < .1
        assert "TechNet" in text and record["city"] in text and record["sector"] in text
        assert record["month"] in text
        assert f"Página {index+1} de {len(reader.pages)}" in text
        assert len(page.images) == 0, (path, "Raster image in vector export")
        operations = page.get_contents().operations
        fills = [tuple(float(value) for value in args) for args, op in operations if op == b"rg"]
        assert all(abs(a-b) < 1e-4 for a, b in zip(fills[0], record["palette"]["background"]))
        assert sum(op == b"c" for _, op in operations) >= 28, (path, "Vector logo missing")
        for font in page["/Resources"]["/Font"].values():
            font = font.get_object()
            assert "/ToUnicode" in font
            assert "/FontFile2" in font["/DescendantFonts"][0].get_object()["/FontDescriptor"]
    note_text = []
    for text in texts:
        if "Observações da gestão" not in text:
            continue
        for line in text.splitlines():
            if (line == "TechNet" or line == "Observações da gestão" or "colaborador(es) selecionado(s)" in line
                or line == "A3 paisagem - PDF vetorial" or line.startswith(record["city"] + " |")
                or line.startswith("Plantão ") or line.startswith("Colaboradores selecionados")
                or line == "TechNet | Escalas" or line.startswith("Página ")
                or re.match(r"^\d\d/\d\d/\d{4}( \(continuação\))?$", line)):
                continue
            note_text.append(line)
    full_notes = compact("\n".join(note_text))
    for note in record["notes"]:
        assert compact(note["body"]) in full_notes, (path, "Management note truncated")
    table_pages = []
    with pdfplumber.open(path) as pdf:
        for index, page in enumerate(pdf.pages):
            assert all(-.5 <= char["x0"] < char["x1"] <= page.width + .5 and -.5 <= char["top"] <= char["bottom"] <= page.height + .5 for char in page.chars if char["text"].strip()), (path, index, "Clipped text")
            if "Escala comparativa" not in texts[index]:
                continue
            table_pages.append(index + 1)
            words = page.extract_words()
            for label, key in [("Em", "work"), ("De", "off")]:
                anchors = [word for word in words if word["text"] == label and word["x0"] < 60]
                assert len(anchors) == 1
                anchor = anchors[0]
                values = sorted([word for word in words if word["x0"] > 250 and abs(word["top"] - anchor["top"]) < 2], key=lambda word: word["x0"])
                assert [int(word["text"]) for word in values] == [total[key] for total in record["totals"].values()], (path, index, "Totals differ from filtered screen", values)
    if record["file"] == "all-light.pdf":
        assert len(table_pages) > 1
    results.append({"file": record["file"], "people": len(record["selected"]), "pages": len(reader.pages), "tablePages": table_pages})
print(json.dumps({"vectorPdf": True, "embeddedFonts": True, "brandHeaders": True, "landscape": True, "noClipping": True, "allTextPreserved": True, "filteredTotals": True, "themeColors": True, "files": results}))
