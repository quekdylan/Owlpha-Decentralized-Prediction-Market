'use client';

import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { createMarket } from '@/lib/blockchain';
import { validateMarketWithGemini, type SettlementAnalysis } from '@/lib/gemini';

interface CreateMarketFormProps {
  isOpen: boolean;
  onClose: () => void;
}


export default function CreateMarketForm({ isOpen, onClose }: CreateMarketFormProps) {
  const [formData, setFormData] = useState({
    question: '',
    expireDate: '',
    expireTime: '',
    initialLiquidity: '100'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState('');
  const [settlementAnalysis, setSettlementAnalysis] = useState<SettlementAnalysis | null>(null);
  const [validationError, setValidationError] = useState('');
  const [walletBalance, setWalletBalance] = useState<string>('0.00');
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  // Fetch wallet balance when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchWalletBalance();
    }
  }, [isOpen]);

  const fetchWalletBalance = async () => {
    try {
      setIsLoadingBalance(true);
      
      if (typeof window.ethereum === 'undefined') {
        setWalletBalance('0.00');
        return;
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      
      // For now, we'll show ETH balance instead of USDC since we don't have USDC token contract
      // In a real implementation, you'd check USDC token balance
      const balance = await provider.getBalance(address);
      const balanceInETH = ethers.formatEther(balance);
      setWalletBalance(parseFloat(balanceInETH).toFixed(4));
      
    } catch (error) {
      console.error('Failed to fetch wallet balance:', error);
      setWalletBalance('0.00');
    } finally {
      setIsLoadingBalance(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsValidating(true);
    setError('');
    setValidationError('');
    setSettlementAnalysis(null);

    try {
      // Call real Gemini LLM for validation
      const analysis = await validateMarketWithGemini(
        formData.question,
        formData.expireDate,
        formData.expireTime
      );

      setSettlementAnalysis(analysis);
      setIsValidating(false);
      
      if (analysis.isValid) {
        // Auto-proceed to blockchain creation after successful validation
        await createMarketOnBlockchain(analysis);
      } else {
        // Show validation error if market is invalid
        setValidationError(analysis.rejectionReason || 'Market does not meet settlement guidelines. Please revise your question.');
      }
      
    } catch (err: any) {
      console.error('LLM validation error:', err);
      setValidationError('Failed to validate market. Please try again.');
      setIsValidating(false);
    }
  };

  const createMarketOnBlockchain = async (analysis: SettlementAnalysis) => {
    setIsSubmitting(true);
    
    try {
      // Combine date and time for endTime
      const endDateTime = new Date(`${formData.expireDate}T${formData.expireTime}`);
      const endTimeUnix = Math.floor(endDateTime.getTime() / 1000);
      
      const { receipt, conditionId } = await createMarket(formData.question, endTimeUnix, formData.initialLiquidity);
      try {
        if (conditionId) {
          // Persist settlement analysis in localStorage keyed by conditionId
          localStorage.setItem(`settlement:${conditionId}`, JSON.stringify(analysis));
        }
      } catch (_) {}
      setTimeout(() => {
        alert('Market created successfully!');
        if (conditionId) {
          window.location.href = `/markets/${conditionId}`;
        } else {
          onClose();
        }
        resetForm();
      }, 1000);
    } catch (err: any) {
      console.error('Market creation error:', err);
      setError(err.message || 'Failed to create market');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      question: '',
      expireDate: '',
      expireTime: '',
      initialLiquidity: '100'
    });
    setError('');
    setValidationError('');
    setSettlementAnalysis(null);
    setWalletBalance('0.00');
    setIsLoadingBalance(false);
  };

  // When user edits inputs, clear previous validation so the CTA can return
  useEffect(() => {
    setSettlementAnalysis(null);
    setValidationError('');
  }, [formData.question, formData.expireDate, formData.expireTime, formData.initialLiquidity]);

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0c0511] border border-white/10 rounded-xl max-w-2xl w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-white/10">
          <div>
            <h2 className="text-xl font-bold text-white">Create Market</h2>
          </div>
          <button 
            onClick={handleClose}
            className="text-white/70 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Market Creation Guidelines */}
        <div className="p-6 border-b border-white/10">
          <h3 className="text-white font-semibold mb-4">Market Creation Guidelines</h3>
          <div className="space-y-3 text-sm text-white/90">
            <div>
              <span className="font-medium text-white">1. Binary Question Format:</span> Frame market questions to be answerable with a clear "Yes" or "No" response to maintain simplicity and precision.
            </div>
            <div>
              <span className="font-medium text-white">2. Use Official Names:</span> When referring to any individual, organization, or entity, use their full, official name to avoid ambiguity.
            </div>
            <div>
              <span className="font-medium text-white">3. Specify End Date:</span> Include a specific end date in the question to define the market's resolution timeline. For example, conclude the question with "by September 30, 2025."
            </div>
            <div>
              <span className="font-medium text-white">4. Respectful and Ethical Content:</span> Questions must not be offensive, discriminatory, or harmful, nor should they violate cultural, social, or personal sentiments.
            </div>
          </div>
          <p className="text-white/70 text-xs mt-3">
            Market creator guidelines are subject to change as we improve our LLM Oracle.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Question */}
          <div>
            <label className="block text-white font-medium mb-2">
              Question *
            </label>
            <textarea
              required
              value={formData.question}
              onChange={(e) => setFormData({ ...formData, question: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:border-transparent"
              rows={3}
              placeholder="Enter question"
            />
          </div>

          {/* Expire Date & Time */}
          <div>
            <label className="block text-white font-medium mb-2">
              Expire date & time *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <input
                  type="date"
                  required
                  value={formData.expireDate}
                  onChange={(e) => setFormData({ ...formData, expireDate: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:border-transparent"
                  min={new Date().toISOString().split('T')[0]}
                />
                <div className="absolute right-3 top-3 pointer-events-none">
                  <svg className="w-5 h-5 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
              <div className="relative">
                <input
                  type="time"
                  required
                  value={formData.expireTime}
                  onChange={(e) => setFormData({ ...formData, expireTime: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:border-transparent"
                />
                <div className="absolute right-3 top-3 pointer-events-none">
                  <svg className="w-5 h-5 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>
            
          </div>

          {/* Initial Liquidity */}
          <div>
            <label className="block text-white font-medium mb-2">
              Initial Liquidity *
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                required
                min="1"
                value={formData.initialLiquidity}
                onChange={(e) => setFormData({ ...formData, initialLiquidity: e.target.value })}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:border-transparent"
                placeholder="Enter amount"
              />
              <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg px-4 py-3 min-w-[80px]">
                <span className="text-white text-sm">USDC</span>
                <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            <p className="text-white/70 text-sm mt-2">
              This amount is split equally across YES-NO and inits the market at equal odds. More reserve → More liquid markets → Attractive for traders
            </p>
            <p className="text-white/70 text-sm mt-1">
              Balance: {isLoadingBalance ? 'Loading...' : `${walletBalance} ETH`}
            </p>
          </div>

          {/* LLM Validation Status */}
          {isValidating && (
            <div className="bg-white/5 border border-white/10 rounded-lg p-6 text-center">
              <div className="animate-spin w-8 h-8 border-2 border-fuchsia-600 border-t-transparent rounded-full mx-auto mb-4"></div>
              <h3 className="text-white font-semibold mb-2">Checking settlement-criteria from LLM Oracle...</h3>
              <p className="text-white/70 text-sm">Your market is being indexed and processed by our LLM engine.</p>
            </div>
          )}

          {/* Settlement Analysis Results */}
          {settlementAnalysis && (
            <div className="bg-white/5 border border-white/10 rounded-lg p-6">
              <h3 className={`font-semibold mb-4 ${settlementAnalysis.isValid ? 'text-emerald-400' : 'text-red-400'}`}>
                {settlementAnalysis.isValid ? '✅ Settlement Analysis Complete' : '❌ Market Validation Failed'}
              </h3>
              
              <div className="space-y-4">
                <div>
                  <h4 className="text-white font-medium mb-2">AI Reasoning</h4>
                  <p className="text-white/90 text-sm leading-relaxed">{settlementAnalysis.reasoning}</p>
                </div>
                {!settlementAnalysis.isValid && settlementAnalysis.rejectionReason && (
                  <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                    <h4 className="text-red-300 font-medium mb-1">Rejection Reason</h4>
                    <p className="text-white/90 text-sm leading-relaxed">{settlementAnalysis.rejectionReason}</p>
                  </div>
                )}
                
                {settlementAnalysis.isValid && (
                  <>
                    <div>
                      <h4 className="text-white font-medium mb-2">Resolution Sources</h4>
                      <ul className="space-y-1">
                        {settlementAnalysis.resolutionSources.map((source, index) => (
                          <li key={index} className="text-white/90 text-sm">• {source}</li>
                        ))}
                      </ul>
                    </div>
                    
                    <div>
                      <h4 className="text-white font-medium mb-2">Settlement Criteria</h4>
                      <p className="text-white/90 text-sm leading-relaxed">{settlementAnalysis.settlementCriteria}</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Error Display (API/technical only) */}
          {error && (
            <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          {(!settlementAnalysis || settlementAnalysis.isValid) && !validationError && (
            <div className="flex justify-end pt-4">
              <button
                type="submit"
                disabled={isValidating || isSubmitting}
                className="bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 text-white py-3 px-8 rounded-lg font-semibold transition-all duration-200 disabled:cursor-not-allowed"
              >
                {isValidating ? 'Validating...' : isSubmitting ? 'Creating Market...' : 'Accept & Continue'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}