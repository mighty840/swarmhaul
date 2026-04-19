import { useMemo, type ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider as SolWalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";

import "@solana/wallet-adapter-react-ui/styles.css";

export function WalletAdapterProvider({ children }: { children: ReactNode }) {
  const endpoint = useMemo(
    () => import.meta.env.VITE_SOLANA_RPC ?? clusterApiUrl("devnet"),
    [],
  );

  // Modern Phantom, Solflare, Backpack, and others register themselves via
  // the Wallet Standard (SIP-005). wallet-adapter-react picks them up
  // automatically when we pass an empty `wallets` array — the legacy
  // PhantomWalletAdapter only checked `window.phantom.solana`, which
  // newer extension versions no longer inject, producing a false
  // "not detected → install" prompt even for users who have Phantom set up.
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolWalletProvider>
    </ConnectionProvider>
  );
}
