import { NetworkInfo, PublicKey } from "@emurgo/cardano-serialization-lib-nodejs"
import { DelegationMetadata, GovernanceKey, Purpose, SignedDelegationMetadata, GovernanceWallet } from "./governance.wallet"

describe("GovernanceWallet", () => {
  let wallet: GovernanceWallet

  beforeEach(async () => {
    wallet = new GovernanceWallet(["test", "walk", "nut", "penalty", "hip", "pave", "soap", "entry", "language", "right", "filter", "choice"])
  })

  describe('Voting Keys', () => {
    /**
     * Generates key based on new derivation path
     */
    it('CREATE pub voting key with default values (index = 0, account = 0, role = 0)', async () => {
      const pubGovKey: PublicKey = await wallet.getVotingKey()
      expect(Buffer.from(pubGovKey.as_bytes())).toStrictEqual(Buffer.from('1788b78997774daae45ae42ce01cf59aec6ae2acee7f7cf5f76abfdd505ebed3', 'hex'))
      expect(pubGovKey.as_bytes().length).toBe(32)
    })

    it('CREATE pub voting key with index = 1, account = 0, role = 0', async () => {
      const pubGovKey: PublicKey = await wallet.getVotingKey(1, 0, 0)
      expect(Buffer.from(pubGovKey.as_bytes())).toStrictEqual(Buffer.from('11b002e6e9a76ad8975551691d2ae33d69b201d10841e663de6891326a9bd051', 'hex'))
      expect(pubGovKey.as_bytes().length).toBe(32)
    })
  })

  /**
   * Craft delegation metadata
   */
  it('CRAFT delegation metadata', async () => {
    const myPubGovKey: PublicKey = await wallet.getVotingKey(0, 0, 0)

    // Our own key
    const myGovKey: GovernanceKey = {
      voting_key: Buffer.from(myPubGovKey.as_bytes()).toString('hex'),
      weight: 1
    }

    // Some other party's wallet's entropy
    const mnemonic: string[] = ['gate', 'vendor', 'require', 'pig', 'more', 'pool', 'popular', 'trash', 'metal', 'emerge', 'piece', 'grief']

    // New key to delegate to
    const keyToDelegate: PublicKey = await (new GovernanceWallet(mnemonic)).getVotingKey(0, 0, 0)

    // delegation
    const delegatedGovKey: GovernanceKey = {
      voting_key: Buffer.from(keyToDelegate.as_bytes()).toString('hex'),
      weight: 3
    }

    // Build the cert
    const delegationCert: DelegationMetadata = await wallet.buildDelegation([myGovKey, delegatedGovKey], Purpose.CATALYST, 0, 0, 0)
    expect(delegationCert).toEqual({ 1: [["1788b78997774daae45ae42ce01cf59aec6ae2acee7f7cf5f76abfdd505ebed3", 1], ["b48b946052e07a95d5a85443c821bd68a4eed40931b66bd30f9456af8c092dfa", 3]], 2: "93bf1450ec2a3b18eebc7acfd311e695e12232efdf9ce4ac21e8b536dfacc70f", 3: "e0160a9d8f375f8e72b4bdbfa4867ca341a5aa6f17fde654c1a7d3254e", 4: expect.anything(), 5: 0 })
  })

  /**
   * Generate our own voting key,
   * Generate someone else's voting key,
   * Craft Delegation metadata
   * Sign delegation
   * Encode it
   */
  it('SIGN & cbor ENCODE delegation metadata', async () => {
    // Our own voting key
    const myPubGovKey: PublicKey = await wallet.getVotingKey(0, 0, 0)
    
    // My own key voting power
    const myGovKey: GovernanceKey = {
      voting_key: Buffer.from(myPubGovKey.as_bytes()).toString('hex'),
      weight: 1
    }

    // Other's wallet
    const mnemonic: string[] = ['gate', 'vendor', 'require', 'pig', 'more', 'pool', 'popular', 'trash', 'metal', 'emerge', 'piece', 'grief']
    const keyToDelegate: PublicKey = await (new GovernanceWallet(mnemonic)).getVotingKey(0, 0, 0)

    // delegated key & weight
    const delegatedGovKey: GovernanceKey = {
      voting_key: Buffer.from(keyToDelegate.as_bytes()).toString('hex'),
      weight: 3
    }

    const delegationCert: DelegationMetadata = await wallet.buildDelegation([myGovKey, delegatedGovKey], NetworkInfo.mainnet().network_id(), Purpose.CATALYST, 0, 0, 0)
    
    // signed metadata
    const signedMetadata: SignedDelegationMetadata = await wallet.signDelegation(delegationCert, 0, 0, 0)
    expect(signedMetadata).toStrictEqual({"61284":{"1":[["1788b78997774daae45ae42ce01cf59aec6ae2acee7f7cf5f76abfdd505ebed3",1],["b48b946052e07a95d5a85443c821bd68a4eed40931b66bd30f9456af8c092dfa",3]],"2":"93bf1450ec2a3b18eebc7acfd311e695e12232efdf9ce4ac21e8b536dfacc70f","3":"e0160a9d8f375f8e72b4bdbfa4867ca341a5aa6f17fde654c1a7d3254e","4": expect.anything(),"5":1},"61285":"0x87c150ca1c37a4593a556f39f98271ac8c20973067abbf89189bf8d2924e7bf7031308bb6f221c58ff51230093c878b3f743f64c90621fdbe55835506a0e7605"})

    const cborEncodedMetadata: string = await wallet.encodeSignedMetadata(signedMetadata)
    expect(cborEncodedMetadata).toBe('a2653631323834a56131828278403137383862373839393737373464616165343561653432636530316366353961656336616532616365653766376366356637366162666464353035656265643301827840623438623934363035326530376139356435613835343433633832316264363861346565643430393331623636626433306639343536616638633039326466610361327840393362663134353065633261336231386565626337616366643331316536393565313232333265666466396365346163323165386235333664666163633730666133783a6530313630613964386633373566386537326234626462666134383637636133343161356161366631376664653635346331613764333235346561341a00539c2b613501653631323835a16131788230783837633135306361316333376134353933613535366633396639383237316163386332303937333036376162626638393138396266386432393234653762663730333133303862623666323231633538666635313233303039336338373862336637343366363463393036323166646265353538333535303661306537363035')
  })
})
