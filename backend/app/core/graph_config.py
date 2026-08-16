# Static Graph Configurations for GVMS

GRAPH_CONFIGS = {
    # -------------------------------------------------------------
    # Pristane / Phytane laboratory graphs
    # -------------------------------------------------------------
    "pr_ph_crossplot": {
        "source_table": "DL_BIOMARKER_PR_PH_VW",
        "columns": ["name", "depth", "formation", "object", "pristane", "phytane", "pr_by_ph"]
    },
    "pr_ph_profile": {
        "source_table": "DL_BIOMARKER_PR_PH_VW",
        "columns": ["name", "depth", "formation", "object", "pr_by_ph"]
    },
    "pr_ph_distribution": {
        "source_table": "DL_BIOMARKER_PR_PH_VW",
        "columns": ["name", "depth", "formation", "object", "pristane", "phytane"]
    },

    # -------------------------------------------------------------
    # Aromatic Biomarkers laboratory graphs
    # -------------------------------------------------------------
    "aromatic_dbt_phe_vs_pr_ph": {
        "custom_query": """
            SELECT 
                a.UBHI, 
                a.FORMATION AS formation, 
                a.DEPTH AS depth, 
                a.NAME AS well_name,
                a.OBJECT AS object,
                a.DBT_BY_PHE AS dbt_by_phe, 
                p.PR_BY_PH AS pr_by_ph 
            FROM DL_BIOMARKER_AROMATIC_VW a
            JOIN DL_BIOMARKER_PR_PH_VW p 
              ON a.UBHI = p.UBHI AND ABS(a.DEPTH - p.DEPTH) < 1.5
        """,
        "columns": ["UBHI", "formation", "depth", "well_name", "object", "dbt_by_phe", "pr_by_ph"]
    },
    "aromatic_dbt_phe_dist": {
        "source_table": "DL_BIOMARKER_AROMATIC_VW",
        "columns": ["name", "depth", "formation", "object", "dbt_by_phe"]
    },
    "aromatic_vrc_depth": {
        "source_table": "DL_BIOMARKER_AROMATIC_VW",
        "columns": ["name", "depth", "formation", "object", "vrc"]
    },
    "aromatic_mpi_depth": {
        "source_table": "DL_BIOMARKER_AROMATIC_VW",
        "columns": ["name", "depth", "formation", "object", "mpi"]
    },
    "aromatic_plots": {
        "source_table": "DL_BIOMARKER_AROMATIC_VW",
        "columns": ["name", "depth", "formation", "object", "dbt_by_phe", "mpi", "vrc"]
    },

    # -------------------------------------------------------------
    # Sterane Biomarkers laboratory graphs
    # -------------------------------------------------------------
    "sterane_ternary": {
        "source_table": "DL_BIOMARKER_STERANE_VW",
        "columns": ["name", "depth_top", "formation", "object_no", "perc_c27_st", "perc_c28_st", "perc_c29_st"]
    },
    "sterane_c29_s_r": {
        "source_table": "DL_BIOMARKER_STERANE_VW",
        "columns": ["name", "depth_top", "formation", "object_no", "c29_s_by_s_plus_r"]
    },
    "sterane_c29_bb": {
        "source_table": "DL_BIOMARKER_STERANE_VW",
        "columns": ["name", "depth_top", "formation", "object_no", "c29_bb_by_aa_plus_bb"]
    },
    "sterane_diast_c27_c29": {
        "source_table": "DL_BIOMARKER_STERANE_VW",
        "columns": ["name", "depth_top", "formation", "object_no", "c27_diast_by_c29_diast"]
    },
    "sterane_st_c27_c29": {
        "source_table": "DL_BIOMARKER_STERANE_VW",
        "columns": ["name", "depth_top", "formation", "object_no", "c27_st_by_c29_st"]
    },
    "sterane_dias_c27": {
        "source_table": "DL_BIOMARKER_STERANE_VW",
        "columns": ["name", "depth_top", "formation", "object_no", "dias_c27_by_c27_plus_c29"]
    },
    "sterane_c28bbs_c29bbs": {
        "source_table": "DL_BIOMARKER_STERANE_VW",
        "columns": ["name", "depth_top", "formation", "object_no", "c28bbs_by_c29bbs_sterane"]
    },
    "sterane_c27r_c29r": {
        "source_table": "DL_BIOMARKER_STERANE_VW",
        "columns": ["name", "depth_top", "formation", "object_no", "c27r_by_c27r_plus_c29r"]
    },
    "sterane_plots": {
        "source_table": "DL_BIOMARKER_STERANE_VW",
        "columns": [
            "name", "depth_top", "formation", "object_no",
            "perc_c27_st", "perc_c28_st", "perc_c29_st",
            "c29_s_by_s_plus_r", "c29_bb_by_aa_plus_bb",
            "c27_diast_by_c29_diast", "c27_st_by_c29_st",
            "dias_c27_by_c27_plus_c29", "c28bbs_by_c29bbs_sterane",
            "c27r_by_c27r_plus_c29r"
        ]
    },
    "sterane_crossplot": {
        "custom_query": """
            SELECT 
                s.UBHI, 
                s.FORMATION AS formation, 
                s.DEPTH_TOP AS depth, 
                s.NAME AS well_name,
                s.OBJECT_NO AS object,
                s.C27R_BY_C27R_PLUS_C29R AS c27r_by_c27r_plus_c29r,
                p.PR_BY_PH AS pr_by_ph 
            FROM DL_BIOMARKER_STERANE_VW s
            JOIN DL_BIOMARKER_PR_PH_VW p 
              ON s.UBHI = p.UBHI AND ABS(s.DEPTH_TOP - p.DEPTH) < 1.5
        """,
        "columns": ["UBHI", "formation", "depth", "well_name", "object", "pr_by_ph", "c27r_by_c27r_plus_c29r"]
    },

    # -------------------------------------------------------------
    # Hopane Biomarkers laboratory graphs
    # -------------------------------------------------------------
    "hopane_crossplot": {
        "custom_query": """
            SELECT 
                h.UBHI, 
                h.FORMATION AS formation, 
                h.DEPTH_TOP AS depth, 
                h.NAME AS well_name,
                h.OBJECT_NO AS object,
                h.C29H_BY_C30H AS c29h_by_c30h,
                s.C29_DIASTERANE_INDEX AS c29_diasterane_index 
            FROM DL_BIOMARKER_HOPANE_VW h
            JOIN DL_BIOMARKER_STERANE_VW s 
              ON h.UBHI = s.UBHI AND ABS(h.DEPTH_TOP - s.DEPTH_TOP) < 1.5
        """,
        "columns": ["UBHI", "formation", "depth", "well_name", "object", "c29h_by_c30h", "c29_diasterane_index"]
    },
    "hopane_oleanane_bcd": {
        "source_table": "DL_BIOMARKER_HOPANE_VW",
        "columns": ["name", "depth_top", "formation", "object_no", "oleanane_index", "bcd_index"]
    },
    "hopane_c29h_diasterane": {
        "source_table": "DL_BIOMARKER_HOPANE_VW",
        "columns": ["name", "depth_top", "formation", "object_no", "c29h_by_c30h", "diahopane_index"]
    },
    "hopane_depth_profiles": {
        "source_table": "DL_BIOMARKER_HOPANE_VW",
        "columns": [
            "name", "depth_top", "formation", "object_no",
            "c31h_s_by_s_plus_r", "c32h_s_by_s_plus_r", "c33h_s_by_s_plus_r",
            "c34h_s_by_s_plus_r", "c35h_s_by_s_plus_r", "tm_by_ts",
            "c29ts_by_c29h_plus_c29ts", "c30_diahopane_by_c29ts", "c31hh_r_by_c30h"
        ]
    }
}
