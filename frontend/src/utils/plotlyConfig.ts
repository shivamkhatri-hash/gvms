/**
 * Global Plotly Layout and Export Configurations for GVMS
 */

export const GLOBAL_PLOTLY_EXPORT_CONFIG = {
  displayModeBar: 'hover' as 'hover' | boolean,
  responsive: true,
  toImageButtonOptions: {
    format: 'png' as 'png',
    filename: 'gvms_chart_export',
    height: 600,
    width: 800,
    scale: 2, // High resolution (1600x1200 pixels) white background PNGs
    setBackground: '#FFFFFF', // Guarantee solid white background in PNG exports
  },
};

export const GLOBAL_PLOTLY_LAYOUT_DEFAULTS = {
  // Solid white paper and plotting backgrounds to guarantee solid white pixels in PNG exports
  paper_bgcolor: '#FFFFFF',
  plot_bgcolor: '#FFFFFF',
  
  // High contrast standard typography
  font: {
    family: 'Inter, sans-serif',
    color: '#0F172A',
  },
};

/**
 * Appends standard professional borders to Plotly axes configurations
 */
export const applyProfessionalBorder = (axisConfig: any) => {
  return {
    ...axisConfig,
    showline: true,
    linecolor: '#000000', // slate-400 boundary line
    linewidth: 2,
    mirror: true, // mirrors the boundary line to opposite side to create a closed box border
  };
};

/**
 * Applies the global layout defaults to any Plotly layout object
 */
export const applyGlobalLayoutDefaults = (layout: any) => {
  const updatedLayout = {
    ...layout,
    ...GLOBAL_PLOTLY_LAYOUT_DEFAULTS,
    // Apply borders to x-axis and y-axis
    xaxis: applyProfessionalBorder(layout.xaxis || {}),
    yaxis: applyProfessionalBorder(layout.yaxis || {}),
  };

  // If there's a yaxis2 (e.g. dual axes), apply it there too
  if (layout.yaxis2) {
    updatedLayout.yaxis2 = applyProfessionalBorder(layout.yaxis2);
  }
  if (layout.xaxis2) {
    updatedLayout.xaxis2 = applyProfessionalBorder(layout.xaxis2);
  }
  
  // Force legends horizontally centered below the graph
  if (layout.showlegend !== false && updatedLayout.showlegend !== false) {
    const existingLegend = layout.legend || {};
    updatedLayout.legend = {
      orientation: 'h' as any,
      x: 0.5,
      y: -0.22,
      xanchor: 'center' as any,
      yanchor: 'top' as any,
      bordercolor: '#cbd5e1',
      borderwidth: 1,
      ...existingLegend
    };

    const existingMargin = layout.margin || {};
    updatedLayout.margin = {
      l: 60,
      r: 30,
      t: 50,
      ...existingMargin,
      b: Math.max(existingMargin.b || 0, 100)
    };
  }

  return updatedLayout;
};
