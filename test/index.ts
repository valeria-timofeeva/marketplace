import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, utils } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers, network } from "hardhat";
import { NFTCollection, Token } from "../typechain";
import { Marketplace } from "../typechain/Marketplace";


describe("Marketplace", function () {
  let clean: any;

  let marketplace: Marketplace;
  let nftContract: NFTCollection;
  let paymentContract: Token;

  let owner: SignerWithAddress,
    seller: SignerWithAddress,
    buyer: SignerWithAddress,
    buyer2: SignerWithAddress

  const URI = "ipfs//";
  const TOKEN = 0;
  const itemPrice = parseUnits("1000");

  before(async () => {
    [owner, seller, buyer, buyer2] = await ethers.getSigners();

    const Marketplace = await ethers.getContractFactory("Marketplace");
    marketplace = await Marketplace.deploy();
    await marketplace.deployed();

    nftContract = await ethers.getContractAt("NFTCollection", await marketplace.nft());
    paymentContract = await ethers.getContractAt("Token", await marketplace.token());

    clean = await network.provider.request({
      method: "evm_snapshot",
      params: [],
    });
  });

  afterEach(async () => {
    await network.provider.request({
      method: "evm_revert",
      params: [clean],
    });
    clean = await network.provider.request({
      method: "evm_snapshot",
      params: [],
    });
  });

  async function networkWait(seconds: number) {
    await network.provider.request({
      method: "evm_increaseTime",
      params: [seconds],
    });
    await network.provider.request({
      method: "evm_mine",
      params: [],
    });
  }

  function mint(minter: SignerWithAddress) {
    return marketplace.connect(minter).createItem(URI);
  }

  async function placeSaleOrder() {
    await mint(seller);
    await nftContract.connect(seller).approve(marketplace.address, TOKEN);
    await marketplace.connect(seller).listItem(TOKEN, itemPrice);
  }

  describe("Deploy", function () {
    it("Should set nft contract address", async () => {
      expect(await marketplace.nft()).to.be.equal(nftContract.address);
    });
  });

  describe("Config functions", function () {
    describe("CreateItem", function () {
      it("Should create new item", async () => {
        await mint(owner);
        expect(await nftContract.ownerOf(TOKEN)).to.be.equal(owner.address);
      });
    });

    describe("setAuctionPeriod", function () {
      it("Should set period", async () => {
        const period = 30;
        await marketplace.setAuctionPeriod(period);
        expect(await marketplace.period()).to.be.equal(period);
      });

      it("Should revert if period equal to zero", async () => {
        await expect(marketplace.setAuctionPeriod(0)).to.be.revertedWith(
          "CannotBeZero"
        );
      });

      it("Only owner", async () => {
        await expect(marketplace.connect(buyer).setAuctionPeriod(30)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });

    describe("setMinBids", function () {
      it("Should set min bids count", async () => {
        await marketplace.setMinBids(3);
        expect(await marketplace.minBids()).to.be.equal(3);
      });

      it("Only owner", async () => {
        await expect(marketplace.connect(buyer).setMinBids(1)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });
  });

  describe("Listing", function () {
    describe("listItem", function () {
      it("Should revert if try to list token with zero price", async () => {
        await expect(marketplace.connect(seller).listItem(TOKEN, 0)).to.be.revertedWith(
          "CannotBeZero"
        );
      });

      it("Should list item for sell", async () => {
        await mint(seller);
        await nftContract.connect(seller).approve(marketplace.address, TOKEN);

        await expect(marketplace.connect(seller).listItem(TOKEN, itemPrice))
          .to.emit(marketplace, "PlaceSellOrder")
          .withArgs(seller.address, TOKEN, itemPrice);

        expect(await nftContract.ownerOf(TOKEN)).to.be.equal(marketplace.address);

        const listing = await marketplace.saleInfo(TOKEN);
        expect(listing.price).to.be.equal(itemPrice);
        expect(listing.seller).to.be.equal(seller.address);
      });
    });

    describe("cancel", function () {
      it("Should fail when item not listed", async () => {
        await mint(seller);
        await nftContract.connect(seller).approve(marketplace.address, TOKEN);
        await expect(marketplace.connect(seller).cancel(TOKEN)).to.be.revertedWith(
          "ItemNotOnSold"
        );
      });

      it("Should fail when not seller try to cancel auction", async () => {
        await placeSaleOrder();
        await expect(marketplace.connect(buyer).cancel(TOKEN)).to.be.revertedWith(
          "OnlySellerCancel"
        );
      });

      it("Should cancel listing", async () => {
        await placeSaleOrder();
        await expect(marketplace.connect(seller).cancel(TOKEN))
          .to.emit(marketplace, "Cancel")
          .withArgs(seller.address, TOKEN);
        expect(await nftContract.ownerOf(TOKEN)).to.be.equal(seller.address);
        await expect(marketplace.saleInfo(TOKEN)).to.be.revertedWith("ItemNotOnSold");
      });
    });

    describe("buyItem", async () => {
      it("Should sell item to buyer", async () => {
        await placeSaleOrder();
        await paymentContract.mint(buyer.address, itemPrice);
        await paymentContract.connect(buyer).approve(marketplace.address, itemPrice);

        await expect(marketplace.connect(buyer).buyItem(TOKEN))
          .to.emit(marketplace, "SoldOut")
          .withArgs(TOKEN, seller.address, buyer.address, itemPrice);

        expect(await nftContract.ownerOf(TOKEN)).to.be.equal(buyer.address);
        expect(await paymentContract.balanceOf(buyer.address)).to.be.equal(0);
        expect(await paymentContract.balanceOf(seller.address)).to.be.equal(itemPrice);
      });
    });
  });
  describe("Auction", function () {
    const firstBid = parseUnits("100");
    const secondBid = parseUnits("200");

    async function mintAndListItem(seller: SignerWithAddress) {
      await mint(seller);
      await nftContract.connect(seller).approve(marketplace.address, TOKEN);
      await marketplace.connect(seller).listItemOnAuction(TOKEN);
    }

    async function mintTokensAndApproveSpend(user: SignerWithAddress, amount: BigNumber) {
      await paymentContract.connect(user).mint(user.address, amount);
      await paymentContract.connect(user).approve(marketplace.address, amount);
    }

    describe("listItem", function () {
      it("Should list item for sale", async () => {
        await mint(seller);
        await nftContract.connect(seller).approve(marketplace.address, TOKEN);

        await expect(marketplace.connect(seller).listItemOnAuction(TOKEN)).to.emit(
          marketplace,
          "AuctionStarted"
        );
        const auction = await marketplace.auctionInfo(TOKEN);
        expect(auction.seller).to.be.equal(seller.address);

        expect(await nftContract.ownerOf(TOKEN)).to.be.equal(marketplace.address);
      });
    });
    describe("makeBid", function () {
      it("Should fail if there is no auction for this item", async () => {
        await expect(marketplace.makeBid(TOKEN, firstBid)).to.be.revertedWith(
          "AuctionIsMissing"
        );
      });

      it("Should fail if new bid not greater then current bid", async () => {
        await mintAndListItem(seller);

        await expect(marketplace.connect(buyer).makeBid(TOKEN, 0)).to.be.revertedWith(
          "BidTooLow"
        );
      });

      it("Should fail if auction ended", async () => {
        await mintAndListItem(seller);

        const duration = (await marketplace.period()).toNumber();
        await networkWait(duration);

        await expect(marketplace.connect(buyer).makeBid(TOKEN, firstBid)).to.be.revertedWith(
          "AuctionEnded"
        );
      });

      it("Should accept bid", async () => {
        await mintAndListItem(seller);
        await mintTokensAndApproveSpend(buyer, firstBid);
        await expect(marketplace.connect(buyer).makeBid(TOKEN, firstBid))
          .to.emit(marketplace, "Bid")
          .withArgs(TOKEN, buyer.address, firstBid);

        const auction = await marketplace.auctionInfo(TOKEN);
        expect(auction.bidder).to.be.equal(buyer.address);
        expect(auction.bid).to.be.equal(firstBid);
        expect(auction.totalBids).to.be.equal(1);

        expect(await paymentContract.balanceOf(buyer.address)).to.be.equal(0);
        expect(await paymentContract.balanceOf(marketplace.address)).to.be.equal(firstBid);
      });

      it("Should replace bid of previous bidder", async () => {
        await mintAndListItem(seller);

        await mintTokensAndApproveSpend(buyer, firstBid);
        await marketplace.connect(buyer).makeBid(TOKEN, firstBid);

        await mintTokensAndApproveSpend(buyer2, secondBid);

        await expect(marketplace.connect(buyer2).makeBid(TOKEN, secondBid))
          .to.emit(marketplace, "Bid")
          .withArgs(TOKEN, buyer2.address, secondBid);

        const auction = await marketplace.auctionInfo(TOKEN);
        expect(auction.bidder).to.be.equal(buyer2.address);
        expect(auction.bid).to.be.equal(secondBid);
        expect(auction.totalBids).to.be.equal(2);

        expect(await paymentContract.balanceOf(marketplace.address)).to.be.equal(secondBid);
        expect(await paymentContract.balanceOf(buyer.address)).to.be.equal(firstBid);
        expect(await paymentContract.balanceOf(buyer2.address)).to.be.equal(0);
      });
    });

    describe("finishAuction", function () {
      it("Should fail if there is no auction for this item", async () => {
        await expect(marketplace.finishAuction(TOKEN)).to.be.revertedWith(
          "AuctionIsMissing"
        );
      });

      it("Should revert if auction still in progress", async () => {
        await mintAndListItem(seller);
        await expect(marketplace.finishAuction(TOKEN)).to.be.revertedWith(
          "AuctionIsActive"
        );
      });
    });
  });
});