import {
  LayoutDashboard,
  Database,
  UploadCloud,
  FileText,
  BarChart3,
  Layers,
  LucideIcon
} from 'lucide-react';

export interface LabMenuItem {
  label: string;
  path: string;
  icon: LucideIcon;
  roles: string[];
}

export interface Laboratory {
  id: string;
  name: string;
  emoji: string;
  isComingSoon: boolean;
  items: LabMenuItem[];
}

export const laboratories: Laboratory[] = [
  {
    id: 'source-rock',
    name: 'Source Rock Laboratory',
    emoji: '🧪',
    isComingSoon: false,
    items: [
      { label: 'Core', path: '/?dataset=core', icon: LayoutDashboard, roles: ['admin', 'researcher', 'viewer'] },
      { label: 'Cutting', path: '/?dataset=cutting', icon: LayoutDashboard, roles: ['admin', 'researcher', 'viewer'] },
    ]
  },
  {
    id: 'oil',
    name: 'Oil Laboratory',
    emoji: '🛢️',
    isComingSoon: false,
    items: [
      { label: 'Gas Chromatography', path: '/oil/dashboard', icon: LayoutDashboard, roles: ['admin', 'researcher', 'viewer'] },
      { label: 'Oil Composition', path: '/oil/composition-dashboard', icon: LayoutDashboard, roles: ['admin', 'researcher', 'viewer'] },
    ]
  },
  {
    id: 'isotope',
    name: 'Stable Isotope Laboratory',
    emoji: '🔬',
    isComingSoon: false,
    items: [
      { label: 'CSIA Isotope', path: '/isotope/dashboard?dataset=csia_isotope', icon: LayoutDashboard, roles: ['admin', 'researcher', 'viewer'] },
      { label: 'Oil Isotope', path: '/isotope/dashboard?dataset=oil_isotope', icon: LayoutDashboard, roles: ['admin', 'researcher', 'viewer'] },
      { label: 'Gas Isotope', path: '/isotope/dashboard?dataset=gas_isotope', icon: LayoutDashboard, roles: ['admin', 'researcher', 'viewer'] },
    ]
  },
  {
    id: 'biomarker',
    name: 'Biomarker Laboratory',
    emoji: '🧬',
    isComingSoon: false,
    items: [
      { label: 'Sterane', path: '/biomarker/sterane-dashboard', icon: LayoutDashboard, roles: ['admin', 'researcher', 'viewer'] },
      { label: 'Hopane', path: '/biomarker/hopane-dashboard', icon: LayoutDashboard, roles: ['admin', 'researcher', 'viewer'] },
      { label: 'Tricyclic Terpane', path: '/biomarker/tricyclic-dashboard', icon: LayoutDashboard, roles: ['admin', 'researcher', 'viewer'] },
      { label: 'Aromatic Biomarkers', path: '/biomarker/aromatic-dashboard', icon: LayoutDashboard, roles: ['admin', 'researcher', 'viewer'] },
      { label: 'Pristane / Phytane', path: '/biomarker/pr-ph-dashboard', icon: LayoutDashboard, roles: ['admin', 'researcher', 'viewer'] },
    ]
  },
  {
    id: 'igc',
    name: 'IGC / CCUS / Inorganic Geochemistry Laboratory',
    emoji: '🌋',
    isComingSoon: false,
    items: [
      { label: 'metal lab', path: '/igc/dashboard?dataset=trace_metal_', icon: LayoutDashboard, roles: ['admin', 'researcher', 'viewer'] }
    ]
  },
  {
    id: 'surface',
    name: 'Surface Geochemistry / MBER',
    emoji: '🧫',
    isComingSoon: false,
    items: [
      { label: 'Microbiology Data', path: '/surface/dashboard?dataset=microbiology', icon: LayoutDashboard, roles: ['admin', 'researcher', 'viewer'] }
    ]
  }
];
