# `Governance API`

## **Abstract**

This document describe the interface between webpage / web-based stack and cardano wallets. This specificies that API of the javascript object that need to be injected into the web applications in order to support all the Governance features.


## **Namespace**

### **cardano.{walletName}.governance.enable(): Promise\<API>**
The `cardano.{walletName}.governance.enable()` method is used to enable the governance API. It should request permission from the wallet to enable the API. If permission is granted, the rest of the API will be available. 

## `Types`

### **GovernanceKey**

```
type GovernanceKey = {
  voting_key: cbor<vkey>,
  weight: number
}

```

`voting_key`: Ed25519 pubkey 32 bytes HEX string  

`weight`: The voting power associated with each voting key in the delegation array is calculated as the weighted fraction of the total voting power (rounded down);


### **Purpose**

```
type enum Purpose = {
  CATALYST = 0,
  OTHER = 1
}

```

`Purpose`: Defines the purpose of the delegations. This is used to limit the scope of the delegations 


# **`API`**

## **api.getVotingKey**(address_index: number = 0, account: number = 0, role: number = 0): Promise\<Bip32PublicKey>

Should derive and return the wallets voting public key

### **Returns**
`cbor\<vkey>` - cbor serialized 64 bytes (x, y) Ed25519 public key  

There should be only a single single voting key per wallet / mnemonic. 

The **`voting_key`** should be derived from the following path. 

```
m / 1694' / 1815' / account' / role' / address_index'
```

`1694` (year Voltaire’s was born) Sets a dedicated `purpose` in the derivation path for the voting profile.  

`address_index` - index of the key to use. 


## **api.buildDelegation**(keys: GovernanceKey[], purpose: Purpose, networkId: number, stakeAccountPath: number = 0, stakeRolePath: number = 0, stakeIndex: number = 0): Promise\<**`Delegation`**>

Should create the metadata object to be submitted by a metadata transaction to register the delegations on-chain. 

### **Params**

`account`: In case the wallet supports multiple accounts. defaults to 0

`chain`: Part of the derivation path. defaults to 0

`role`: 

### **Returns**

#### **`Delegation`**

```
export interface Delegation {
    voting_delegation: GovernanceKey[],
    staking_key: string,
    reward_address: string,
    nonce: number,
    purpose: Purpose
}
```

Defines the structure to be crafted and signed for delegation of voting & their respectively voting power. 

***`voting_delegation`***: List of keys and their voting weight to delegate voting power to

The ***`staking_key`*** is Ed25519 public key 32bytes (x only) associated with your staking address. Defined in `CIP-11`, which specifies the derivation path for the staking key: 

```
m / 1852' / 1815' / account' / chain / 0
```

The ***`reward_address`*** as specified in `CIP-8` [here](https://cips.cardano.org/cips/cip8/#addressformats) 


The ***`nonce`*** is an unsigned integer (of CBOR major type 0) that should be monotonically rising across all transactions with the same staking key. It's up to the wallet to manage this and to guarantee that these are always unique and higher than the previous one. An advised nonce value is `linux epoch timestamp`.


## **api.signDelegation**(delegation: DelegationMetadata, account: number = 0, role: number = 0, index: number = 0): Promise\<**`SignedDelegationMetadata`**>

Given that since `CIP-18`, multi-staking keys should be considered; but that a single voting profile should exist per wallet. A single staking key should be used to perform EDDSA over the voting profile blake2b-256 hash.

The staking key used should still be the one defined in `CIP-11`. 

### **Returns**

#### **`SignedDelegationMetadata`**

```
export interface SignedDelegationMetadata {
    '61284': DelegationMetadata,
    '61285': string
}
```

Defines the result of signing the DelegationMetadata.

`61284`: Key that defines the registration metadata map

`61285`: Signature of the blake2b hash of the `DelegationMetadata`

## **api.submitMetadataTx(tx: MetadataTransaction): Promise\<hash32>**

```
export interface MetadataTransaction {
  type: string,
  description: string,
  cboxHex: string
}
```

`type`: Defines the type of transaction according to it's era. For example, if the transaction is for the Alonzo era, then the type should be `"Tx AlonzoEra"`.

`description`: A description of the transaction.

`cboxHex`: The cbor encoded hex of `SignedDelegationMetadata`.

Errors: `APIError`, `TxSendError`

This should be trigger a request to the wallet to submit a raw cbor-encoded metadata tx. The wallet may refuse or accept the request.
In case of acceptance, the wallet should return the transaction hash.

### Voting profile signing process

1. **`Get Voting Key`** - use the method **api.getVotingKey** to return a ed25519 32 bytes public key (x value of the point on the curve)

2. **`Craft delegation cert`** - Use **api.buildDelegation** to construct the object containing the key array set to delegate voting power to. Each value will express the `weight` of the voting powers given.

3. **`Sign the delegation cert`** - Use **api.signDelegation** sign the blake2b hash of the delegation cert and append it to the cert

4. **`Encode`** - Cbor encode the cert to be used in the metadata transaction

5. **`Broad cast metadata tx`** - Push metadata transaction