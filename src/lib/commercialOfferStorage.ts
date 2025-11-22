// Commercial Offer localStorage management
// Max 12 entries, FIFO cleanup when limit exceeded

const STORAGE_KEY = 'commercial_offers';
const LATEST_MESSAGE_KEY = 'commercial_latest_messages';
const ACCEPTED_MESSAGE_KEY = 'commercial_accepted_messages';
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

// Store for latest commercial message ID per thread
interface LatestMessagesStore {
  [threadId: string]: string;
}

// Store for accepted message IDs per thread
interface AcceptedMessagesStore {
  [threadId: string]: string[];
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

// ============================================
// Latest Commercial Message Tracking
// ============================================

// Get all latest message IDs
function getAllLatestMessages(): LatestMessagesStore {
  try {
    const stored = localStorage.getItem(LATEST_MESSAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error('Error reading latest messages from localStorage:', error);
    return {};
  }
}

// Set the latest commercial message ID for a thread
export function setLatestCommercialMessageId(threadId: string, messageId: string): void {
  const latestMessages = getAllLatestMessages();
  latestMessages[threadId] = messageId;

  try {
    localStorage.setItem(LATEST_MESSAGE_KEY, JSON.stringify(latestMessages));
  } catch (error) {
    console.error('Error saving latest message ID:', error);
  }
}

// Get the latest commercial message ID for a thread
export function getLatestCommercialMessageId(threadId: string): string | null {
  const latestMessages = getAllLatestMessages();
  return latestMessages[threadId] || null;
}

// Check if a message is the latest commercial message for its thread
export function isLatestCommercialMessage(threadId: string, messageId: string): boolean {
  return getLatestCommercialMessageId(threadId) === messageId;
}

// Clear latest message ID for a thread (called during FIFO cleanup)
function clearLatestCommercialMessageId(threadId: string): void {
  const latestMessages = getAllLatestMessages();
  delete latestMessages[threadId];

  try {
    localStorage.setItem(LATEST_MESSAGE_KEY, JSON.stringify(latestMessages));
  } catch (error) {
    console.error('Error clearing latest message ID:', error);
  }
}

// ============================================
// Accepted Messages Tracking
// ============================================

// Get all accepted messages
function getAllAcceptedMessages(): AcceptedMessagesStore {
  try {
    const stored = localStorage.getItem(ACCEPTED_MESSAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error('Error reading accepted messages from localStorage:', error);
    return {};
  }
}

// Add a message to the accepted list for a thread
export function addAcceptedMessageId(threadId: string, messageId: string): void {
  const acceptedMessages = getAllAcceptedMessages();

  if (!acceptedMessages[threadId]) {
    acceptedMessages[threadId] = [];
  }

  if (!acceptedMessages[threadId].includes(messageId)) {
    acceptedMessages[threadId].push(messageId);
  }

  try {
    localStorage.setItem(ACCEPTED_MESSAGE_KEY, JSON.stringify(acceptedMessages));
  } catch (error) {
    console.error('Error saving accepted message ID:', error);
  }
}

// Check if a message has been accepted
export function isMessageAccepted(threadId: string, messageId: string): boolean {
  const acceptedMessages = getAllAcceptedMessages();
  return acceptedMessages[threadId]?.includes(messageId) || false;
}

// Get all accepted message IDs for a thread
export function getAcceptedMessageIds(threadId: string): string[] {
  const acceptedMessages = getAllAcceptedMessages();
  return acceptedMessages[threadId] || [];
}

// Check if a thread has any accepted messages (used to detect first accept)
export function hasAcceptedMessages(threadId: string): boolean {
  const acceptedMessages = getAllAcceptedMessages();
  return (acceptedMessages[threadId]?.length || 0) > 0;
}

// Clear accepted messages for a thread (called during FIFO cleanup)
function clearAcceptedMessagesForThread(threadId: string): void {
  const acceptedMessages = getAllAcceptedMessages();
  delete acceptedMessages[threadId];

  try {
    localStorage.setItem(ACCEPTED_MESSAGE_KEY, JSON.stringify(acceptedMessages));
  } catch (error) {
    console.error('Error clearing accepted messages:', error);
  }
}

// ============================================
// Cleanup function for FIFO removal
// ============================================

// Clean up all related data for deleted threads
export function cleanupDeletedThreads(deletedThreadIds: string[]): void {
  for (const threadId of deletedThreadIds) {
    clearLatestCommercialMessageId(threadId);
    clearAcceptedMessagesForThread(threadId);
  }
}
