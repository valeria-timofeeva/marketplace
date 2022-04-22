import * as fs from "fs";
import { ethers } from "hardhat";

async function main() {

  const Marketplace = await ethers.getContractFactory("Marketplace");
  const marketplace = await Marketplace.deploy();
  await marketplace.deployed();
  console.log("Marketplace deployed to:", marketplace.address);

  const nft = await marketplace.nft();
  const token = await marketplace.token();

  console.log("NFT contract deployed to:", nft);
  console.log("Token contract deployed to:", token);

  const contracts = {
    marketplaceAddress: marketplace.address,
    nftAddress: nft,
    tokenAddress: token,
  };

  fs.writeFile("./tasks/deploy.json", JSON.stringify(contracts), (err) => {
    if (err) throw err;
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
