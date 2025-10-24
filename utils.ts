import { usdcAmountMax, usdcAmountMin, maxInterval, minInterval, gasTopUpEth, gatherGasReserve } from "./config";
import { AERODROME_ROUTER, BASE_RPC_ENDPOINT, BASE_WALLET_ADDRESS, BASE_WALLET_PRIVATE_KEY, USDC_BASE } from "./constants";
import { get_erc20_abi } from "./fetchAbi";
import { Provider, Wallet as EthersWallet, ethers } from 'ethers';
import fs from 'fs';
import { Wallet } from './types';

const NONCE_RETRY_BACKOFF_MS = 1500;

export function getRpc() {
  return BASE_RPC_ENDPOINT;
}

export function getRouterAddress() {
  return AERODROME_ROUTER;
}

export function getRandomDelay() {
  return Math.floor(Math.random() * (maxInterval - minInterval + 1)) + minInterval;
}

export function getRandomUsdcAmount() {
  return Number((Math.random() * (usdcAmountMax - usdcAmountMin) + usdcAmountMin).toFixed(2));
}

export const generateWallets = async (num: number) => {
  const wallets: Wallet[] = [];

  for (let i = 0; i < num; i++) {
    const wallet = EthersWallet.createRandom();
    wallets.push({
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic?.phrase,
      usdcAmount: getRandomUsdcAmount().toFixed(2),
      funded: "0"
    });
  }

  const fileName = `./wallets/${Math.floor(Date.now() / 1000)}.json`
  console.log(`Saving Wallets in ${fileName}`);
  fs.writeFileSync(fileName, JSON.stringify(wallets, null, 2));
  console.log(`Generated ${num} wallets and saved to ${fileName}`);
  return fileName;
};

export const readingWallets = async (fileName: string) => {
  try {
    const data = fs.readFileSync(fileName, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("❌ Error reading wallets file:", error);
    return [];
  }
}

export const saveWallet = async (wallet: Wallet, fileName: string) => {
  const wallets = await readingWallets(fileName);
  const newWallets = wallets.map((item: Wallet) =>
    wallet.privateKey.toLowerCase() === item.privateKey.toLowerCase() ? wallet : item
  );

  fs.writeFileSync(fileName, JSON.stringify(newWallets, null, 2));
  return fileName;
}

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const getTokenBalance = async (tokenAddress: string, walletAddress: string, provider: Provider) => {
  const erc20Abi = get_erc20_abi();
  const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, provider);

  try {
    const balance = await tokenContract.balanceOf(walletAddress);
    const balanceInDecimals = ethers.formatUnits(balance, 18);
    console.log(`Token balance: ${balanceInDecimals} tokens`);
    return balanceInDecimals;
  } catch (error) {
    console.error("Error getting token balance:", error);
    return "0";
  }
};

const getBaseSigner = (provider: Provider) => new EthersWallet(BASE_WALLET_PRIVATE_KEY, provider);

export const getBaseWalletSigner = (provider: Provider) => getBaseSigner(provider);

const isNonceError = (error: any) => {
  if (!error) return false;
  if (error.code === 'NONCE_EXPIRED') return true;
  const message = (error?.info?.error?.message || error?.shortMessage || error?.message || '').toLowerCase();
  return message.includes('nonce too low') || message.includes('nonce has already been used');
};

const sendWithManagedNonce = async (
  signer: EthersWallet,
  buildTx: (nonce: number) => Promise<ethers.TransactionResponse>,
  label: string,
  maxRetries = 5,
  nonceRef?: { current?: number },
  extraDelayMs: number = 0,
): Promise<ethers.TransactionResponse | null> => {
  const provider = signer.provider;
  if (!provider) throw new Error('Signer must have a provider');
  let nonce = nonceRef?.current ?? await provider.getTransactionCount(signer.address, 'pending');
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (extraDelayMs > 0 && attempt > 0) {
        await delay(extraDelayMs);
      }
      console.log(`${label}: attempt ${attempt + 1} using nonce ${nonce}`);
      const tx = await buildTx(nonce);
      await tx.wait();
      console.log(`${label} tx: ${tx.hash}`);
      if (nonceRef) nonceRef.current = nonce + 1;
      return tx;
    } catch (error) {
      if (isNonceError(error)) {
        console.log(`${label} nonce too low. Refreshing nonce and retrying...`);
        await delay(NONCE_RETRY_BACKOFF_MS);
        nonce = await provider.getTransactionCount(signer.address, 'pending');
        if (nonceRef) nonceRef.current = nonce;
        continue;
      }
      console.log(`${label} error`, error);
      return null;
    }
  }
  console.log(`${label} failed after ${maxRetries} retries due to nonce conflicts.`);
  return null;
};

export const executeWithNonce = async (
  wallet: Wallet,
  provider: Provider,
  buildTx: (signer: EthersWallet, nonce: number) => Promise<ethers.TransactionResponse>,
  label: string,
) => {
  const signer = new EthersWallet(wallet.privateKey, provider);
  const tx = await sendWithManagedNonce(signer, (nonce) => buildTx(signer, nonce), label);
  return tx;
};

export const sendEther = async (signer: EthersWallet, to: string, amountEth: string, nonceRef?: { current?: number }, extraDelayMs: number = 0): Promise<boolean> => {
  console.log(`Sending ${amountEth} ETH to ${to}`);
  const tx = await sendWithManagedNonce(
    signer,
    async (nonce) => signer.sendTransaction({ to, value: ethers.parseEther(amountEth), nonce }),
    'ETH transfer',
    5,
    nonceRef,
    extraDelayMs,
  );
  return tx !== null;
};

export const sendUSDC = async (signer: EthersWallet, to: string, amount: bigint, nonceRef?: { current?: number }, extraDelayMs: number = 0): Promise<boolean> => {
  const erc20Abi = get_erc20_abi();
  const usdcContract = new ethers.Contract(USDC_BASE, erc20Abi, signer);
  console.log(`Transferring ${ethers.formatUnits(amount, 6)} USDC to ${to}`);
  const tx = await sendWithManagedNonce(
    signer,
    async (nonce) => usdcContract.transfer(to, amount, { nonce }),
    'USDC transfer',
    5,
    nonceRef,
    extraDelayMs,
  );
  return tx !== null;
};

export const returnUSDCToBase = async (wallet: Wallet, provider: Provider, extraDelayMs: number = 0, nonceRef?: { current?: number }) => {
  const erc20Abi = get_erc20_abi();
  const signer = new EthersWallet(wallet.privateKey, provider);
  const usdcContract = new ethers.Contract(USDC_BASE, erc20Abi, signer);
  const balance: bigint = await usdcContract.balanceOf(wallet.address);
  if (balance === 0n) {
    console.log("No USDC balance to return to base wallet.");
    return;
  }
  const tx = await sendWithManagedNonce(
    signer,
    async (nonce) => usdcContract.transfer(BASE_WALLET_ADDRESS, balance, { nonce }),
    'Return USDC',
    5,
    nonceRef,
    extraDelayMs,
  );
  if (tx) {
    console.log(`Returned USDC tx: ${tx.hash}`);
  }
};

export const gather = async (wallet: Wallet, provider: Provider, extraDelayMs: number = 0, nonceRef?: { current?: number }) => {
  console.log("Gathering ETH from", wallet.address);
  const signer = new EthersWallet(wallet.privateKey, provider);
  try {
    const balance = await provider.getBalance(wallet.address);
    if (balance === 0n) {
      console.log("No ETH to gather.");
      return;
    }

    const reserveWei = ethers.parseEther(gatherGasReserve.toString());
    if (balance <= reserveWei) {
      console.log("Not enough ETH to cover gas reserve.");
      return;
    }

    const amountToSend = balance - reserveWei;
    const tx = await sendWithManagedNonce(
      signer,
      async (nonce) => signer.sendTransaction({ to: BASE_WALLET_ADDRESS, value: amountToSend, nonce }),
      'Gather ETH',
      5,
      nonceRef,
      extraDelayMs,
    );
    if (tx) {
      console.log(`Gathered ETH tx: ${tx.hash}`);
    }
  } catch (error) {
    console.log("gather error", error);
  }
};

export const runSequentialTransactions = async (
  wallet: Wallet,
  provider: Provider,
  steps: Array<{ label: string; buildTx: (signer: EthersWallet, nonce: number) => Promise<ethers.TransactionResponse>; }>,
  extraDelayMs: number = 0,
  nonceRef?: { current?: number },
) => {
  if (steps.length === 0) return true;
  const signer = new EthersWallet(wallet.privateKey, provider);
  const sharedNonceRef = nonceRef ?? { current: await provider.getTransactionCount(wallet.address, 'pending') };
  if (sharedNonceRef.current === undefined) {
    sharedNonceRef.current = await provider.getTransactionCount(wallet.address, 'pending');
  }

  for (const step of steps) {
    let attempt = 0;
    while (attempt < 5) {
      try {
        const nonce: number = sharedNonceRef.current!;
        console.log(`${step.label}: attempt ${attempt + 1} using nonce ${nonce}`);
        const tx = await step.buildTx(signer, nonce);
        if (extraDelayMs > 0 && attempt > 0) {
          await delay(extraDelayMs);
        }
        await tx.wait();
        console.log(`${step.label} tx: ${tx.hash}`);
        if (sharedNonceRef.current) sharedNonceRef.current++;
        break; // Exit inner loop on success
      } catch (error) {
        if (isNonceError(error)) {
          console.log(`${step.label} nonce too low. Refreshing nonce and retrying...`);
          await delay(NONCE_RETRY_BACKOFF_MS);
          sharedNonceRef.current = await provider.getTransactionCount(wallet.address, 'pending');
          continue;
        }
        console.log(`${step.label} error`, error);
        attempt++;
      }
    }
  }
  return true;
};