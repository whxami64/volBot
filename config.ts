//Random time interval of buy and sell
export const maxInterval = 30000 //millisecond
export const minInterval = 5000//millisecond

//Random amount for wallet.
export const amountMax = 0.043; //ETH balance
export const amountMin = 0.035;

//Fee balance that must be remaining in the wallet
export const fee = 0.0001; 

//Number of sub wallets.
export const subWalletNum = 2;

//Minimum ETH to leave in a subwallet when gathering (avoid draining gas reserve)
export const gatherGasReserve = 0.00002;
