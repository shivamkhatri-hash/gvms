from typing import Dict, Tuple

class GeochemistryEngine:
    """
    Petroleum Geochemistry Classification Engine based on Peters & Cassa (1994) / Schlumberger standards.
    Evaluates Total Organic Carbon (TOC wt%) and Pyrolysis Peak S2 (mg HC/g rock) to assess source rock richness.
    """

    @staticmethod
    def classify_toc(toc: float) -> str:
        """
        TOC Classification thresholds:
        - < 0.5 wt%: Poor
        - 0.5 - 1.0 wt%: Fair
        - 1.0 - 2.0 wt%: Good
        - 2.0 - 4.0 wt%: Very Good
        - > 4.0 wt%: Excellent
        """
        if toc < 0.5:
            return "Poor"
        elif 0.5 <= toc < 1.0:
            return "Fair"
        elif 1.0 <= toc < 2.0:
            return "Good"
        elif 2.0 <= toc <= 4.0:
            return "Very Good"
        else:
            return "Excellent"

    @staticmethod
    def classify_s2(s2: float) -> str:
        """
        Pyrolysis Peak S2 (mg HC/g rock) Classification thresholds:
        - < 2.5: Poor
        - 2.5 - 5.0: Fair
        - 5.0 - 10.0: Good
        - 10.0 - 20.0: Very Good
        - > 20.0: Excellent
        """
        if s2 < 2.5:
            return "Poor"
        elif 2.5 <= s2 < 5.0:
            return "Fair"
        elif 5.0 <= s2 < 10.0:
            return "Good"
        elif 10.0 <= s2 <= 20.0:
            return "Very Good"
        else:
            return "Excellent"

    @classmethod
    def generate_interpretation(cls, toc: float, s2: float, well_name: str, depth_from: float) -> str:
        """
        Generates automated geological synthesis for petroleum source rock evaluation.
        """
        toc_class = cls.classify_toc(toc)
        s2_class = cls.classify_s2(s2)

        # Hydrogen Index equivalent proxy potential (S2/TOC * 100)
        hi_proxy = (s2 / toc * 100) if toc > 0 else 0

        kerogen_type = "Gas-prone (Type III)"
        if hi_proxy >= 600:
            kerogen_type = "Oil-prone (Type I)"
        elif hi_proxy >= 300:
            kerogen_type = "Mixed Oil/Gas (Type II)"
        elif hi_proxy >= 150:
            kerogen_type = "Gas/Oil (Type II/III)"

        synthesis = (
            f"Well {well_name} at depth {depth_from:.1f}m exhibits {toc_class.lower()} Organic Richness "
            f"(TOC = {toc:.2f} wt%) and {s2_class.lower()} Hydrocarbon Potential (S2 = {s2:.2f} mg HC/g rock). "
            f"Estimated Kerogen Type: {kerogen_type} (HI ~ {hi_proxy:.0f} mg HC/g TOC)."
        )
        return synthesis

    @classmethod
    def evaluate_sample(cls, sample_type: str, well_name: str, depth_from: float, depth_interval: float, toc: float, s2: float) -> Dict:
        toc_class = cls.classify_toc(toc)
        s2_class = cls.classify_s2(s2)
        interp = cls.generate_interpretation(toc, s2, well_name, depth_from)

        return {
            "sample_type": sample_type,
            "well_name": well_name,
            "depth_from": depth_from,
            "depth_interval": depth_interval,
            "toc": toc,
            "s2": s2,
            "toc_classification": toc_class,
            "s2_classification": s2_class,
            "interpretation": interp
        }

    @staticmethod
    def build_s2_toc_chart(dataset: list) -> list:
        """
        Calculates Average TOC and Average S2 grouped by Well, Formation, Layer, Depth and Sample.
        """
        return build_s2_toc_chart(dataset)


def build_s2_toc_chart(dataset: list) -> list:
    """
    Accepts Core dataset, Cuttings dataset, Combined dataset without modification.
    Computes Average TOC and Average S2 automatically grouped by:
    - Well Name
    - Formation
    - Layer
    - Depth / Depth Interval (or Top/Bottom Depth)
    - Sample / Sample Number
    when appropriate.
    """
    if not dataset:
        return []

    records = []
    for r in dataset:
        if hasattr(r, "_asdict"):
            records.append(r._asdict())
        elif isinstance(r, dict):
            records.append(r.copy())
        else:
            try:
                records.append(r.__dict__.copy())
            except Exception:
                records.append(r)

    roles = {
        "toc": ["toc", "total organic carbon", "total carbon", "total organic carbon (toc)", "average_toc"],
        "s2": ["s2", "pyrolyzable hydrocarbons", "hydrocarbon yield", "s2 (mg hc/g rock)", "average_s2"],
        "well": ["well", "well name", "borehole", "borehole name", "well_name"],
        "formation": ["formation", "fm", "stratigraphy"],
        "layer": ["layer", "member"],
        "depth": ["depth", "md", "tvd", "top depth", "sample top", "depth (m)", "depth_from", "top_depth"],
        "bottom_depth": ["bottom depth", "bottom_depth", "sample bottom", "depth_max", "depth_to", "bottom_depth"],
        "sample": ["sample", "sample_id", "sample_name", "sample_number", "sample_no"],
        "sample_type": ["sample_type", "type", "lithology", "sample_type"]
    }

    def find_val(rec: dict, role_keys: list):
        if not isinstance(rec, dict):
            return None
        for k, v in rec.items():
            k_lower = k.lower()
            if k_lower in role_keys:
                return v
        return None

    groups = {}
    for rec in records:
        if not isinstance(rec, dict):
            continue

        well = find_val(rec, roles["well"])
        fm = find_val(rec, roles["formation"])
        layer = find_val(rec, roles["layer"])
        depth = find_val(rec, roles["depth"])
        b_depth = find_val(rec, roles["bottom_depth"])
        sample = find_val(rec, roles["sample"])
        sample_type = find_val(rec, roles["sample_type"])
        toc = find_val(rec, roles["toc"])
        s2 = find_val(rec, roles["s2"])

        try:
            toc_val = float(toc) if toc is not None else None
        except (ValueError, TypeError):
            toc_val = None

        try:
            s2_val = float(s2) if s2 is not None else None
        except (ValueError, TypeError):
            s2_val = None

        well_str = str(well).strip() if well is not None else ""
        fm_str = str(fm).strip() if fm is not None else ""
        layer_str = str(layer).strip() if layer is not None else ""
        depth_val = float(depth) if depth is not None else None
        b_depth_val = float(b_depth) if b_depth is not None else None
        sample_str = str(sample).strip() if sample is not None else ""

        depth_key = f"{depth_val:.1f}" if depth_val is not None else ""
        b_depth_key = f"{b_depth_val:.1f}" if b_depth_val is not None else ""

        group_key = (well_str, fm_str, layer_str, depth_key, b_depth_key, sample_str)

        if group_key not in groups:
            groups[group_key] = {
                "well_name": well_str or None,
                "formation": fm_str or None,
                "layer": layer_str or None,
                "top_depth": depth_val,
                "bottom_depth": b_depth_val,
                "sample": sample_str or None,
                "sample_type": sample_type,
                "tocs": [],
                "s2s": [],
                "raw_record": rec
            }

        if toc_val is not None:
            groups[group_key]["tocs"].append(toc_val)
        if s2_val is not None:
            groups[group_key]["s2s"].append(s2_val)

    aggregated = []
    for g_key, g_data in groups.items():
        tocs_list = g_data["tocs"]
        s2s_list = g_data["s2s"]

        avg_toc = sum(tocs_list) / len(tocs_list) if tocs_list else None
        avg_s2 = sum(s2s_list) / len(s2s_list) if s2s_list else None

        if avg_toc is None:
            raw_toc = find_val(g_data["raw_record"], roles["toc"])
            try:
                avg_toc = float(raw_toc) if raw_toc is not None else None
            except (ValueError, TypeError):
                pass
        if avg_s2 is None:
            raw_s2 = find_val(g_data["raw_record"], roles["s2"])
            try:
                avg_s2 = float(raw_s2) if raw_s2 is not None else None
            except (ValueError, TypeError):
                pass

        rec = g_data["raw_record"].copy()
        rec["average_toc"] = avg_toc
        rec["average_s2"] = avg_s2
        rec["well_name"] = g_data["well_name"]
        rec["formation"] = g_data["formation"]
        rec["layer"] = g_data["layer"]
        rec["top_depth"] = g_data["top_depth"]
        rec["bottom_depth"] = g_data["bottom_depth"]
        rec["sample"] = g_data["sample"]
        rec["sample_type"] = g_data["sample_type"]
        rec["is_aggregated"] = len(tocs_list) > 1 or len(s2s_list) > 1

        aggregated.append(rec)

    return aggregated


def build_s2_toc_chart_figure(dataset: list) -> dict:
    """
    Computes S2 vs TOC Plotly interpretation figure with logarithmic scales and reference lines.
    """
    import plotly.graph_objects as go
    
    # 1. Aggregate dataset using the existing build_s2_toc_chart function
    records = build_s2_toc_chart(dataset)
    
    symbols_list = ['circle', 'square', 'diamond', 'cross', 'x', 'triangle-up', 'triangle-down', 'pentagon', 'hexagon', 'star']
    
    # 2. Group records by Formation (color) and Well (symbol)
    groups = {}
    for r in records:
        fm = r.get("formation") or "Unknown Formation"
        well = r.get("well_name") or "Unknown Well"
        key = (fm, well)
        if key not in groups:
            groups[key] = []
        groups[key].append(r)
        
    unique_wells = sorted(list({r.get("well_name") or "Unknown Well" for r in records}))
    unique_fms = sorted(list({r.get("formation") or "Unknown Formation" for r in records}))
    
    well_symbol_map = {w: symbols_list[idx % len(symbols_list)] for idx, w in enumerate(unique_wells)}
    
    colors_list = [
        '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
        '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
    ]
    fm_color_map = {f: colors_list[idx % len(colors_list)] for idx, f in enumerate(unique_fms)}

    fig = go.Figure()
    
    for (fm, well), recs in groups.items():
        x_vals = []
        y_vals = []
        hover_texts = []
        
        for r in recs:
            t = r.get("average_toc")
            s = r.get("average_s2")
            if t is None or s is None or t <= 0 or s <= 0:
                continue
            x_vals.append(t)
            y_vals.append(s)
            
            hover_html = (
                f"<b>Well Name:</b> {r.get('well_name') or 'N/A'}<br>"
                f"<b>Formation:</b> {r.get('formation') or 'N/A'}<br>"
                f"<b>Layer:</b> {r.get('layer') or 'N/A'}<br>"
                f"<b>Top Depth:</b> {r.get('top_depth') or 'N/A'} m<br>"
                f"<b>Bottom Depth:</b> {r.get('bottom_depth') or 'N/A'} m<br>"
                f"<b>Average TOC:</b> {t:.2f} %<br>"
                f"<b>Average S2:</b> {s:.2f} mg HC/g rock<br>"
                f"<b>Sample Type:</b> {r.get('sample_type') or 'N/A'}<br>"
                f"<b>Dataset:</b> {r.get('dataset_name') or 'S2_vs_TOC computed view'}<br>"
                f"<extra></extra>"
            )
            hover_texts.append(hover_html)
            
        if not x_vals:
            continue
            
        fig.add_trace(go.Scatter(
            x=x_vals,
            y=y_vals,
            mode='markers',
            name=f"{well} ({fm})",
            marker=dict(
                size=10,
                symbol=well_symbol_map[well],
                color=fm_color_map[fm],
                line=dict(width=1, color='white')
            ),
            text=hover_texts,
            hovertemplate='%{text}'
        ))
        
    # Vertical reference lines
    for line_val in [0.5, 1, 2, 4]:
        fig.add_vline(x=line_val, line_width=1, line_dash="dash", line_color="gray")
        
    # Horizontal reference lines
    for line_val in [2.5, 5, 10, 20]:
        fig.add_hline(y=line_val, line_width=1, line_dash="dash", line_color="gray")

    # Set log scale x and y axes
    fig.update_xaxes(
        type="log",
        range=[-1, 2],
        tickvals=[0.1, 0.5, 1, 2, 4, 10, 100],
        ticktext=["0.1", "0.5", "1", "2", "4", "10", "100"],
        title_text="Average TOC (%)",
        gridcolor="#E2E8F0",
        zerolinecolor="#cbd5e1"
    )
    
    fig.update_yaxes(
        type="log",
        range=[-1, 2],
        tickvals=[0.1, 1, 2.5, 5, 10, 20, 100],
        ticktext=["0.1", "1", "2.5", "5", "10", "20", "100"],
        title_text="Average S2 (mg HC/g rock)",
        gridcolor="#E2E8F0",
        zerolinecolor="#cbd5e1"
    )

    # Reference Labels (Poor, Fair, Good, Very Good, Excellent)
    toc_annotations = [
        dict(x=0.22, y=1.02, xref='x', yref='paper', text='Poor', showarrow=False, font=dict(size=10, color='gray', bold=True)),
        dict(x=0.7, y=1.02, xref='x', yref='paper', text='Fair', showarrow=False, font=dict(size=10, color='gray', bold=True)),
        dict(x=1.4, y=1.02, xref='x', yref='paper', text='Good', showarrow=False, font=dict(size=10, color='gray', bold=True)),
        dict(x=2.8, y=1.02, xref='x', yref='paper', text='V. Good', showarrow=False, font=dict(size=10, color='gray', bold=True)),
        dict(x=20.0, y=1.02, xref='x', yref='paper', text='Excellent', showarrow=False, font=dict(size=10, color='gray', bold=True))
    ]
    
    s2_annotations = [
        dict(x=1.02, y=0.5, xref='paper', yref='y', text='Poor', showarrow=False, font=dict(size=10, color='gray', bold=True), textangle=90),
        dict(x=1.02, y=3.5, xref='paper', yref='y', text='Fair', showarrow=False, font=dict(size=10, color='gray', bold=True), textangle=90),
        dict(x=1.02, y=7.0, xref='paper', yref='y', text='Good', showarrow=False, font=dict(size=10, color='gray', bold=True), textangle=90),
        dict(x=1.02, y=14.0, xref='paper', yref='y', text='V. Good', showarrow=False, font=dict(size=10, color='gray', bold=True), textangle=90),
        dict(x=1.02, y=45.0, xref='paper', yref='y', text='Excellent', showarrow=False, font=dict(size=10, color='gray', bold=True), textangle=90)
    ]

    fig.update_layout(
        title=dict(
            text="S2 vs TOC Geochemical Richness & Potential Interpretation",
            font=dict(family="Inter, sans-serif", size=16, color="#0F172A", bold=True)
        ),
        annotations=toc_annotations + s2_annotations,
        margin=dict(l=80, r=80, t=100, b=80),
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='#FAFAFA',
        hovermode='closest',
        legend=dict(
            orientation='h',
            y=-0.15,
            xanchor='center',
            x=0.5,
            font=dict(family="Inter, sans-serif", size=10)
        )
    )
    
    return fig.to_plotly_json()
