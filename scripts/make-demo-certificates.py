"""Generates SAMPLE organic certificates (PDF) for demos and testing.

These are clearly marked specimens, not real certificates. Real organic
certification under NPOP / PGS-India is issued only by accredited bodies
after inspection. Usage (from the repo root):

    python scripts/make-demo-certificates.py
"""

from datetime import date, timedelta
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

OUT = Path(__file__).resolve().parent.parent / "demo-certificates"

FARMS = [
    {
        "file": "sample-certificate-basmati-rice.pdf",
        "no": "DEMO-2026-0001",
        "operator": "Patil Organic Farm",
        "address": "Village Ozar, Taluka Niphad, District Nashik, Maharashtra",
        "products": "Basmati rice (paddy)",
        "area": "4.2 ha",
    },
    {
        "file": "sample-certificate-toor-dal.pdf",
        "no": "DEMO-2026-0002",
        "operator": "Shinde Natural Farms",
        "address": "Village Ausa, District Latur, Maharashtra",
        "products": "Toor dal (pigeon pea)",
        "area": "2.8 ha",
    },
    {
        "file": "sample-certificate-jowar.pdf",
        "no": "DEMO-2026-0003",
        "operator": "Green Valley Growers Group",
        "address": "Village Mohol, District Solapur, Maharashtra",
        "products": "Jowar (sorghum), ragi (finger millet)",
        "area": "6.5 ha",
    },
]


def draw(c: canvas.Canvas, farm: dict) -> None:
    w, h = A4
    issued = date.today()
    valid_to = issued + timedelta(days=365)

    # Border
    c.setStrokeColor(colors.HexColor("#2f7d32"))
    c.setLineWidth(3)
    c.rect(12 * mm, 12 * mm, w - 24 * mm, h - 24 * mm)

    # Diagonal SPECIMEN watermark
    c.saveState()
    c.setFillColor(colors.HexColor("#d9534f"))
    c.setFillAlpha(0.15)
    c.setFont("Helvetica-Bold", 90)
    c.translate(w / 2, h / 2)
    c.rotate(40)
    c.drawCentredString(0, 0, "SPECIMEN")
    c.restoreState()

    # Demo banner
    c.setFillColor(colors.HexColor("#fdeaea"))
    c.rect(20 * mm, h - 38 * mm, w - 40 * mm, 14 * mm, stroke=0, fill=1)
    c.setFillColor(colors.HexColor("#b91c1c"))
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(w / 2, h - 30 * mm, "SAMPLE FOR SOFTWARE DEMONSTRATION ONLY - NOT A VALID ORGANIC CERTIFICATE")

    # Title
    c.setFillColor(colors.HexColor("#1f5f23"))
    c.setFont("Helvetica-Bold", 22)
    c.drawCentredString(w / 2, h - 58 * mm, "Organic Production Certificate")
    c.setFont("Helvetica", 11)
    c.setFillColor(colors.black)
    c.drawCentredString(w / 2, h - 66 * mm, "Issued by: Demo Certification Body (fictional, for testing Organic Trace)")

    # Details
    rows = [
        ("Certificate No.", farm["no"]),
        ("Operator", farm["operator"]),
        ("Address", farm["address"]),
        ("Products", farm["products"]),
        ("Area under organic management", farm["area"]),
        ("Standard referenced", "NPOP-style format (illustrative only)"),
        ("Status", "Organic (sample)"),
        ("Issue date", issued.strftime("%d %B %Y")),
        ("Valid until", valid_to.strftime("%d %B %Y")),
    ]
    y = h - 90 * mm
    for label, value in rows:
        c.setFont("Helvetica-Bold", 11)
        c.drawString(28 * mm, y, label)
        c.setFont("Helvetica", 11)
        c.drawString(98 * mm, y, value)
        y -= 10 * mm

    # Statement
    c.setFont("Helvetica-Oblique", 10)
    c.setFillColor(colors.HexColor("#444444"))
    text = c.beginText(28 * mm, y - 6 * mm)
    for line in [
        "This document is a fictional specimen created for the Organic Food Supply Chain",
        "Traceability project. It demonstrates certificate upload to IPFS and on-chain linking.",
        "It carries no legal meaning and must not be used as proof of organic status.",
    ]:
        text.textLine(line)
    c.drawText(text)

    # Signature block
    c.setFillColor(colors.black)
    c.setFont("Helvetica", 10)
    c.line(w - 85 * mm, 45 * mm, w - 28 * mm, 45 * mm)
    c.drawString(w - 85 * mm, 40 * mm, "Demo Inspector (specimen signature)")


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for farm in FARMS:
        path = OUT / farm["file"]
        c = canvas.Canvas(str(path), pagesize=A4)
        c.setTitle(f"SAMPLE certificate {farm['no']} (demo only)")
        draw(c, farm)
        c.showPage()
        c.save()
        print(f"Wrote {path.relative_to(OUT.parent)}")


if __name__ == "__main__":
    main()
