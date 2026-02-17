require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.0",
  networks: {
    hardhat: {
      chainId: 1337, // Local Hardhat network
      allowUnlimitedContractSize: true, 
    },
  },
  paths: {
    sources: "./contracts",   // Folder for contracts
    tests: "./test",           // Folder for tests
    cache: "./cache",          // Folder for cache
    artifacts: "./artifacts",  // Folder for compiled contract artifacts
  },
};