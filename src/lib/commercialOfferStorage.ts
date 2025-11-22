// Commercial Offer localStorage management
// Max 12 entries, FIFO cleanup when limit exceeded

const STORAGE_KEY = 'commercial_offers';
const MAX_ENTRIES = 12;

export interface CommercialOffer {
  components: string;
  techDescription: string;
  pricing: string;
  createdAt: string;
  updatedAt: string;
}

interface CommercialOffersStore {
  [threadId: string]: CommercialOffer;
}

// Get all commercial offers from localStorage
export function getAllCommercialOffers(): CommercialOffersStore {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error('Error reading commercial offers from localStorage:', error);
    return {};
  }
}

// Get commercial offer for a specific thread
export function getCommercialOffer(threadId: string): CommercialOffer | null {
  const offers = getAllCommercialOffers();
  return offers[threadId] || null;
}

// Check if a commercial offer exists for a thread
export function hasCommercialOffer(threadId: string): boolean {
  const offers = getAllCommercialOffers();
  return threadId in offers;
}

// Save commercial offer for a thread
// Returns array of deleted thread IDs if any were removed due to limit
export function saveCommercialOffer(threadId: string, offer: Omit<CommercialOffer, 'createdAt' | 'updatedAt'>): string[] {
  const offers = getAllCommercialOffers();
  const deletedThreadIds: string[] = [];
  const now = new Date().toISOString();

  // If updating existing, keep createdAt
  const existingOffer = offers[threadId];

  offers[threadId] = {
    ...offer,
    createdAt: existingOffer?.createdAt || now,
    updatedAt: now,
  };

  // Check if we exceed the limit (only count if this is a new entry)
  if (!existingOffer) {
    const entries = Object.entries(offers);

    // Sort by createdAt to find oldest entries
    if (entries.length > MAX_ENTRIES) {
      const sortedEntries = entries.sort((a, b) =>
        new Date(a[1].createdAt).getTime() - new Date(b[1].createdAt).getTime()
      );

      // Remove oldest entries until we're at the limit
      while (sortedEntries.length > MAX_ENTRIES) {
        const [oldestThreadId] = sortedEntries.shift()!;
        delete offers[oldestThreadId];
        deletedThreadIds.push(oldestThreadId);
      }
    }
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(offers));
  } catch (error) {
    console.error('Error saving commercial offer to localStorage:', error);
  }

  return deletedThreadIds;
}

// Update a specific field of a commercial offer
export function updateCommercialOffer(
  threadId: string,
  updates: Partial<Omit<CommercialOffer, 'createdAt' | 'updatedAt'>>
): boolean {
  const offers = getAllCommercialOffers();

  if (!offers[threadId]) {
    return false;
  }

  offers[threadId] = {
    ...offers[threadId],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(offers));
    return true;
  } catch (error) {
    console.error('Error updating commercial offer:', error);
    return false;
  }
}

// Delete commercial offer for a thread
export function deleteCommercialOffer(threadId: string): boolean {
  const offers = getAllCommercialOffers();

  if (!offers[threadId]) {
    return false;
  }

  delete offers[threadId];

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(offers));
    return true;
  } catch (error) {
    console.error('Error deleting commercial offer:', error);
    return false;
  }
}

// Get count of stored offers
export function getCommercialOfferCount(): number {
  const offers = getAllCommercialOffers();
  return Object.keys(offers).length;
}

// Parse agent response into commercial offer sections
export function parseAgentResponse(response: string): Omit<CommercialOffer, 'createdAt' | 'updatedAt'> {
  // Default empty values
  let components = '';
  let techDescription = '';
  let pricing = '';

  // Try to extract sections from the response
  // Looking for patterns like "Komponentu sarasas:" or "Komponentų sąrašas:"
  const lines = response.split('\n');
  let currentSection = '';

  for (const line of lines) {
    const lowerLine = line.toLowerCase().trim();

    // Detect section headers
    if (lowerLine.includes('komponent') && (lowerLine.includes('saras') || lowerLine.includes('sąraš'))) {
      currentSection = 'components';
      continue;
    } else if (lowerLine.includes('technolog') && (lowerLine.includes('apras') || lowerLine.includes('aprašym'))) {
      currentSection = 'techDescription';
      continue;
    } else if (lowerLine.includes('pigiau') || lowerLine.includes('standartin') || lowerLine.includes('brangiau') || lowerLine.includes('kain')) {
      currentSection = 'pricing';
    }

    // Add line to appropriate section
    if (currentSection === 'components') {
      components += line + '\n';
    } else if (currentSection === 'techDescription') {
      techDescription += line + '\n';
    } else if (currentSection === 'pricing') {
      pricing += line + '\n';
    }
  }

  // If parsing failed, put everything in components as fallback
  if (!components && !techDescription && !pricing) {
    components = response;
  }

  return {
    components: components.trim(),
    techDescription: techDescription.trim(),
    pricing: pricing.trim(),
  };
}
