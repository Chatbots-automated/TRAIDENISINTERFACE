/**
 * Offer Parameters Service
 * Manages per-conversation offer parameters with localStorage persistence.
 * These parameters are user-editable fields that accompany the commercial offer.
 */

export interface OfferParameter {
  key: string;
  label: string;
  defaultValue: string;
  group: 'object' | 'contamination' | 'afterCleaning';
}

export const OFFER_PARAMETER_DEFINITIONS: OfferParameter[] = [
  // Object info
  { key: 'object_sentence', label: 'Sakinys apie objektą', defaultValue: '', group: 'object' },
  { key: 'waste_contamination_parameters', label: 'Nuotekų užterštumo parametrai', defaultValue: 'nenurodyta', group: 'object' },
  { key: 'cleaned_water_requirements', label: 'Išvalyto vandens reikalavimai', defaultValue: 'pagal nuotekų tvarkymo reglamentą.', group: 'object' },

  // Contamination parameters (before cleaning)
  { key: 'BDS_reglamentORprovided', label: 'BDS7', defaultValue: '460 mgO2/l', group: 'contamination' },
  { key: 'SM_reglamentORprovided', label: 'SM', defaultValue: '465 mg/l', group: 'contamination' },
  { key: 'N_reglamentORprovided', label: 'Nb', defaultValue: '80 mg/l', group: 'contamination' },
  { key: 'P_reglamentORprovided', label: 'Pb', defaultValue: '15 mg/l', group: 'contamination' },

  // After cleaning parameters
  { key: 'BDS_aftercleaning', label: 'BDS7', defaultValue: 'BDS7 < 20 mg/l', group: 'afterCleaning' },
  { key: 'SM_aftercleaning', label: 'SM', defaultValue: 'SM < 30 mg/l', group: 'afterCleaning' },
  { key: 'N_aftercleaning', label: 'Nb', defaultValue: 'Nb < 20 mg/l', group: 'afterCleaning' },
  { key: 'P_aftercleaning', label: 'Pb', defaultValue: 'Pb <2 mg/l', group: 'afterCleaning' },
];

const STORAGE_PREFIX = 'traidenis_offer_params_';

/**
 * Get default values for all offer parameters
 */
export const getDefaultOfferParameters = (): Record<string, string> => {
  const defaults: Record<string, string> = {};
  for (const param of OFFER_PARAMETER_DEFINITIONS) {
    defaults[param.key] = param.defaultValue;
  }
  return defaults;
};

/**
 * Load offer parameters for a conversation from localStorage
 */
export const loadOfferParameters = (conversationId: string): Record<string, string> => {
  const defaults = getDefaultOfferParameters();
  try {
    const stored = localStorage.getItem(`${STORAGE_PREFIX}${conversationId}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...defaults, ...parsed };
    }
  } catch (e) {
    console.error('[OfferParams] Error loading parameters:', e);
  }
  return defaults;
};

/**
 * Save offer parameters for a conversation to localStorage
 */
export const saveOfferParameters = (conversationId: string, params: Record<string, string>): void => {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${conversationId}`, JSON.stringify(params));
  } catch (e) {
    console.error('[OfferParams] Error saving parameters:', e);
  }
};

/**
 * Update a single offer parameter
 */
export const updateOfferParameter = (
  conversationId: string,
  key: string,
  value: string,
  currentParams: Record<string, string>
): Record<string, string> => {
  const updated = { ...currentParams, [key]: value };
  saveOfferParameters(conversationId, updated);
  return updated;
};
