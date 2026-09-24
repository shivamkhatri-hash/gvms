import Plotly from 'plotly.js-dist-min';

export interface GraphSnapshot {
  title: string;
  image_base64: string;
}

/**
 * Capture high-resolution PNG snapshots directly from all active Plotly charts
 * currently rendered on the browser page.
 */
export async function captureAllPlotlySnapshots(options?: {
  width?: number;
  height?: number;
  scale?: number;
}): Promise<GraphSnapshot[]> {
  const width = options?.width || 1200;
  const height = options?.height || 750;
  const scale = options?.scale || 2;

  const snapshots: GraphSnapshot[] = [];
  const plotElements = document.querySelectorAll('.js-plotly-plot');

  for (let i = 0; i < plotElements.length; i++) {
    const el = plotElements[i] as any;
    try {
      // Find associated title from layout, header, or card
      let title = `Visualization Plot ${i + 1}`;
      if (el.layout?.title) {
        if (typeof el.layout.title === 'string') {
          title = el.layout.title.replace(/<[^>]*>/g, '').trim();
        } else if (typeof el.layout.title.text === 'string') {
          title = el.layout.title.text.replace(/<[^>]*>/g, '').trim();
        }
      }

      if (!title || title === `Visualization Plot ${i + 1}`) {
        const parentCard = el.closest('.card') || el.closest('[class*="Card"]') || el.parentElement;
        const cardHeading = parentCard?.querySelector('h1, h2, h3, h4, h5, [class*="font-bold"]');
        if (cardHeading && cardHeading.textContent) {
          title = cardHeading.textContent.trim();
        }
      }

      // Generate base64 PNG data URL directly from Plotly
      const dataUrl = await Plotly.toImage(el, {
        format: 'png',
        width,
        height,
        scale,
      });

      if (dataUrl && dataUrl.startsWith('data:image')) {
        snapshots.push({
          title,
          image_base64: dataUrl,
        });
      }
    } catch (err) {
      console.warn(`Could not snapshot plot element #${i}:`, err);
    }
  }

  return snapshots;
}
