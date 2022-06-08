import * as cbor from 'cbor'
import blake2b from 'blake2b'
import {
    BigNum,
    GeneralTransactionMetadata,
    MetadataList,
    MetadataJsonSchema,
    TransactionMetadatum,
    PrivateKey,
    encode_json_str_to_metadatum,
    Bip32PrivateKey,
    RewardAddress,
    StakeCredential,
    MetadataMap,
    Int,
    PublicKey,
} from "@emurgo/cardano-serialization-lib-nodejs";

import { mnemonicToEntropy } from 'bip39';

// util hardening function
function harden(num: number): number {
    return 0x80000000 + num;
}

export const MetadataLabels = {
    DATA: '61284',
    SIG: '61285',
} as const;

export enum Purpose {
    CATALYST = 0,
    OTHER = 1
}

export interface Delegation {
    voting_delegation: GovernanceKey[],
    staking_key: string,
    reward_address: string,
    nonce: number,
    purpose: Purpose
}

export interface DelegationMetadata {
    "1": any[],
    "2": string,
    "3": string,
    "4": number,
    "5": number
}

export interface SignedDelegationMetadata {
    '61284': DelegationMetadata,
    '61285': string
}

export interface GovernanceKey {
    voting_key: string,
    weight: number
}

export class GovernanceWallet {
    private readonly rootKey: Bip32PrivateKey

    constructor(mnemonic: string[]) {
        const entropy = mnemonicToEntropy(mnemonic.join(' '))

        this.rootKey = Bip32PrivateKey.from_bip39_entropy(
            Buffer.from(entropy, 'hex'),
            Buffer.from(''),
        );
    }

    /**
     * 
     * @param address_index 
     * @param account 
     * @param role 
     * @returns 
     */
    async getVotingKey(address_index: number = 0, account: number = 0, role: number = 0): Promise<PublicKey> {
        const purposePath: number = 1694 // Governance
        const coinPath: number = 1815 // Ada

        return this.rootKey
            .derive(harden(purposePath))
            .derive(harden(coinPath))
            .derive(harden((account)))
            .derive(role)
            .derive(address_index)
            .to_raw_key()
            .to_public()
    }

    /**
     * 
     * @param keys 
     * @param purpose 
     * @param stakeAccountPath 
     * @param stakeRolePath 
     * @returns 
     */
    async buildDelegation(keys: GovernanceKey[], purpose: Purpose,
        networkId: number,
        stakeAccountPath: number = 0,
        stakeRolePath: number = 0,
        stakeIndex: number = 0): Promise<DelegationMetadata> {

        // Stake key
        const stakePubKey: PublicKey = this.rootKey
            .derive(harden(1852)) // CIP1852
            .derive(harden(1815)) // Cardano
            .derive(stakeAccountPath)
            .derive(stakeRolePath)
            .derive(stakeIndex)
            .to_raw_key()
            .to_public()


        const stakeAddr: RewardAddress = RewardAddress.new(
            networkId,
            StakeCredential.from_keyhash(stakePubKey.hash()))

        const delegation: Delegation = {
            voting_delegation: keys,
            staking_key: Buffer.from(stakePubKey.as_bytes()).toString('hex'),
            reward_address: Buffer.from(stakeAddr.to_address().to_bytes()).toString('hex'),
            nonce: 5479467,
            purpose
        }

        // MetadataMap.new().
        const votingKeysList = MetadataList.new()

        keys.forEach(vkey => {
            const keyWeight: MetadataList = MetadataList.new()
            keyWeight.add(TransactionMetadatum.new_text(vkey.voting_key))
            keyWeight.add(TransactionMetadatum.new_int(Int.new_i32(vkey.weight)))
            votingKeysList.add(TransactionMetadatum.new_list(keyWeight))
        })

        const delegationMap = MetadataMap.new()
        delegationMap.insert(TransactionMetadatum.new_text("1"), TransactionMetadatum.new_list(votingKeysList))
        delegationMap.insert(TransactionMetadatum.new_text("2"), TransactionMetadatum.new_text(delegation.staking_key))
        delegationMap.insert(TransactionMetadatum.new_text("3"), TransactionMetadatum.new_text(delegation.reward_address))
        delegationMap.insert(TransactionMetadatum.new_text("4"), TransactionMetadatum.new_int(Int.new_i32(delegation.nonce)))
        delegationMap.insert(TransactionMetadatum.new_text("5"), TransactionMetadatum.new_int(Int.new_i32(delegation.purpose)))

        console.log(Buffer.from(delegationMap.to_bytes()).toString('hex'))

        const certVotDelegationJSON: DelegationMetadata = {
            "1": delegation.voting_delegation.map(vkey => [vkey.voting_key, vkey.weight]),
            "2": delegation.staking_key,
            "3": delegation.reward_address,
            "4": delegation.nonce,
            "5": delegation.purpose
        }

        return certVotDelegationJSON
    }

    /**
     * 
     * @param delegationMetadata 
     * @param account 
     * @param role 
     * @param index 
     * @returns 
     */
    async signDelegation(delegationMetadata: DelegationMetadata,
        account: number = 0,
        role: number = 0, index: number = 0): Promise<SignedDelegationMetadata> {

        const rawpriv: PrivateKey = this.rootKey
            .derive(harden(1852))
            .derive(harden(1815))
            .derive(harden((account)))
            .derive(role)
            .derive(index)
            .to_raw_key()

        const encodedMetadata: TransactionMetadatum = encode_json_str_to_metadatum(
            JSON.stringify(delegationMetadata),
            MetadataJsonSchema.BasicConversions
        );

        const generalMetadata = GeneralTransactionMetadata.new();
        generalMetadata.insert(
            BigNum.from_str(MetadataLabels.DATA.toString()),
            encodedMetadata
        );
        const hashedMetadata = blake2b(256 / 8)
            .update(generalMetadata.to_bytes())
            .digest("binary");

        const cborMap = new cbor.Map()
        cborMap.set(MetadataLabels.DATA, delegationMetadata)

        const sigCborMap = new cbor.Map()
        sigCborMap.set("1", '0x' + rawpriv.sign(hashedMetadata).to_hex())

        cborMap.set(MetadataLabels.SIG, sigCborMap)

        return {
            '61284': delegationMetadata,
            '61285': '0x' + rawpriv.sign(hashedMetadata).to_hex()
        }
    }

    /**
     * 
     * @param signedMetadata 
     * @returns 
     */
    async encodeSignedMetadata(signedMetadata: SignedDelegationMetadata): Promise<string> {
        const cborMap = new cbor.Map()
        cborMap.set(MetadataLabels.DATA, signedMetadata['61284'])

        const sigCborMap = new cbor.Map()
        sigCborMap.set("1", signedMetadata['61285'])

        cborMap.set(MetadataLabels.SIG, sigCborMap)

        return cbor.encode(cborMap).toString('hex')
    }
}