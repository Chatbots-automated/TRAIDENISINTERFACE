import React, { useState, useEffect } from 'react';
import { X, FileText, Loader2 } from 'lucide-react';
import {
  getCommercialOffer,
  updateCommercialOffer,
  CommercialOffer,
} from '../lib/commercialOfferStorage';

interface CommercialOfferPanelProps {
  isOpen: boolean;
  onClose: () => void;
  threadId: string | null;
}

export default function CommercialOfferPanel({
  isOpen,
  onClose,
  threadId,
}: CommercialOfferPanelProps) {
  const [offer, setOffer] = useState<CommercialOffer | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFilling, setIsFilling] = useState(false);

  // Load offer when panel opens or threadId changes
  useEffect(() => {
    if (isOpen && threadId) {
      const storedOffer = getCommercialOffer(threadId);
      setOffer(storedOffer);
    }
  }, [isOpen, threadId]);

  // Handle field updates
  const handleFieldChange = (field: keyof Omit<CommercialOffer, 'createdAt' | 'updatedAt'>, value: string) => {
    if (!threadId || isFilling) return;

    setOffer((prev) => {
      if (!prev) return prev;
      return { ...prev, [field]: value };
    });

    // Save to localStorage
    updateCommercialOffer(threadId, { [field]: value });
  };

  // Handle Fill Doc button click
  const handleFillDoc = async () => {
    if (!offer || !threadId || isFilling) return;

    setIsFilling(true);

    try {
      const webhookUrl = 'https://n8n-self-host-gedarta.onrender.com/webhook-test/16bbcb4a-d49e-4590-883b-440eb952b3c6';

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query_type: 'generate_doc',
          thread_id: threadId,
          commercial_offer: {
            components: offer.components,
            tech_description: offer.techDescription,
            pricing: offer.pricing,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}`);
      }

      // Wait for and process the response
      const result = await response.text();
      console.log('Fill Doc response:', result);

      // You can add additional handling here based on the webhook response

    } catch (error) {
      console.error('Error calling Fill Doc webhook:', error);
    } finally {
      setIsFilling(false);
    }
  };

  // Handle click outside to close
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={handleBackdropClick}
      />

      {/* Slide-out Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-2xl bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-green-50 to-blue-50">
          <div className="flex items-center space-x-3">
            <FileText className="w-6 h-6 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900">Commercial Offer</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto h-[calc(100%-140px)]">
          {offer ? (
            <>
              {/* Components Section */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700">
                  Components (Komponentu sarasas)
                </label>
                <textarea
                  value={offer.components}
                  onChange={(e) => handleFieldChange('components', e.target.value)}
                  disabled={isFilling}
                  className={`w-full h-40 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all ${
                    isFilling ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''
                  }`}
                  placeholder="Components will appear here..."
                />
              </div>

              {/* Tech Description Section */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700">
                  Technological Description (Technologinis aprasymas)
                </label>
                <textarea
                  value={offer.techDescription}
                  onChange={(e) => handleFieldChange('techDescription', e.target.value)}
                  disabled={isFilling}
                  className={`w-full h-40 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all ${
                    isFilling ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''
                  }`}
                  placeholder="Technological description will appear here..."
                />
              </div>

              {/* Pricing Section */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700">
                  Pricing (Kainos)
                </label>
                <textarea
                  value={offer.pricing}
                  onChange={(e) => handleFieldChange('pricing', e.target.value)}
                  disabled={isFilling}
                  className={`w-full h-40 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all ${
                    isFilling ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''
                  }`}
                  placeholder="Pricing tiers will appear here..."
                />
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <FileText className="w-16 h-16 mb-4 opacity-30" />
              <p className="text-lg">No commercial offer available</p>
              <p className="text-sm mt-2">Accept a /Commercial response to populate this panel</p>
            </div>
          )}
        </div>

        {/* Footer with Fill Doc Button */}
        {offer && (
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 bg-white">
            <button
              onClick={handleFillDoc}
              disabled={isFilling}
              className="w-full flex items-center justify-center space-x-2 px-6 py-3 bg-gradient-to-r from-green-500 to-blue-500 text-white rounded-lg hover:from-green-600 hover:to-blue-600 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isFilling ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Generating Document...</span>
                </>
              ) : (
                <>
                  <FileText className="w-5 h-5" />
                  <span>Fill Doc</span>
                </>
              )}
            </button>
            {isFilling && (
              <p className="text-center text-sm text-gray-500 mt-2">
                This may take up to 2 minutes. Please wait...
              </p>
            )}
          </div>
        )}
      </div>

      {/* Loading overlay for the text areas */}
      {isFilling && (
        <style>{`
          @keyframes pulse-subtle {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
          }
          .filling-animation {
            animation: pulse-subtle 1.5s ease-in-out infinite;
          }
        `}</style>
      )}
    </>
  );
}
