import { User } from '../types';

export const LAB_MAP: Record<string, { id: string; name: string; taskLabel: string }> = {
  'source-rock': { id: 'source-rock', name: 'Core Lab', taskLabel: 'Core Lab' },
  'core': { id: 'source-rock', name: 'Core Lab', taskLabel: 'Core Lab' },
  'oil': { id: 'oil', name: 'Oil Lab', taskLabel: 'Oil Lab' },
  'isotope': { id: 'isotope', name: 'Isotope Lab', taskLabel: 'Isotope Lab' },
  'biomarker': { id: 'biomarker', name: 'Biomarker Lab', taskLabel: 'Biomarker Lab' },
  'igc': { id: 'igc', name: 'Inorganic Lab', taskLabel: 'Inorganic Lab' },
  'surface': { id: 'surface', name: 'Surface Lab', taskLabel: 'Surface Lab' },
  'analytics': { id: 'analytics', name: 'Analytics', taskLabel: 'Analytics' },
  'administration': { id: 'administration', name: 'Administration', taskLabel: 'Administration' },
};

export const hasLabAccess = (user: User | null, labIdentifier: string): boolean => {
  if (!user) return false;
  
  // Administrator has unrestricted global access to all laboratories
  if (user.role === 'admin') return true;

  const tasks = user.assigned_tasks || [];
  
  // Explicit wildcard grant
  if (tasks.some(t => t.toLowerCase() === 'all modules' || t.toLowerCase() === 'all')) {
    return true;
  }

  // If user has no specific assigned tasks, give default access to Core Lab
  if (tasks.length === 0) {
    return labIdentifier === 'source-rock' || labIdentifier === 'core' || labIdentifier === 'Core Lab';
  }

  const normalizedTasks = tasks.map(t => t.toLowerCase().trim());
  const target = labIdentifier.toLowerCase().trim();

  // Core Lab / Source Rock / Pyrolysis
  if (target.includes('source-rock') || target.includes('core') || target.includes('cutting') || target === 'geochemistry') {
    return normalizedTasks.some(t => 
      t.includes('core') || 
      t.includes('source rock') || 
      t.includes('pyrolysis') || 
      t.includes('geochemistry interpretation')
    );
  }

  // Oil Lab / Gas Chromatography / Oil Composition
  if (target.includes('oil') || target.includes('chromatography') || target.includes('cross-plot') || target.includes('sara')) {
    return normalizedTasks.some(t => 
      t.includes('oil') || 
      t.includes('chromatography') || 
      t.includes('gc')
    );
  }

  // Biomarker Lab
  if (target.includes('biomarker') || target.includes('sterane') || target.includes('hopane') || target.includes('tricyclic') || target.includes('aromatic') || target.includes('pr-ph')) {
    return normalizedTasks.some(t => 
      t.includes('biomarker') || 
      t.includes('sterane') || 
      t.includes('hopane') ||
      t.includes('maturity')
    );
  }

  // Isotope Lab
  if (target.includes('isotope') || target.includes('csia') || target.includes('bernard')) {
    return normalizedTasks.some(t => 
      t.includes('isotope') || 
      t.includes('bernard') || 
      t.includes('csia')
    );
  }

  // Surface Lab / Microbiology
  if (target.includes('surface') || target.includes('microbiology') || target.includes('mber')) {
    return normalizedTasks.some(t => 
      t.includes('surface') || 
      t.includes('microbiology') || 
      t.includes('mber')
    );
  }

  // Inorganic Lab / IGC
  if (target.includes('igc') || target.includes('inorganic') || target.includes('metal') || target.includes('trace')) {
    return normalizedTasks.some(t => 
      t.includes('inorganic') || 
      t.includes('igc') || 
      t.includes('metal')
    );
  }

  // Analytics / Metabase / Dynamic Geochem
  if (target.includes('analytics') || target.includes('metabase') || target.includes('dynamic')) {
    return normalizedTasks.some(t => 
      t.includes('analytics') || 
      t.includes('metabase') || 
      t.includes('dynamic') ||
      t.includes('query')
    );
  }

  // Administration / Users / Audit Logs
  if (target.includes('admin') || target.includes('user') || target.includes('log')) {
    return normalizedTasks.some(t => t.includes('admin') || t.includes('access control'));
  }

  return normalizedTasks.some(t => t.includes(target) || target.includes(t));
};

export const getFirstAccessibleRoute = (user: User | null): string => {
  if (!user) return '/login';
  if (user.role === 'admin') return '/';

  if (hasLabAccess(user, 'source-rock')) return '/';
  if (hasLabAccess(user, 'oil')) return '/oil/dashboard';
  if (hasLabAccess(user, 'biomarker')) return '/biomarker/sterane-dashboard';
  if (hasLabAccess(user, 'isotope')) return '/isotope/dashboard';
  if (hasLabAccess(user, 'surface')) return '/surface/dashboard';
  if (hasLabAccess(user, 'igc')) return '/igc/dashboard';
  if (hasLabAccess(user, 'analytics')) return '/dynamic-dashboard';
  if (hasLabAccess(user, 'administration')) return '/users';
  return '/reports';
};
