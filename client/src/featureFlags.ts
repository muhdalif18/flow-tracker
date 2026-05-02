export interface FeatureFlag {
  key: string;
  label: string;
  description: string;
}

export const FEATURE_FLAGS: FeatureFlag[] = [
  {
    key: 'ft_group_overview',
    label: 'Group Overview',
    description: 'Adds a "Group" scope toggle on the Overview tab to aggregate stats across all flows in the same group.',
  },
];

export function getFlag(key: string): boolean {
  return localStorage.getItem(key) === '1';
}

export function setFlag(key: string, value: boolean): void {
  if (value) localStorage.setItem(key, '1');
  else localStorage.removeItem(key);
}
