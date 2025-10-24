//Random time interval of buy and sell
export const maxInterval = 200000 //millisecond
export const minInterval = 100000//millisecond

//Random USDC amount for wallet.
export const usdcAmountMax = 250; //USDC balance
export const usdcAmountMin = 150;

//ETH top-up sent to each subwallet for paying gas
export const gasTopUpEth = 0.002;

//Minimum ETH to leave in a subwallet when gathering (avoid draining gas reserve)
export const gatherGasReserve = 0.00002;

//Number of sub wallets.
export const subWalletNum = 200;
