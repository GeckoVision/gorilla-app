"use client";

import { Buffer } from "buffer";
import { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";

import { DATA_MODE, rpcEndpoint } from "@/lib/solana/config";

import "@solana/wallet-adapter-react-ui/styles.css";

// web3.js + wallet-adapter expect a global Buffer in the browser.
const globalScope = globalThis as unknown as { Buffer?: typeof Buffer };
if (typeof globalThis !== "undefined" && !globalScope.Buffer) {
  globalScope.Buffer = Buffer;
}

export function SolanaProviders({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(() => rpcEndpoint(DATA_MODE), []);
  // Wallet Standard auto-detects installed wallets; these two are listed as a
  // reliable fallback for the modal.
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
