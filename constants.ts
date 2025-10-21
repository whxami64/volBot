import * as dotenv from 'dotenv';

dotenv.config();

export const retrieveEnvVariable = (variableName: string) => {
  const variable = process.env[variableName] || '';
  if (!variable) {
    console.log(`${variableName} is not set`);
    process.exit(1);
  }
  return variable;
};

export const TARGET_TOKEN_ADDRESS = String(retrieveEnvVariable('TARGET_TOKEN_ADDRESS'));
export const BASE_RPC_ENDPOINT = String(retrieveEnvVariable('BASE_RPC_ENDPOINT'));
export const BASE_WALLET_ADDRESS = String(retrieveEnvVariable('BASE_WALLET_ADDRESS'));
export const BASE_WALLET_PRIVATE_KEY = String(retrieveEnvVariable('BASE_WALLET_PRIVATE_KEY'));

export const AERODROME_ROUTER = '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43';
export const WETH_BASE = '0x4200000000000000000000000000000000000006';
export const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
