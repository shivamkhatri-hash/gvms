/**
 * Global Plotly Layout and Export Configurations for GVMS
 */

export const sanitizeFileName = (title?: string): string => {
  if (!title) return 'gvms_chart_export';
  // Strip HTML tags if any (e.g. <b>...</b>)
  const plainText = title.replace(/<[^>]*>/g, '').trim();
  const clean = plainText.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return clean || 'gvms_chart_export';
};

export const GLOBAL_PLOTLY_EXPORT_CONFIG = {
  displayModeBar: 'hover' as 'hover' | boolean,
  responsive: true,
  toImageButtonOptions: {
    format: 'png' as 'png',
    filename: 'gvms_chart_export',
    height: 700,
    width: 950,
    scale: 2, // High resolution (1900x1400 pixels) white background PNGs
    setBackground: '#FFFFFF', // Guarantee solid white background in PNG exports
  },
};

export const GLOBAL_PLOTLY_LAYOUT_DEFAULTS = {
  // Solid white paper and plotting backgrounds to guarantee solid white pixels in PNG exports
  paper_bgcolor: '#FFFFFF',
  plot_bgcolor: '#FFFFFF',
  
  // High contrast standard typography
  font: {
    family: 'Inter, system-ui, -apple-system, sans-serif',
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
    linecolor: '#000000',
    linewidth: 2,
    mirror: true,
  };
};

export const getPlotlyExportConfig = (title?: string, customConfig?: any) => {
  const cleanFilename = sanitizeFileName(title);
  return {
    ...GLOBAL_PLOTLY_EXPORT_CONFIG,
    ...customConfig,
    toImageButtonOptions: {
      ...GLOBAL_PLOTLY_EXPORT_CONFIG.toImageButtonOptions,
      filename: cleanFilename,
      ...(customConfig?.toImageButtonOptions || {}),
    },
  };
};

/**
 * Applies the global layout defaults to any Plotly layout object
 * Enforces centered graph titles below the X-axis with small font size for snapshot capture
 */
export const applyGlobalLayoutDefaults = (layout: any, defaultTitle?: string) => {
  const updatedLayout: any = {
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

  // Format Graph Title: Center alignment (x: 0.5, xanchor: center) positioned below the X-axis with small font size
  const rawTitle = (typeof layout.title === 'string' ? layout.title : (layout.title?.text || '')) || defaultTitle || '';
  const titleObj = typeof layout.title === 'object' ? layout.title : {};
  
  if (rawTitle) {
    updatedLayout.title = {
      ...titleObj,
      text: `<b>${rawTitle.replace(/<[^>]*>/g, '')}</b>`,
      x: 0.5,
      xanchor: 'center',
      y: titleObj.y !== undefined && titleObj.y < 0.5 ? titleObj.y : 0.01,
      yanchor: titleObj.yanchor !== undefined && titleObj.yanchor !== 'top' ? titleObj.yanchor : 'bottom',
      pad: {
        b: 2,
        t: 2,
        ...(titleObj.pad || {})
      },
      font: {
        family: 'Inter, system-ui, -apple-system, sans-serif',
        size: 11,
        color: '#475569',
        weight: 'bold' as any,
        ...(titleObj.font || {})
      },
    };
  }

  const existingMargin = layout.margin || {};
  // Guarantee sufficient bottom margin for x-axis label + small title, and clean top margin
  updatedLayout.margin = {
    l: Math.max(existingMargin.l || 0, 70),
    r: Math.max(existingMargin.r || 0, 40),
    t: existingMargin.t !== undefined ? existingMargin.t : 35,
    b: Math.max(existingMargin.b || 0, 75),
    ...existingMargin,
  };
  
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

    updatedLayout.margin.b = Math.max(updatedLayout.margin.b || 0, 100);
  }

  return updatedLayout;
};

