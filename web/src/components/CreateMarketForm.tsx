'use client';

import { useState } from 'react';
import { createMarket } from '@/lib/blockchain';

interface CreateMarketFormProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreateMarketForm({ isOpen, onClose }: CreateMarketFormProps) {
  const [formData, setFormData] = useState({
    topic: '',
    description: '',
    question: '',
    endDate: '',
    endTime: '',
    initialLiquidity: '100',
    arbitrator: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    setStatus('');

    try {
      setStatus('Preparing transaction...');
      
      // Combine date and time for endTime
      const endDateTime = new Date(`${formData.endDate}T${formData.endTime}`);
      const endTimeUnix = Math.floor(endDateTime.getTime() / 1000);
      
      // Create full question with description
      const fullQuestion = `${formData.topic}: ${formData.description}`;
      
      setStatus('Creating market on blockchain...');
      await createMarket(fullQuestion, endTimeUnix, formData.initialLiquidity);
      
      setStatus('Market created successfully!');
      setTimeout(() => {
        alert('Market created successfully!');
        onClose();
        
        // Reset form
        setFormData({
          topic: '',
          description: '',
          question: '',
          endDate: '',
          endTime: '',
          initialLiquidity: '100',
          arbitrator: ''
        });
        setStatus('');
      }, 1000);
    } catch (err: any) {
      console.error('Market creation error:', err);
      setError(err.message || 'Failed to create market');
      setStatus('');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold text-gray-900">Create New Market</h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Topic */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Topic/Title *
            </label>
            <input
              type="text"
              required
              value={formData.topic}
              onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
              placeholder="e.g., Will Bitcoin reach $100k?"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description *
            </label>
            <textarea
              required
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
              rows={3}
              placeholder="Detailed description of the prediction market..."
            />
          </div>

          {/* Resolution Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Resolution Date *
              </label>
              <input
                type="date"
                required
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Time *
              </label>
              <input
                type="time"
                required
                value={formData.endTime}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
              />
            </div>
          </div>

          {/* Initial Liquidity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Initial Liquidity (USDC) *
            </label>
            <input
              type="number"
              required
              min="1"
              value={formData.initialLiquidity}
              onChange={(e) => setFormData({ ...formData, initialLiquidity: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
              placeholder="100"
            />
          </div>

          {/* Arbitrator */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Arbitrator Identity *
            </label>
            <input
              type="text"
              required
              value={formData.arbitrator}
              onChange={(e) => setFormData({ ...formData, arbitrator: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
              placeholder="e.g., CoinGecko, Official Exchange Data, etc."
            />
          </div>

          {/* Status Display */}
          {status && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
              <p className="text-sm text-blue-600">{status}</p>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-fuchsia-600 hover:bg-fuchsia-700 disabled:bg-gray-300 text-white py-2 px-4 rounded-md font-medium transition-colors"
          >
            {isSubmitting ? (status || 'Creating Market...') : 'Create Market'}
          </button>
        </form>

        {/* Info Note */}
        <div className="px-6 pb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <p className="text-xs text-blue-600">
              <strong>Note:</strong> This will create a YES/NO prediction market. Users can bet on either outcome with variable amounts.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}