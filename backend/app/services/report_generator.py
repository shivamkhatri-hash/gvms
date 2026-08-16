# pyright: reportMissingTypeStubs=false
import io
import csv
from typing import List, Dict, Any, cast
from openpyxl import Workbook  # type: ignore
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side  # type: ignore
from reportlab.lib.pagesizes import letter, A4, landscape  # type: ignore
from reportlab.lib import colors  # type: ignore
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable  # type: ignore
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle  # type: ignore
from app.models.registry import VariableRegistry


class ReportGenerator:
    @staticmethod
    def generate_csv(variables: List[VariableRegistry], records: List[Dict[str, Any]]) -> bytes:
        """Dynamically generate a CSV byte stream using the registered columns."""
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Headers: display_name
        headers = [v.display_name for v in variables]
        writer.writerow(headers)
        
        for r in records:
            row = []
            for v in variables:
                col_name = cast(str, v.sql_column_name)
                val = r.get(col_name)
                row.append(val if val is not None else "")
            writer.writerow(row)
            
        return output.getvalue().encode("utf-8")

    @staticmethod
    def generate_excel(variables: List[VariableRegistry], records: List[Dict[str, Any]], sheet_name: str = "Dataset Report") -> bytes:
        """Dynamically generate an Excel workbook using the registered column definitions and formatting."""
        wb = Workbook()
        ws = wb.active
        ws.title = sheet_name[:30]  # Excel limits sheet name to 31 chars

        # Styles
        header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
        header_fill = PatternFill(start_color="003366", end_color="003366", fill_type="solid")  # ONGC Cobalt Blue
        thin_border = Border(
            left=Side(style="thin", color="CCCCCC"),
            right=Side(style="thin", color="CCCCCC"),
            top=Side(style="thin", color="CCCCCC"),
            bottom=Side(style="thin", color="CCCCCC")
        )
        align_center = Alignment(horizontal="center", vertical="center")
        align_left = Alignment(horizontal="left", vertical="center")

        # Headers display_name + unit
        headers = []
        for v in variables:
            h = v.display_name
            if v.display_unit:
                h += f" ({v.display_unit})"
            headers.append(h)
            
        ws.append(headers)

        # Style header row
        for col_num in range(1, len(headers) + 1):
            cell = ws.cell(row=1, column=col_num)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = align_center

        # Append records
        for row_idx, r in enumerate(records, start=2):
            row_data = []
            for v in variables:
                col_name = cast(str, v.sql_column_name)
                val = r.get(col_name)
                if val is None:
                    row_data.append("")
                else:
                    if v.is_numeric:
                        try:
                            row_data.append(float(val))
                        except (ValueError, TypeError):
                            row_data.append(str(val))
                    else:
                        row_data.append(str(val))
            ws.append(row_data)
            
            # Format row cells
            for col_num in range(1, len(headers) + 1):
                cell = ws.cell(row=row_idx, column=col_num)
                cell.border = thin_border
                if variables[col_num - 1].is_numeric:
                    cell.alignment = align_center
                else:
                    cell.alignment = align_left

        # Auto-fit columns
        for col in ws.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = col[0].column_letter
            ws.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 50)

        output = io.BytesIO()
        wb.save(output)
        return output.getvalue()

    @staticmethod
    def generate_pdf(
        dataset_display_name: str,
        variables: List[VariableRegistry],
        records: List[Dict[str, Any]]
    ) -> bytes:
        """Dynamically generate a styled landscape or portrait PDF containing the dataset and summary."""
        # 1. Filter columns that are visible (max 8 columns for layout rendering)
        pdf_vars = [v for v in variables if v.is_visible][:8]
        if not pdf_vars:
            pdf_vars = variables[:6]

        # 2. Determine page layout: Landscape for wide tables
        use_landscape = len(pdf_vars) > 5
        page_size = landscape(A4) if use_landscape else A4
        printable_width = (842 - 72) if use_landscape else (595 - 72)

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=page_size,
            rightMargin=36,
            leftMargin=36,
            topMargin=36,
            bottomMargin=36
        )
        elements = []
        styles = getSampleStyleSheet()

        # Custom paragraph styles
        title_style = ParagraphStyle(
            'TitleStyle',
            parent=styles['Heading1'],
            fontName='Helvetica-Bold',
            fontSize=16,
            textColor=colors.HexColor('#003366'),
            spaceAfter=4
        )
        subtitle_style = ParagraphStyle(
            'SubTitleStyle',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=9,
            textColor=colors.HexColor('#64748B'),
            spaceAfter=12
        )
        section_style = ParagraphStyle(
            'SectionStyle',
            parent=styles['Heading2'],
            fontName='Helvetica-Bold',
            fontSize=11,
            textColor=colors.HexColor('#003366'),
            spaceBefore=8,
            spaceAfter=6
        )

        elements.append(Paragraph("OIL AND NATURAL GAS CORPORATION LIMITED", title_style))
        elements.append(Paragraph(f"Dynamic Laboratory Data Platform — {dataset_display_name} Technical Report", subtitle_style))
        elements.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#003366'), spaceAfter=12))

        # 3. Dynamic Executive Summary stats
        total = len(records)
        numeric_kpis = [v for v in variables if v.is_numeric and v.kpi_enabled]
        summary_parts = []
        
        for v in numeric_kpis:
            col = cast(str, v.sql_column_name)
            vals = [float(r[col]) for r in records if r.get(col) is not None]
            if vals:
                avg_val = sum(vals) / len(vals)
                summary_parts.append(f"Avg {v.display_name}: <b>{avg_val:.2f} {v.display_unit or ''}</b>")
                
        summary_text = f"<b>Summary Stats:</b> Total Samples: <b>{total}</b>"
        if summary_parts:
            summary_text += " | " + " · ".join(summary_parts)
            
        elements.append(Paragraph(summary_text, styles['Normal']))
        elements.append(Spacer(1, 10))

        # 4. Data Table
        elements.append(Paragraph("Ingested Data & Subsurface Records", section_style))

        # Header row
        table_data = [[
            Paragraph(f"<b>{v.display_name}</b>", styles['Normal'])
            for v in pdf_vars
        ]]

        # Data rows (limit top 100 to avoid out-of-memory or huge page count crashes)
        for r in records[:100]:
            row = []
            for v in pdf_vars:
                col_name = cast(str, v.sql_column_name)
                val = r.get(col_name)
                if val is None:
                    txt = "-"
                else:
                    if v.is_numeric:
                        try:
                            txt = f"{float(val):.2f}"
                        except (ValueError, TypeError):
                            txt = str(val)
                    else:
                        txt = str(val)
                row.append(Paragraph(txt, styles['Normal']))
            table_data.append(row)

        # Distribute width equally
        col_width = printable_width / len(pdf_vars)
        col_widths = [col_width] * len(pdf_vars)

        t = Table(table_data, colWidths=col_widths)
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F1F5F9')),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(t)

        doc.build(elements)
        buffer.seek(0)
        return buffer.getvalue()
