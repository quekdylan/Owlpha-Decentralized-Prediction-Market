'use client';

import { useState, useEffect, useRef } from 'react';

interface WalletButtonProps {
  address: string;
  onDisconnect: () => void;
}

export default function WalletButton({ address, onDisconnect }: WalletButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Format address to show first 6 and last 4 characters
  const formatAddress = (addr: string) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      // Could add a toast notification here
      console.log('Address copied to clipboard');
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors cursor-pointer"
      >
        <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
        <span className="text-white text-sm font-medium">{formatAddress(address)}</span>
        <svg 
          className={`w-4 h-4 text-white/70 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-[#1a1625] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50">
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/70 text-xs">Wallet Address</span>
              <button
                onClick={handleCopyAddress}
                className="text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                title="Copy address"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white text-sm font-mono">{formatAddress(address)}</span>
            </div>
          </div>

          <button
            onClick={() => {
              setIsOpen(false);
              onDisconnect();
            }}
            className="w-full px-4 py-3 text-left text-emerald-400 hover:bg-white/5 transition-colors flex items-center gap-2 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Disconnect</span>
          </button>
        </div>
      )}
    </div>
  );
}

