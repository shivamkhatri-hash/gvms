from typing import Dict, Any, Optional


def safe_float(val: Any) -> Optional[float]:
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def calculate_derived_parameters(record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Central scientific equations library for Petroleum Geochemistry LIMS.
    Calculates derived variables from measured parameters (S1, S2, S3, PC, RC, TOC).
    Updates and mutates record keys in-place.
    """
    s1 = safe_float(record.get("s1"))
    s2 = safe_float(record.get("s2"))
    s3 = safe_float(record.get("s3"))
    pc = safe_float(record.get("pc"))
    rc = safe_float(record.get("rc"))
    toc = safe_float(record.get("toc"))

    # 1. Total Organic Carbon (TOC = PC + RC)
    # Automatically derive if TOC is not present but PC and RC exist
    if toc is None and pc is not None and rc is not None:
        toc = pc + rc
        record["toc"] = round(toc, 4)

    # 2. Production Index (PI = S1 / (S1 + S2))
    if s1 is not None and s2 is not None:
        denom = s1 + s2
        if denom > 0:
            record["pi"] = round(s1 / denom, 4)
        else:
            record["pi"] = None
    else:
        # Keep existing PI if present and no new inputs are available
        if "pi" not in record:
            record["pi"] = None

    # 3. Hydrogen Index (HI = (S2 / TOC) * 100)
    if s2 is not None and toc is not None and toc > 0:
        record["hi"] = round((s2 / toc) * 100, 4)
    else:
        if "hi" not in record:
            record["hi"] = None

    # 4. Oxygen Index (OI = (S3 / TOC) * 100)
    if s3 is not None and toc is not None and toc > 0:
        record["oi"] = round((s3 / toc) * 100, 4)
    else:
        if "oi" not in record:
            record["oi"] = None

    # 5. Oil Saturation Index (OSI = (S1 / TOC) * 100)
    if s1 is not None and toc is not None and toc > 0:
        record["osi"] = round((s1 / toc) * 100, 4)
    else:
        if "osi" not in record:
            record["osi"] = None

    # 6. S2/S3 Ratio (S2_S3 = S2 / S3)
    if s2 is not None and s3 is not None and s3 > 0:
        record["s2_s3"] = round(s2 / s3, 4)
    else:
        if "s2_s3" not in record:
            record["s2_s3"] = None

    # 7. Richness and Pyrolysis classifications for petroleum_data table integrity
    if toc is not None:
        if toc < 0.5:
            record["toc_classification"] = "Poor"
        elif 0.5 <= toc < 1.0:
            record["toc_classification"] = "Fair"
        elif 1.0 <= toc < 2.0:
            record["toc_classification"] = "Good"
        elif 2.0 <= toc <= 4.0:
            record["toc_classification"] = "Very Good"
        else:
            record["toc_classification"] = "Excellent"
    else:
        record["toc_classification"] = "Poor"  # Safe default to avoid DB constraint violation if completely missing

    if s2 is not None:
        if s2 < 2.5:
            record["s2_classification"] = "Poor"
        elif 2.5 <= s2 < 5.0:
            record["s2_classification"] = "Fair"
        elif 5.0 <= s2 < 10.0:
            record["s2_classification"] = "Good"
        elif 10.0 <= s2 <= 20.0:
            record["s2_classification"] = "Very Good"
        else:
            record["s2_classification"] = "Excellent"
    else:
        record["s2_classification"] = "Poor"  # Safe default

    return record


def calculate_chromatography_ratios(record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calculate derived chromatography biomarkers and ratios (Pr/Ph, OEP, CPI, Paq, C_Max, etc.).
    Mutates and updates record in-place.
    """
    pr = safe_float(record.get("pr"))
    ph = safe_float(record.get("ph"))
    nc17 = safe_float(record.get("nc17"))
    nc18 = safe_float(record.get("nc18"))
    nc21 = safe_float(record.get("nc21"))
    nc22 = safe_float(record.get("nc22"))
    nc28 = safe_float(record.get("nc28"))
    nc29 = safe_float(record.get("nc29"))
    nc27 = safe_float(record.get("nc27"))
    nc23 = safe_float(record.get("nc23"))
    nc25 = safe_float(record.get("nc25"))
    nc31 = safe_float(record.get("nc31"))
    
    # 1. PR_BY_PH = PR / PH
    if pr is not None and ph is not None and ph > 0:
        record["pr_by_ph"] = round(pr / ph, 4)
    else:
        record["pr_by_ph"] = None
        
    # 2. PR_BY_NC17 = PR / NC17
    if pr is not None and nc17 is not None and nc17 > 0:
        record["pr_by_nc17"] = round(pr / nc17, 4)
    else:
        record["pr_by_nc17"] = None
        
    # 3. PH_BY_NC18 = PH / NC18
    if ph is not None and nc18 is not None and nc18 > 0:
        record["ph_by_nc18"] = round(ph / nc18, 4)
    else:
        record["ph_by_nc18"] = None
        
    # 4. PR_NC17_BY_PH_NC18 = (PR / NC17) / (PH / NC18)
    pr_nc17 = record.get("pr_by_nc17")
    ph_nc18 = record.get("ph_by_nc18")
    if pr_nc17 is not None and ph_nc18 is not None and ph_nc18 > 0:
        record["pr_nc17_by_ph_nc18"] = round(pr_nc17 / ph_nc18, 4)
    else:
        record["pr_nc17_by_ph_nc18"] = None
        
    # 5. NC21_NC22_BY_NC28_NC29 = (NC21 + NC22) / (NC28 + NC29)
    if nc21 is not None and nc22 is not None and nc28 is not None and nc29 is not None:
        denom = nc28 + nc29
        if denom > 0:
            record["nc21_nc22_by_nc28_nc29"] = round((nc21 + nc22) / denom, 4)
        else:
            record["nc21_nc22_by_nc28_nc29"] = None
    else:
        record["nc21_nc22_by_nc28_nc29"] = None
            
    # 6. NC17_BY_NC29 = NC17 / NC29
    if nc17 is not None and nc29 is not None and nc29 > 0:
        record["nc17_by_nc29"] = round(nc17 / nc29, 4)
    else:
        record["nc17_by_nc29"] = None
        
    # 7. NC17_BY_NC27 = NC17 / NC27
    if nc17 is not None and nc27 is not None and nc27 > 0:
        record["nc17_by_nc27"] = round(nc17 / nc27, 4)
    else:
        record["nc17_by_nc27"] = None

    # 8. PAQ = (NC23 + NC25) / (NC23 + NC25 + NC29 + NC31)
    if nc23 is not None and nc25 is not None and nc29 is not None and nc31 is not None:
        denom = nc23 + nc25 + nc29 + nc31
        if denom > 0:
            record["paq"] = round((nc23 + nc25) / denom, 4)
        else:
            record["paq"] = None
    else:
        record["paq"] = None

    # 9. OEP_ODD_EVEN_PREF = (NC25 + 6*NC27 + NC29) / (4*NC26 + 4*NC28)
    nc26 = safe_float(record.get("nc26"))
    if nc25 is not None and nc26 is not None and nc27 is not None and nc28 is not None and nc29 is not None:
        denom = 4.0 * nc26 + 4.0 * nc28
        if denom > 0:
            record["oep_odd_even_pref"] = round((nc25 + 6.0 * nc27 + nc29) / denom, 4)
        else:
            record["oep_odd_even_pref"] = None
    else:
        record["oep_odd_even_pref"] = None

    # 10. CP_INDEX = 0.5 * ((NC25+NC27+NC29+NC31+NC33)/(NC24+NC26+NC28+NC30+NC32) + (NC25+NC27+NC29+NC31+NC33)/(NC26+NC28+NC30+NC32+NC34))
    odds = [safe_float(record.get(f"nc{i}")) for i in [25, 27, 29, 31, 33]]
    evens1 = [safe_float(record.get(f"nc{i}")) for i in [24, 26, 28, 30, 32]]
    evens2 = [safe_float(record.get(f"nc{i}")) for i in [26, 28, 30, 32, 34]]
    if all(x is not None for x in odds) and all(x is not None for x in evens1) and all(x is not None for x in evens2):
        # Safely convert to list of floats to satisfy the static type checker's overload signature
        clean_odds = [x for x in odds if x is not None]
        clean_evens1 = [x for x in evens1 if x is not None]
        clean_evens2 = [x for x in evens2 if x is not None]
        sum_odds = sum(clean_odds)
        sum_evens1 = sum(clean_evens1)
        sum_evens2 = sum(clean_evens2)
        if sum_evens1 > 0 and sum_evens2 > 0:
            record["cp_index"] = round(0.5 * ((sum_odds / sum_evens1) + (sum_odds / sum_evens2)), 4)
        else:
            record["cp_index"] = None
    else:
        record["cp_index"] = None

    # 11. C_MAX (Carbon number of maximum value among NC10 to NC40)
    max_val = -1.0
    max_carbon = None
    for i in range(10, 41):
        val = safe_float(record.get(f"nc{i}"))
        if val is not None and val > max_val:
            max_val = val
            max_carbon = float(i)
    record["c_max"] = max_carbon

    # 12. TA_RATIO (Taraxerol ratio, default to None or calculated if TA components are found)
    if "ta_ratio" not in record:
        record["ta_ratio"] = None

    return record


def calculate_oil_composition_ratios(record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calculate derived oil composition parameters (e.g. SAT_BY_ARO = SAT / AR).
    Mutates and updates record in-place.
    """
    sat = safe_float(record.get("sat"))
    ar = safe_float(record.get("ar"))
    
    # SAT_BY_ARO = SAT / AR
    if sat is not None and ar is not None and ar > 0:
        record["sat_by_aro"] = round(sat / ar, 4)
    else:
        if "sat_by_aro" not in record:
            record["sat_by_aro"] = None
            
    return record


def calculate_isotope_ratios(record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calculate derived stable isotope ratios (C1/(C2+C3), C2/C3, delC2-delC3, Ln(C2/C3), C1/C2, Ln(C1/C2)).
    Mutates and updates record in-place.
    """
    import math
    c1 = safe_float(record.get("c1"))
    c2 = safe_float(record.get("c2"))
    c3 = safe_float(record.get("c3"))
    delta_c2 = safe_float(record.get("delta_c2"))
    delta_c3 = safe_float(record.get("delta_c3"))

    # 1. c1_by_c2_plus_c3 = C1 / (C2 + C3)
    if c1 is not None and c2 is not None and c3 is not None:
        denom = c2 + c3
        if denom > 0:
            record["c1_by_c2_plus_c3"] = round(c1 / denom, 4)
        else:
            record["c1_by_c2_plus_c3"] = None
    else:
        record["c1_by_c2_plus_c3"] = None

    # 2. c2_by_c3 = C2 / C3
    if c2 is not None and c3 is not None and c3 > 0:
        record["c2_by_c3"] = round(c2 / c3, 4)
    else:
        record["c2_by_c3"] = None

    # 3. delta_c2_by_delta_c3 = delta_c2 - delta_c3
    if delta_c2 is not None and delta_c3 is not None:
        record["delta_c2_by_delta_c3"] = round(delta_c2 - delta_c3, 4)
    else:
        record["delta_c2_by_delta_c3"] = None

    # 4. ln_c2_by_c3 = ln(C2 / C3)
    if c2 is not None and c3 is not None and c3 > 0:
        val = c2 / c3
        if val > 0:
            record["ln_c2_by_c3"] = round(math.log(val), 8)
        else:
            record["ln_c2_by_c3"] = None
    else:
        record["ln_c2_by_c3"] = None

    # 5. c1_by_c2 = C1 / C2
    if c1 is not None and c2 is not None and c2 > 0:
        record["c1_by_c2"] = round(c1 / c2, 4)
    else:
        record["c1_by_c2"] = None

    # 6. ln_c1_by_c2 = ln(C1 / C2)
    if c1 is not None and c2 is not None and c2 > 0:
        val = c1 / c2
        if val > 0:
            record["ln_c1_by_c2"] = round(math.log(val), 8)
        else:
            record["ln_c1_by_c2"] = None
    else:
        record["ln_c1_by_c2"] = None

    return record


