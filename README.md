Marketplace is smart contract for creating trading platforms for the exchange and sale of crypto assets.
https://rinkeby.etherscan.io/address/0xaE783B2801AD2e2B8B66E21BaA3CC5553100EF48#code

Requirements
- The swap() function: deducts tokens from the user and emits the 'swapInitialized' event
- The redeem() function: calls the ecrecover function and restores the address of the validator using the hashed message and signature, if the address matches the address specified on the bridge contract, then tokens are sent to the user
