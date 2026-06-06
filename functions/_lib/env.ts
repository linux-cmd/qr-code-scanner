export function envFlag(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined || value.trim() === '') {
    return defaultValue;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}
