import { task } from "hardhat/config";

const contractInfo = require("./deploy.json");

task
    ("createItem", "Create new NFT")
    .addParam("uri", "NFT uri")
    .setAction(async (taskArgs, hre) => {
        const contract = await hre.ethers.getContractAt("Marketplace", contractInfo.marketplaceAddress);
        await contract.createItem(taskArgs.uri);
    });
