// Preserve business data while removing credentials left by previous releases.
export function scrubLegacyPasswords(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
): boolean {
  const key = 'bon_elagouz_erp_state_v3';
  const raw = storage.getItem(key);
  if (!raw) return false;
  const value = JSON.parse(raw);
  if (!Array.isArray(value?.partners)) return false;
  if (
    !value.partners.some((partner: object) =>
      Object.prototype.hasOwnProperty.call(partner, 'password'),
    )
  )
    return false;
  value.partners = value.partners.map((partner: Record<string, unknown>) => {
    const { password: removed, ...profile } = partner;
    return profile;
  });
  storage.setItem(key, JSON.stringify(value));
  return true;
}
