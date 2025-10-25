# Volume bot on EVM chains

## Supported chains
BASE

## Technology

Languange: Typescript
Type: Bot Script

## How to use the bot?

- You should install node modules by
```
npm i
```

- Edit the contents in the `.env` file. I've already sent you the project with `.env` file.

You should input your wallet address and privatekey there.
```
BASE_WALLET_ADDRES=""
BASE_WALLET_PRIVATE_KEY=""
TARGET_TOKEN_ADDRESS=""
BASE_RPC_ENDPOINT=""
```
There are rpc addresses in thge`.env` file and they are not paid version.

If you have good one you can replce them with yours.

- Then you should see the `config.json` file. I has the main configurations for running the bot. I added comments for your good understanding.
```
//Random amount for wallet.
export const amountMax = 0.003; //Ether balance
export const amountMin = 0.001; //Should be more than 0.001

//Fee balance that must be remaining in the wallet
export const fee = 0.001; //Must be greater than 0.001
```

I recommend that you should increase `fee` for the successful transaction. ex: 0.05, 0.06.

Before that you should have enough BNB in your base wallet.

For example if you set config values like this...
```
//Random time interval of buy and sell
export const maxInterval = 30000 //millisecond
export const minInterval = 5000//millisecond

//Random amount for wallet.
export const amountMax = 0.03; //Ether balance
export const amountMin = 0.01; //Should be more than 0.001

//Fee balance that must be remaining in the wallet
export const fee = 0.005; //Must be greater than 0.001

//Number of sub wallets.
export const subWalletNum = 20;

//ChainId : Sepolia, BSC, Ethereum
export const CHAINID:ChainId = ChainId.BSC;
```

Your wallet should have `(0.03 + 0.005) * 20 = 0.7 (BNB/ETH);

I Recommend that you should use much fee value like 0.01 so that you can gather funds if you have some error while running the bot.

While you are running the bot there will be a new json file to save the wallets you generated, so you can withdraw funds if there is a problem.

I will add automatic fund-gathering function later if you want.


Then you can run the bot
```
npm run dev
```


## Features
- Generating random wallets
- Funding wallets that will trade as real traders
- Random trade with funded wallets
- Gathering funds after work
