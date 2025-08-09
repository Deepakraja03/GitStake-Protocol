require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// GitStake L1 network configuration
const GITSTAKE_RPC = process.env.GITSTAKE_RPC || "http://127.0.0.1:9650/ext/bc/MN8ag7XwC6v9UgwkffARz25cva9CVuiR7Aos9YJrN1E7re7aa/rpc";
const PRIVATE_KEY = process.env.PRIVATE_KEY || undefined;


/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      chainId: 1337,
      gas: 15000000,
      gasPrice: 20000000000,
      blockGasLimit: 15000000
    },
    avalanche_l1: {
      url: "http://localhost:9650/ext/bc/C/rpc",
      chainId: 43112,
      gas: 15000000,
      gasPrice: 25000000000
    },
    gitstake_l1: {
      url: GITSTAKE_RPC,
      chainId: 94582,
      gas: 15000000,
      gasPrice: 25000000000,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : []
    },
    fuji: {
      url: process.env.FUJI_RPC || "https://api.avax-test.network/ext/bc/C/rpc",
      chainId: 43113,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : []
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};