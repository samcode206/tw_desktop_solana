import { useState } from 'react';
import { Buffer } from 'buffer';
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';

const RPC_URL = 'https://api.devnet.solana.com';
const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

declare global {
  interface Window {
    solana?: {
      isTrust?: boolean;
      connect: () => Promise<{ publicKey: { toBytes: () => Uint8Array } }>;
      publicKey: { toBytes: () => Uint8Array; toBase58: () => string } | null;
      signTransaction: (tx: Transaction) => Promise<Transaction>;
      [key: string]: any;
    };
  }
}

export default function App() {
  const [amount, setAmount] = useState('0.001');
  const [recipient, setRecipient] = useState('');
  const [connected, setConnected] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const push = (msg: string) => setLog(prev => [...prev, msg]);

  const connect = async () => {
    if (!window.solana) throw new Error('window.solana not found — is Trust Wallet extension installed?');
    setBusy(true);
    try {
      await window.solana.connect();
      const sender = new PublicKey(window.solana.publicKey!.toBytes());
      setRecipient(sender.toBase58());
      setConnected(true);
    } catch (e: any) {
      push(`❌ ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    setBusy(true);
    setLog([]);
    try {
      if (!window.solana?.publicKey) throw new Error('Wallet not connected');

      push(`window.solana.isTrust: ${window.solana.isTrust}`);

      const sender = new PublicKey(window.solana.publicKey.toBytes());
      push(`Sender: ${sender.toBase58()}`);

      const connection = new Connection(RPC_URL, 'confirmed');
      const lamports = Math.round(parseFloat(amount) * 1e9);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      push(`Blockhash: ${blockhash}`);

      const tx = new Transaction({ blockhash, lastValidBlockHeight, feePayer: sender });

      tx.add(new TransactionInstruction({
        keys: [],
        programId: new PublicKey(MEMO_PROGRAM),
        data: Buffer.from('repro-memo'),
      }));

      tx.add(SystemProgram.transfer({
        fromPubkey: sender,
        toPubkey: new PublicKey(recipient),
        lamports,
      }));

      push('Calling window.solana.signTransaction()…');
      const signedTx = await window.solana.signTransaction(tx);

      const sig: Buffer | null = signedTx.signatures[0]?.signature ?? null;
      push(`Signature: ${sig ? Buffer.from(sig).toString('hex') : 'null'}`);

      if (!sig) throw new Error('No signature returned from wallet');

      push('Sending via signedTx.serialize()…');
      try {
        const txId = await connection.sendRawTransaction(signedTx.serialize());
        push(`✅ txId: ${txId}`);
        push('Polling for confirmation every 5s…');
        let confirmed = false;
        for (let i = 1; i <= 12; i++) {
          await new Promise(r => setTimeout(r, 5000));
          const { value: [status] } = await connection.getSignatureStatuses([txId], { searchTransactionHistory: true });
          push(`[${i}] status: ${status ? (status.err ? `failed — ${JSON.stringify(status.err)}` : status.confirmationStatus) : 'not found'}`);
          if (status && !status.err) {
            confirmed = true;
            push(`✅ confirmed (${status.confirmationStatus})`);
            break;
          }
        }
        if (!confirmed) push('❌ not confirmed after 60s');
      } catch (e: any) {
        push(`❌ sendRawTransaction: ${e.message}`);
      }
    } catch (e: any) {
      push(`❌ ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ fontFamily: 'monospace', padding: 32, maxWidth: 640 }}>
      <h2 style={{ marginTop: 0 }}>Trust Wallet · Solana Signing Repro</h2>
      <p style={{ fontSize: 13, color: '#555', lineHeight: 1.5 }}>
        Signs and sends a SOL transfer + memo via{' '}
        <code>window.solana.signTransaction()</code>.<br />
        Running on <strong>devnet</strong> — get SOL at{' '}
        <a href="https://faucet.solana.com" target="_blank" rel="noreferrer">faucet.solana.com</a>.
      </p>

      <div style={{ marginBottom: 12 }}>
        <label htmlFor="amount">Amount (SOL):&nbsp;</label>
        <input
          id="amount"
          type="number"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          step="0.001"
          min="0.001"
          style={{ padding: '4px 8px', width: 100, fontFamily: 'monospace' }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label htmlFor="recipient">Recipient:&nbsp;</label>
        <input
          id="recipient"
          type="text"
          value={recipient}
          onChange={e => setRecipient(e.target.value)}
          placeholder="connect wallet to auto-fill"
          style={{ padding: '4px 8px', width: 320, fontFamily: 'monospace', fontSize: 11 }}
        />
      </div>

      {connected && (
        <div style={{ marginBottom: 16, fontSize: 12, color: '#555' }}>
          Connected: <span style={{ color: '#111' }}>{window.solana?.publicKey?.toBase58()}</span>
        </div>
      )}

      {!connected ? (
        <button
          onClick={connect}
          disabled={busy}
          style={{ padding: '8px 28px', fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer' }}
        >
          {busy ? 'Connecting…' : 'Connect Wallet'}
        </button>
      ) : (
        <button
          onClick={run}
          disabled={busy}
          style={{ padding: '8px 28px', fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer' }}
        >
          {busy ? 'Working…' : 'Sign & Send'}
        </button>
      )}

      <pre style={{
        marginTop: 24,
        background: '#111',
        color: '#7fff7f',
        padding: 16,
        borderRadius: 6,
        minHeight: 220,
        fontSize: 12,
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
      }}>
        {log.length === 0 ? '// output' : log.join('\n')}
      </pre>
    </div>
  );
}
