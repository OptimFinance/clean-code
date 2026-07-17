#set page(paper: "a4", margin: (x: 2cm, y: 2cm))

#set text(size: 13pt)

// Title Section
#align(center)[
  #text(size: 20pt, weight: "bold")[sOADA Yield Donation KPI Report] \
  #v(1em)
  #line(length: 100%, stroke: 0.5pt + gray)
  #v(1em)
]

// Executive Summary
== Executive Summary
The following report validates the resource consumption for yield donation transactions, specifically in comparison to *sOADA* minting. The primary benchmark for economic efficiency is the `mintSotokens` transaction cost (*0.367 ADA approx*). 

The target operations (`createYieldDonation` and `commitYieldDonation`) were found to be less costly on average than the benchmark, ensuring that protocol complexity does not introduce prohibitive overhead for end-users.

// KPI Validation Table
== Key Performance Indicators (KPIs)
#table(
  columns: (1fr, 1fr, 1fr),
  inset: 10pt,
  align: horizon,
  stroke: 0.5pt + gray,
  [*Target Operation*], [*Observed Fee (ADA)*], [*Deviation vs Benchmark*],

  [mintSotokens (Avg)], [0.367], [0.0%],
  [createYieldDonation], [0.231], [-27.1%],
  [commitYieldDonation], [0.308], [-16.1%],
)

#v(1em)

// Detailed Analysis Section
== Detailed Test Results: Target Transactions
The following table provides the breakdown of the key transactions for validation, with execution units and transaction sizes as fractions of current mainnet limits.

#table(
  columns: (2fr, 1fr, 1fr, 1fr, 1fr),
  inset: 8pt,
  align: horizon,
  stroke: 0.5pt + gray,
  [*Operation*], [*Steps Budget*], [*Mem Budget*], [*TX Size*], [*Fee (ADA)*],

  [mintSotokens (Avg)], [0.062], [0.127], [0.076],[0.367], 
  [createYieldDonation], [0.013], [0.029], [0.046], [0.231],
  [commitYieldDonation], [0.037], [0.082], [0.077], [0.308],
)

#v(1em)

// Compliance Statement
== Conclusion
  All tested operations fall within the acceptable threshold of economic overhead. While `mintSotokens` shows slightly higher variance due to increased complexity in policy validation, the deviation remains well within operational tolerances relative to standard staking costs.

#pagebreak()

== Appendix: Raw Transaction Logs
#text(size: 9pt, weight: "bold")[The following output can be reproduced by running] `nix run .#emulatorTests`

#set text(size: 9.1pt, font: "Courier New")
#set block(breakable: true)

#block(fill: luma(245), inset: 10pt, radius: 4pt, width: 100%)[
  #raw(
	    "
SUCCESS: createScriptRefs()
         Transaction was 5.26025390625x max bytes
         Transaction fee was 3.952185 ADA
SUCCESS: mintIdAsAdmin(collateralAmo, toPlutusData(initialCollateralAmoDatum), cmSeed)
         Transaction used 0.0071507802x steps budget
         Transaction used 0.015433x mem budget
         Transaction was 0.03448486328125x max bytes
         Transaction fee was 0.211284 ADA
SUCCESS: mintIdAsAdmin(stakingAmo, toPlutusData(initialStakingAmoDatum), stakingAmoSeed)
         Transaction used 0.0068666797x steps budget
         Transaction used 0.014988x mem budget
         Transaction was 0.0406494140625x max bytes
         Transaction fee was 0.215164 ADA
SUCCESS: mintIdAsAdmin(controllerWhitelist, controllerPubKeyHash)
         Transaction used 0.0068290051x steps budget
         Transaction used 0.014867x mem budget
         Transaction was 0.03564453125x max bytes
         Transaction fee was 0.211431 ADA
SUCCESS: mintIdAsAdmin(otokenRuleWhitelist, otokenRule.hash)
         Transaction used 0.0068290051x steps budget
         Transaction used 0.014867x mem budget
         Transaction was 0.03564453125x max bytes
         Transaction fee was 0.211431 ADA
SUCCESS: setSotokenPolicy(sotokenPolicy.hash).then(addSignature(soul.privateKey))
         Transaction used 0.011460272x steps budget
         Transaction used 0.02620857142857143x mem budget
         Transaction was 0.033935546875x max bytes
         Transaction fee was 0.218256 ADA
SUCCESS: setFeeClaimRule(feeClaimRule.hash).then(addSignature(soul.privateKey))
         Transaction used 0.0127312787x steps budget
         Transaction used 0.027846142857142858x mem budget
         Transaction was 0.033935546875x max bytes
         Transaction fee was 0.220495 ADA
SUCCESS: setStakingAmoTokenName(stakingAmoTokenName)
           .then(addSignature(controllerPrivateKey))
           .then(addSignature(soul.privateKey))
         Transaction used 0.0159596531x steps budget
         Transaction used 0.035882285714285714x mem budget
         Transaction was 0.035888671875x max bytes
         Transaction fee was 0.235166 ADA
SUCCESS: mintIdAsAdmin(otokenRuleWhitelist, sotokenRule.hash).then(addSignature(soul.privateKey))
         Transaction used 0.0071104644x steps budget
         Transaction used 0.015202285714285715x mem budget
         Transaction was 0.03564453125x max bytes
         Transaction fee was 0.211905 ADA
SUCCESS: mintIdAsAdmin(sotokenRuleWhitelist, sotokenRule.hash).then(addSignature(soul.privateKey))
         Transaction used 0.0071104644x steps budget
         Transaction used 0.015202285714285715x mem budget
         Transaction was 0.03564453125x max bytes
         Transaction fee was 0.211905 ADA
SUCCESS: mintIdAsAdmin(otokenRuleWhitelist, feeClaimRule.hash).then(addSignature(soul.privateKey))
         Transaction used 0.0081054585x steps budget
         Transaction used 0.017876142857142858x mem budget
         Transaction was 0.03564453125x max bytes
         Transaction fee was 0.214782 ADA
SUCCESS: mintIdAsAdmin(strategyWhitelist, donationStrategy.hash).then(addSignature(soul.privateKey))
         Transaction used 0.0068290051x steps budget
         Transaction used 0.014867x mem budget
         Transaction was 0.03564453125x max bytes
         Transaction fee was 0.211431 ADA
SUCCESS: registerRules()
         Transaction was 0.0140380859375x max bytes
         Transaction fee was 0.170209 ADA
SUCCESS: spawnStrategy(donationStrategy, {
        kind: 'DonationDatum'
      }, donationSeed).then(addSignature(controllerPrivateKey))
         Transaction used 0.0378002979x steps budget
         Transaction used 0.08042878571428572x mem budget
         Transaction was 0.05987548828125x max bytes
         Transaction fee was 0.30419 ADA
SUCCESS: mintOtoken(100_000_000n)
         Transaction used 0.0095931421x steps budget
         Transaction used 0.020738714285714287x mem budget
         Transaction was 0.0330810546875x max bytes
         Transaction fee was 0.207431 ADA
SUCCESS: mintOtoken(60_000_000n)
         Transaction used 0.0095931421x steps budget
         Transaction used 0.020738714285714287x mem budget
         Transaction was 0.0352783203125x max bytes
         Transaction fee was 0.209015 ADA
SUCCESS: mintOtoken(sotokenLimit * 2n)
         Transaction used 0.0095931421x steps budget
         Transaction used 0.020738714285714287x mem budget
         Transaction was 0.0338134765625x max bytes
         Transaction fee was 0.207959 ADA
SUCCESS: mintOtoken(5_000_000n)
         Transaction used 0.0095931421x steps budget
         Transaction used 0.020738714285714287x mem budget
         Transaction was 0.0330810546875x max bytes
         Transaction fee was 0.207431 ADA
   FAIL: Minting OTOKEN below minimum fails
SUCCESS: mergeDeposits().then(addSignature(controllerPrivateKey))
         Transaction used 0.0443001421x steps budget
         Transaction used 0.08899814285714286x mem budget
         Transaction was 0.0633544921875x max bytes
         Transaction fee was 0.313863 ADA
SUCCESS: stakeOtokens(10_000_000n)
         Transaction was 0.02423095703125x max bytes
         Transaction fee was 0.177557 ADA
SUCCESS: mintSotokens().then(addSignature(controllerPrivateKey))
         Transaction used 0.0616273439x steps budget
         Transaction used 0.12552707142857142x mem budget
         Transaction was 0.07025146484375x max bytes
         Transaction fee was 0.360836 ADA
SUCCESS: stakeOtokens(-5_000_000n)
         Transaction was 0.02423095703125x max bytes
         Transaction fee was 0.177557 ADA
SUCCESS: mintSotokens().then(addSignature(controllerPrivateKey))
         Transaction used 0.0589660101x steps budget
         Transaction used 0.12248557142857143x mem budget
         Transaction was 0.07073974609375x max bytes
         Transaction fee was 0.356812 ADA
SUCCESS: mintSotokens()
         Transaction was 0.005615234375x max bytes
         Transaction fee was 0.164137 ADA
   FAIL: Setting sOADA policy without soul token fails
   FAIL: Deposit mint mismatch fails
   FAIL: Incorrect sOADA output amount while minting fails
SUCCESS: createYieldDonation(500_000n, [
      7n,
      10n
    ])
         Transaction used 0.0134568606x steps budget
         Transaction used 0.02967914285714286x mem budget
         Transaction was 0.0457763671875x max bytes
         Transaction fee was 0.231035 ADA
   FAIL: Minting sOADA beyond limit fails
   FAIL: Redirecting staking AMO ID while minting sOADA fails
SUCCESS: donate(1_000_000n)
         Transaction used 0.0135610347x steps budget
         Transaction used 0.030110428571428573x mem budget
         Transaction was 0.02349853515625x max bytes
         Transaction fee was 0.210954 ADA
SUCCESS: syncDonations().then(addSignature(controllerPrivateKey))
         Transaction used 0.0401830479x steps budget
         Transaction used 0.08626178571428571x mem budget
         Transaction was 0.053466796875x max bytes
         Transaction fee was 0.301556 ADA
   FAIL: Redirecting collateral AMO ID during `MergeStakeRate` fails
   FAIL: Merge staking rate without controller signature fails
SUCCESS: mergeStakingRate().then(addSignature(controllerPrivateKey))
         Transaction used 0.0376274993x steps budget
         Transaction used 0.08068221428571429x mem budget
         Transaction was 0.0537109375x max bytes
         Transaction fee was 0.295382 ADA
SUCCESS: stakeOtokens(10_000_101n)
         Transaction was 0.02447509765625x max bytes
         Transaction fee was 0.177733 ADA
SUCCESS: mintSotokens().then(addSignature(controllerPrivateKey))
         Transaction used 0.0580841555x steps budget
         Transaction used 0.12037992857142857x mem budget
         Transaction was 0.07525634765625x max bytes
         Transaction fee was 0.357731 ADA
SUCCESS: stakeOtokens(sotokenLimit * 2n + 1n)
         Transaction was 0.0311279296875x max bytes
         Transaction fee was 0.182529 ADA
SUCCESS: mintSotokens().then(addSignature(controllerPrivateKey))
         Transaction used 0.0708844419x steps budget
         Transaction used 0.141461x mem budget
         Transaction was 0.093505859375x max bytes
         Transaction fee was 0.397145 ADA
SUCCESS: stakeOtokens(-sotokenLimit / 2n - 1n)
         Transaction was 0.0291748046875x max bytes
         Transaction fee was 0.181121 ADA
SUCCESS: mintSotokens().then(addSignature(controllerPrivateKey))
         Transaction used 0.061079221x steps budget
         Transaction used 0.12603164285714286x mem budget
         Transaction was 0.07257080078125x max bytes
         Transaction fee was 0.36252 ADA
SUCCESS: donate(10_000_000_000_000n)
         Transaction used 0.0124159975x steps budget
         Transaction used 0.02868357142857143x mem budget
         Transaction was 0.02178955078125x max bytes
         Transaction fee was 0.207744 ADA
SUCCESS: syncDonations().then(addSignature(controllerPrivateKey))
         Transaction used 0.0412221709x steps budget
         Transaction used 0.08776892857142857x mem budget
         Transaction was 0.0537109375x max bytes
         Transaction fee was 0.303698 ADA
SUCCESS: mergeStakingRate().then(addSignature(controllerPrivateKey))
         Transaction used 0.0376132254x steps budget
         Transaction used 0.08068221428571429x mem budget
         Transaction was 0.0545654296875x max bytes
         Transaction fee was 0.295988 ADA
SUCCESS: commitYieldDonation()
         Transaction used 0.0374665519x steps budget
         Transaction used 0.08209164285714286x mem budget
         Transaction was 0.0767822265625x max bytes
         Transaction fee was 0.308593 ADA
SUCCESS: despawnStrategy('DonationStrategy').then(addSignature(controllerPrivateKey))
         Transaction used 0.0498722339x steps budget
         Transaction used 0.10869564285714285x mem budget
         Transaction was 0.04681396484375x max bytes
         Transaction fee was 0.321868 ADA
   FAIL: Extract lovelace while spawning strategy fails
   FAIL: Claim ODAO fee without fee claimer token fails
SUCCESS: claimOdaoFee().then(addSignature(feeClaimer.privateKey))
         Transaction used 0.031894872x steps budget
         Transaction used 0.06768771428571428x mem budget
         Transaction was 0.05755615234375x max bytes
         Transaction fee was 0.283524 ADA
	    ",
	    lang: "text",
	  )
	]
