import { get_erc20_abi, get_router_abi } from './fetchAbi';
import {
  TARGET_TOKEN_ADDRESS,
  USDC_BASE,
  AERODROME_ROUTER,
  BASE_RPC_ENDPOINT,
} from './constants'
import { Wallet } from './types';
import {
  delay,
  gather,
  generateWallets,
  getRandomDelay,
  readingWallets,
  saveWallet,
  sendEther,
  sendUSDC,
  returnUSDCToBase,
  getBaseWalletSigner,
  runSequentialTransactions,
} from './utils';
import { ethers } from 'ethers'
import { subWalletNum, gasTopUpEth, gatherGasReserve } from './config';

let fileName = "";

const buyToken = async (tokenAddress: string, wallet: Wallet, usdcAmount: bigint, provider: ethers.JsonRpcProvider, nonceRef: { current?: number }) => {
  const routerAbi = get_router_abi();
  const block = await provider.getBlock("latest");
  const currentTimestamp = block?.timestamp || 9999999999999;

  if (usdcAmount === 0n) {
    console.log("No USDC available to swap.");
    return false;
  }

  const erc20Abi = get_erc20_abi();
  const routerReadContract = new ethers.Contract(AERODROME_ROUTER, routerAbi, provider);
  const defaultFactory = await routerReadContract.defaultFactory();

  const steps: Array<{ label: string; buildTx: (signer: ethers.Wallet, nonce: number) => Promise<ethers.ContractTransactionResponse>; }> = [];

  const usdcContractRead = new ethers.Contract(USDC_BASE, erc20Abi, provider);
  const allowance: bigint = await usdcContractRead.allowance(wallet.address, AERODROME_ROUTER);
  if (allowance < usdcAmount) {
    steps.push({
      label: 'USDC approval',
      buildTx: (signer, nonce) => {
        const usdcContract = new ethers.Contract(USDC_BASE, erc20Abi, signer);
        return usdcContract.approve(AERODROME_ROUTER, usdcAmount, { nonce });
      }
    });
  }

  steps.push({
    label: 'Buy token transaction',
    buildTx: (signer, nonce) => {
      const contract = new ethers.Contract(AERODROME_ROUTER, routerAbi, signer);
      return contract.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        usdcAmount,
        0,
        [{ from: USDC_BASE, to: tokenAddress, stable: false, factory: defaultFactory }],
        wallet.address,
        currentTimestamp + 1000000000,
        { nonce }
      );
    }
  });

  const success = await runSequentialTransactions(wallet, provider, steps, 500, nonceRef);
  return success;
}

const sellToken = async (tokenAddress: string, wallet: Wallet, provider: ethers.JsonRpcProvider, nonceRef: { current?: number }) => {
  const routerAbi = get_router_abi();
  const block = await provider.getBlock("latest");
  const currentTimestamp = block?.timestamp || 9999999999999;
  const erc20Abi = get_erc20_abi();

  const tokenContractRead = new ethers.Contract(tokenAddress, erc20Abi, provider);
  const tokenBalance = await tokenContractRead.balanceOf(wallet.address);
  if (tokenBalance === 0n) {
    console.log("No token balance to sell.");
    return false;
  }
  const routerReadContract = new ethers.Contract(AERODROME_ROUTER, routerAbi, provider);
  const defaultFactory = await routerReadContract.defaultFactory();

  const steps: Array<{ label: string; buildTx: (signer: ethers.Wallet, nonce: number) => Promise<ethers.ContractTransactionResponse>; }> = [];

  steps.push({
    label: 'Token approval',
    buildTx: (signer, nonce) => {
      const approvalContract = new ethers.Contract(tokenAddress, erc20Abi, signer);
      return approvalContract.approve(AERODROME_ROUTER, tokenBalance, { nonce });
    }
  });

  steps.push({
    label: 'Sell token transaction',
    buildTx: (signer, nonce) => {
      const contract = new ethers.Contract(AERODROME_ROUTER, routerAbi, signer);
      return contract.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        tokenBalance,
        0,
        [{ from: tokenAddress, to: USDC_BASE, stable: false, factory: defaultFactory }],
        wallet.address,
        currentTimestamp + 1000000000,
        { nonce }
      );
    }
  });

  const success = await runSequentialTransactions(wallet, provider, steps, 500, nonceRef);
  return success;
}

export const processTransaction = async (wallet: Wallet, token_addr: string) => {
  const provider = new ethers.JsonRpcProvider(BASE_RPC_ENDPOINT);
  try {
    const baseSigner = getBaseWalletSigner(provider);

    const baseNonceRef = { current: await provider.getTransactionCount(baseSigner.address, 'pending') };

    const ethTopUp = gasTopUpEth + gatherGasReserve;
    const ethSent = await sendEther(baseSigner, wallet.address, ethTopUp.toFixed(6), baseNonceRef, 500);
    if (!ethSent) {
      console.log("Failed to send ETH top-up. Skipping wallet.");
      return;
    }

    const usdcAmountBigInt = ethers.parseUnits(wallet.usdcAmount, 6);
    const usdcSent = await sendUSDC(baseSigner, wallet.address, usdcAmountBigInt, baseNonceRef, 500);
    if (!usdcSent) {
      console.log("Failed to send USDC. Gathering ETH and moving on.");
      await gather(wallet, provider, 500);
      return;
    }

    await saveWallet({ ...wallet, funded: ethTopUp.toFixed(6) }, fileName);

    const subWalletNonceRef = { current: await provider.getTransactionCount(wallet.address, 'pending') };

    const buySuccess = await buyToken(token_addr, wallet, usdcAmountBigInt, provider, subWalletNonceRef);
    if (!buySuccess) {
      console.log("Buy failed. Gathering funds and moving on.");
      await returnUSDCToBase(wallet, provider, 500, subWalletNonceRef);
      await gather(wallet, provider, 500, subWalletNonceRef);
      return;
    }

    const delayTime = getRandomDelay();
    console.log(`=================================== Delaying ${delayTime / 1000}s ===================================`)
    await delay(delayTime);

    // extra pause so node catches up before sell
    await delay(2000);

    const sellSuccess = await sellToken(token_addr, wallet, provider, subWalletNonceRef);
    if (!sellSuccess) {
      console.log("Sell failed. Gathering what remains.");
    }

    // extra pause before cleanup funding
    await delay(2000);

    await returnUSDCToBase(wallet, provider, 500, subWalletNonceRef);
    await gather(wallet, provider, 500, subWalletNonceRef);
  } catch (error) {
    console.error(`Error processing transaction for wallet ${wallet.address}`, error);
    await delay(2000);
    await returnUSDCToBase(wallet, provider, 500);
    await gather(wallet, provider, 500);
  }

  const delayTime = getRandomDelay();
  console.log(`=================================== Delaying ${delayTime / 1000}s ===================================`)
  await delay(delayTime);
}

const runBot = async () => {
  console.log(`Generating ${subWalletNum} subwallets`);
  fileName = await generateWallets(subWalletNum);
  const wallets: Wallet[] = await readingWallets(fileName);

  for (let i = 0; i < wallets.length; i++) {
    await processTransaction(wallets[i], TARGET_TOKEN_ADDRESS);

    const delayTime = getRandomDelay();
    console.log(`=================================== Delaying ${delayTime / 1000}s ===================================`)
    await delay(delayTime);
  }
}

runBot()



