'use client';

import { useState } from 'react';
import { connectWallet } from '@/lib/blockchain';

interface WalletConnectionProps {
  onConnected: (address: string) => void;
}

export default function WalletConnection({ onConnected }: WalletConnectionProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);
    
    try {
      const { signer } = await connectWallet();
      const address = await signer.getAddress();
      onConnected(address);
    } catch (err: any) {
      console.error('Wallet connection failed:', err);
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0c0511] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 text-center">
        <div className="mb-6">
          <img src="/owlphaLogo.svg" alt="Owlpha" className="h-20 w-20 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Welcome to Owlpha</h1>
          <p className="text-white/70 text-sm">
            Connect your wallet to start trading prediction markets
          </p>
        </div>

        <div className="space-y-4">
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="w-full bg-fuchsia-600 hover:bg-fuchsia-700 disabled:bg-fuchsia-600/50 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
          >
            {isConnecting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Connecting...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Connect MetaMask
              </>
            )}
          </button>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          <div className="text-xs text-white/50 space-y-1">
            <p>• Make sure MetaMask is installed</p>
            <p>• Select the correct network</p>
            <p>• Grant permission when prompted</p>
          </div>
        </div>
      </div>
    </div>
  );
}
