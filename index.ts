import {
  get_erc20_abi,
  get_router_abi,
} from './fetchAbi';
import {
  BASE_WALLET_ADDRESS,
  BASE_WALLET_PRIVATE_KEY,
  TARGET_TOKEN_ADDRESS,
  WETH_BASE,
  USDC_BASE,
  AERODROME_ROUTER,
  BASE_RPC_ENDPOINT,
} from './constants'
import { Wallet } from './types';
import { delay, gather, generateWallets, getRandomDelay, readingWallets, saveWallet, sendEther } from './utils';
import { ethers } from 'ethers'
import { fee, subWalletNum, gatherGasReserve } from './config';

const baseWallet = {
  privateKey: BASE_WALLET_PRIVATE_KEY,
  address: BASE_WALLET_ADDRESS,
}

let fileName = "";

export const buyUSDC = async (wallet: Wallet): Promise<bigint> => {
  const routerAbi = get_router_abi();
  const provider = new ethers.JsonRpcProvider(BASE_RPC_ENDPOINT);
  const block = await provider.getBlock("latest");
  const currentTimestamp = block?.timestamp || 9999999999999;
  try {
    const signer = new ethers.Wallet(wallet.privateKey, provider)
    const contract = new ethers.Contract(AERODROME_ROUTER, routerAbi, signer);
    console.log("=================================== Buying USDC ===================================")
    console.log(`Swapping ${wallet.amount} ETH for USDC from ${wallet.address}`)
    await delay(5000);
    const defaultFactory = await contract.defaultFactory();
    const routes = [{
      from: WETH_BASE,
      to: USDC_BASE,
      stable: true,
      factory: defaultFactory,
    }];
    const tx = await contract.swapExactETHForTokensSupportingFeeOnTransferTokens(
      0,
      routes,
      wallet.address,
      currentTimestamp + 1000000000,
      {
        value: ethers.parseEther(wallet.amount.toString())
      });
    await tx.wait();
    const usdcContract = new ethers.Contract(USDC_BASE, get_erc20_abi(), signer);
    const balance: bigint = await usdcContract.balanceOf(wallet.address);
    console.log(`USDC received: ${ethers.formatUnits(balance, 6)} (tx: ${tx.hash})`);
    return balance;
  } catch (error) {
    console.log(error);
    await gather(wallet, provider);
    return 0n;
  }
}

export const buyToken = async (tokenAddress: string, wallet: Wallet, usdcAmount: bigint) => {
  const routerAbi = get_router_abi();
  const provider = new ethers.JsonRpcProvider(BASE_RPC_ENDPOINT);
  const block = await provider.getBlock("latest");
  const currentTimestamp = block?.timestamp || 9999999999999;
  try {
    if (usdcAmount === 0n) {
      console.log("No USDC available to swap.");
      return "";
    }
    const signer = new ethers.Wallet(wallet.privateKey, provider)
    const contract = new ethers.Contract(AERODROME_ROUTER, routerAbi, signer);
    const erc20Abi = get_erc20_abi();
    const usdcContract = new ethers.Contract(USDC_BASE, erc20Abi, signer);

    const allowance: bigint = await usdcContract.allowance(wallet.address, AERODROME_ROUTER);
    if (allowance < usdcAmount) {
      console.log(`Approving USDC spend of ${ethers.formatUnits(usdcAmount, 6)} for router`);
      const approvalTx = await usdcContract.approve(AERODROME_ROUTER, usdcAmount);
      await approvalTx.wait();
      console.log(`USDC approval tx: ${approvalTx.hash}`);
    }

    console.log("=================================== Buying ===================================")
    console.log(`Token Address: ${tokenAddress}`)
    await delay(5000);
    const defaultFactory = await contract.defaultFactory();
    const routes = [{
      from: USDC_BASE,
      to: tokenAddress,
      stable: false,
      factory: defaultFactory,
    }];
    const tx = await contract.swapExactTokensForTokensSupportingFeeOnTransferTokens(
      usdcAmount,
      0,
      routes,
      wallet.address,
      currentTimestamp + 1000000000);
    await tx.wait();
    console.log(`Buy : ${tx.hash}`);
    return tx.hash;
  } catch (error) {
    console.log(error);
    await gather(wallet, provider);
    return "";
  }
}

export const swapUSDCForETH = async (wallet: Wallet): Promise<string> => {
  const routerAbi = get_router_abi();
  const erc20Abi = get_erc20_abi();
  const provider = new ethers.JsonRpcProvider(BASE_RPC_ENDPOINT);
  const block = await provider.getBlock("latest");
  const currentTimestamp = block?.timestamp || 9999999999999;

  try {
    const signer = new ethers.Wallet(wallet.privateKey, provider);
    const usdcContract = new ethers.Contract(USDC_BASE, erc20Abi, signer);
    const usdcBalance: bigint = await usdcContract.balanceOf(wallet.address);

    if (usdcBalance === 0n) {
      console.log("No USDC balance to convert back to ETH.");
      return "";
    }

    const allowance: bigint = await usdcContract.allowance(wallet.address, AERODROME_ROUTER);
    if (allowance < usdcBalance) {
      console.log(`Approving USDC spend of ${ethers.formatUnits(usdcBalance, 6)} for ETH swap.`);
      const approvalTx = await usdcContract.approve(AERODROME_ROUTER, usdcBalance);
      await approvalTx.wait();
      console.log(`USDC approval for ETH swap tx: ${approvalTx.hash}`);
    }

    console.log("=================================== Swapping USDC for ETH ===================================");
    await delay(5000);
    const contract = new ethers.Contract(AERODROME_ROUTER, routerAbi, signer);
    const defaultFactory = await contract.defaultFactory();
    const routes = [{
      from: USDC_BASE,
      to: WETH_BASE,
      stable: true,
      factory: defaultFactory,
    }];
    const tx = await contract.swapExactTokensForETHSupportingFeeOnTransferTokens(
      usdcBalance,
      0,
      routes,
      wallet.address,
      currentTimestamp + 1000000000,
    );
    await tx.wait();
    console.log(`USDC -> ETH swap tx: ${tx.hash}`);
    return tx.hash;
  } catch (error) {
    console.log(error);
    return "";
  }
}

export const sellToken = async (tokenAddress: string, wallet: Wallet) => {
  const routerAbi = get_router_abi();
  const provider = new ethers.JsonRpcProvider(BASE_RPC_ENDPOINT);
  const block = await provider.getBlock("latest");
  const currentTimestamp = block?.timestamp || 9999999999999;
  const erc20Abi = get_erc20_abi();
  try {
    const signer = new ethers.Wallet(wallet.privateKey, provider)
    const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, signer);
    const tokenBalance = await tokenContract.balanceOf(wallet.address);
    if (tokenBalance === 0n) {
      console.log("No token balance to sell.");
      return "";
    }

    console.log("=================================== Approving ===================================")
    console.log(`Approving ${tokenAddress} to sell from ${wallet.address}`);
    await delay(5000);
    const approval = await tokenContract.approve(AERODROME_ROUTER, tokenBalance);
    console.log(`Approval : ${approval.hash}`);

    console.log("=================================== Selling ===================================")
    const contract = new ethers.Contract(AERODROME_ROUTER, routerAbi, signer);
    await delay(5000);
    const defaultFactory = await contract.defaultFactory();
    const routes = [{
      from: tokenAddress,
      to: USDC_BASE,
      stable: false,
      factory: defaultFactory,
    }];
    const tx = await contract.swapExactTokensForTokensSupportingFeeOnTransferTokens(tokenBalance, 0, routes, wallet.address, currentTimestamp + 1000000000);
    await tx.wait();
    console.log(`Sell : ${tx.hash}`);
    const swapBackHash = await swapUSDCForETH(wallet);
    if (swapBackHash === "") {
      console.log("Failed to convert USDC back to ETH before gathering.");
    }

    await gather(wallet, provider, gatherGasReserve);
    return tx.hash;
  } catch (error) {
    console.log(error);
    return "Transaction Failed";
  }
}

export const processTransaction = async (wallet: Wallet, token_addr: string) => {
  const provider = new ethers.JsonRpcProvider(BASE_RPC_ENDPOINT);
  try {
    const transferAmount = (Number(wallet.amount) + fee).toFixed(6);
    const isTransferred = await sendEther(baseWallet.privateKey, wallet.address, transferAmount, provider);
    if (isTransferred) {
      await saveWallet({...wallet, funded: transferAmount}, fileName);
    }
    const usdcBalance = await buyUSDC(wallet);
    if (usdcBalance === 0n) {
      console.log("Trading with the next wallet.");
      return;
    }
    const hash = await buyToken(token_addr, wallet, usdcBalance);

    if(hash == "") {
      console.log("Trading with the next wallet.");
      return;
    }

    const delayTime = getRandomDelay();
    console.log(`=================================== Delaying ${delayTime / 1000}s ===================================`)
    await delay(delayTime);
    await sellToken(token_addr, wallet)
  } catch (error) {
    console.error(`Error processing transaction for user`, error);
  }
  const delayTime = getRandomDelay();
  console.log(`=================================== Delaying ${delayTime / 1000}s ===================================`)
  await delay(delayTime);
}
const runBot = async () => {
  console.log(`Generating ${subWalletNum} subwallets`);
  fileName = await generateWallets(subWalletNum);
  const wallets = await readingWallets(fileName);

  for (let i = 0; i < wallets.length; i++) {
    await processTransaction(wallets[i], TARGET_TOKEN_ADDRESS);

    const delayTime = getRandomDelay();
    console.log(`=================================== Delaying ${delayTime / 1000}s ===================================`)
    await delay(delayTime);
  }
}


runBot()



