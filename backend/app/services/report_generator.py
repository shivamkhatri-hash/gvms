# pyright: reportMissingTypeStubs=false
import io
import csv
from typing import List, Dict, Any, cast
from openpyxl import Workbook  # type: ignore
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side  # type: ignore
from openpyxl.utils import get_column_letter  # type: ignore
from reportlab.lib.pagesizes import letter, A4, landscape  # type: ignore
from reportlab.lib import colors  # type: ignore
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, Image  # type: ignore
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle  # type: ignore
from app.models.registry import VariableRegistry
from typing import Optional


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
        if ws is None:
            ws = wb.create_sheet()
        # Excel sheet title sanitization: replace invalid characters \ / ? * : [ ] with _
        cleaned_title = sheet_name
        for char in ['\\', '/', '?', '*', ':', '[', ']']:
            cleaned_title = cleaned_title.replace(char, '_')
        ws.title = cleaned_title[:30]  # Excel limits sheet name to 31 chars

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
        for col_idx, col in enumerate(ws.columns, start=1):
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = get_column_letter(col_idx)
            ws.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 50)

        output = io.BytesIO()
        wb.save(output)
        return output.getvalue()

    @staticmethod
    def generate_pdf(
        dataset_display_name: str,
        variables: List[VariableRegistry],
        records: List[Dict[str, Any]],
        selected_graphs: Optional[List[Dict[str, Any]]] = None
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

        # 5. Selected Subsurface Charts & Visualizations
        if selected_graphs and records:
            elements.append(Spacer(1, 20))
            elements.append(Paragraph("Visualizations & Dynamic Interpretations", section_style))
            elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#CBD5E1'), spaceAfter=15))
            
            for g in selected_graphs:
                try:
                    x_col = g.get("x_axis")
                    if not x_col or not isinstance(x_col, str):
                        continue
                    y_col = g.get("y_axis")
                    if y_col is not None and not isinstance(y_col, str):
                        y_col = None
                    title = g.get("title", "Dataset Visualization")
                    g_type = g.get("type", "scatter")
                    
                    img_bytes = ReportGenerator._create_matplotlib_plot(
                        chart_type=g_type,
                        x_col=x_col,
                        y_col=y_col,
                        title=title,
                        records=records,
                        x_label=x_col.upper(),
                        y_label=y_col.upper() if y_col else None
                    )
                    
                    if img_bytes:
                        chart_img = Image(io.BytesIO(img_bytes), width=360, height=240)
                        chart_img.hAlign = 'CENTER'
                        elements.append(chart_img)
                        elements.append(Spacer(1, 15))
                except Exception as ex:
                    print(f"Error generating matplotlib plot in PDF: {ex}")
                    elements.append(Paragraph(f"[!] Error rendering visualization chart '{g.get('title')}'", styles['Normal']))
                    elements.append(Spacer(1, 10))

        doc.build(elements)
        buffer.seek(0)
        return buffer.getvalue()

    @staticmethod
    def _create_matplotlib_plot(
        chart_type: str,
        x_col: str,
        y_col: Optional[str],
        title: str,
        records: List[Dict[str, Any]],
        x_label: str,
        y_label: Optional[str]
    ) -> bytes:
        """Dynamically render custom matplotlib charts matching the look & feel of frontend Plotly charts."""
        try:
            import matplotlib  # type: ignore
            matplotlib.use('Agg')  # Use non-interactive backend
            import matplotlib.pyplot as plt  # type: ignore
            import numpy as np

            # Extract coordinates
            x_vals = []
            y_vals = []
            
            for r in records:
                x_val = r.get(x_col)
                y_val = r.get(y_col) if y_col else None
                
                if x_val is not None:
                    try:
                        x_vals.append(float(x_val))
                    except (ValueError, TypeError):
                        continue
                else:
                    continue
                    
                if y_col:
                    if y_val is not None:
                        try:
                            y_vals.append(float(y_val))
                        except (ValueError, TypeError):
                            x_vals.pop()  # Maintain alignment
                            continue
                    else:
                        x_vals.pop()
                        continue

            if not x_vals:
                return b""

            # Setup figure
            fig, ax = plt.subplots(figsize=(6, 4))
            
            # Apply styling matching dashboard charts
            if chart_type == 's2_vs_toc':
                ax.scatter(x_vals, y_vals, color='#003366', alpha=0.8, edgecolors='white', linewidths=0.5, s=35, zorder=5)
                ax.set_xscale('log')
                ax.set_yscale('log')
                ax.set_xlim(0.1, 100)
                ax.set_ylim(0.1, 100)
                
                # Classifications vertical reference lines (TOC guidelines)
                ax.axvline(0.5, color='#06B6D4', linestyle='--', linewidth=0.8, alpha=0.7)
                ax.axvline(1.0, color='#F97316', linestyle='--', linewidth=0.8, alpha=0.7)
                ax.axvline(2.0, color='#2563EB', linestyle='--', linewidth=0.8, alpha=0.7)
                ax.axvline(4.0, color='#EF4444', linestyle='--', linewidth=0.8, alpha=0.7)
                
                # Classifications horizontal reference lines (S2 guidelines)
                ax.axhline(2.5, color='#2563EB', linestyle='--', linewidth=0.8, alpha=0.7)
                ax.axhline(5.0, color='#EF4444', linestyle='--', linewidth=0.8, alpha=0.7)
                ax.axhline(10.0, color='#16A34A', linestyle='--', linewidth=0.8, alpha=0.7)
                ax.axhline(20.0, color='#7C3AED', linestyle='--', linewidth=0.8, alpha=0.7)
                
            elif chart_type == 'hi_vs_tmax':
                ax.scatter(x_vals, y_vals, color='#D97706', alpha=0.8, edgecolors='white', linewidths=0.5, s=35, zorder=5)
                ax.set_xlim(400, 480)
                ax.set_ylim(0, 700)
                ax.axvline(435, color='#000000', linestyle='-', linewidth=0.8, alpha=0.5)
                ax.axvline(470, color='#000000', linestyle='-', linewidth=0.8, alpha=0.5)
                
                # Maturity curve guidelines (Type II, III, etc.)
                tmax_vals = np.linspace(400, 472, 100)
                y_type_iii = 85 * (1 - 0.7 * ((tmax_vals - 400)/72)**2)
                y_type_ii = 630 * (1 - 0.9 * ((tmax_vals - 400)/72)**2)
                
                ax.plot(tmax_vals, y_type_iii, color='#F97316', linestyle='-', linewidth=1, label='Type III', zorder=2)
                ax.plot(tmax_vals, y_type_ii, color='#1E3A8A', linestyle='-', linewidth=1, label='Type II', zorder=2)
                ax.legend(loc='upper right', fontsize=7)
                
            elif chart_type == 'depth_profile':
                ax.scatter(x_vals, y_vals, color='#2563EB', alpha=0.8, edgecolors='white', linewidths=0.5, s=35, zorder=5)
                ax.invert_yaxis()  # Invert depth log
                
            else: # Standard scatter
                ax.scatter(x_vals, y_vals, color='#10B981', alpha=0.8, edgecolors='white', linewidths=0.5, s=35, zorder=5)

            ax.set_title(title, fontsize=10, fontweight='bold', color='#0F172A', pad=8)
            ax.set_xlabel(x_label, fontsize=8, color='#475569')
            ax.set_ylabel(y_label or 'Value', fontsize=8, color='#475569')
            ax.grid(True, which='both', linestyle=':', color='#E2E8F0', linewidth=0.5)
            
            for spine in ['top', 'right']:
                ax.spines[spine].set_visible(False)
            for spine in ['left', 'bottom']:
                ax.spines[spine].set_color('#CBD5E1')
                ax.spines[spine].set_linewidth(0.8)

            buf = io.BytesIO()
            plt.savefig(buf, format='png', bbox_inches='tight', dpi=150)
            plt.close(fig)
            return buf.getvalue()
        except Exception as e:
            print(f"Failed to render matplotlib plot: {e}")
            return b""
