
// TODO I need to test thoroughly.
// TODO this seems like a good candidate for async.
//    though I am still concerned about race conditions.
//    I can, for now, mitigate that risk, and/or learn later how to handle synchronized data (like the witness list)

// Manages a linguine redemption.
export class LinguineRedeemer {

  static trialsInProgress = {}

  // TODO
  // user snowflakes? or the object for them?
  // we are kinda raw'ing the API a bit.
  // interaction data perhaps
  constructor(redeemee) {

    // FOR NOW key by redeemee, even though that encodes "global" linguine redemption
    // or like create a GuildRedeemer object that can be used to create LinguineRedeemers, IDRC right now.
    trialsInProgress[redeemee] = this

    this.redemee = redeemee
    this.witnesses = []

    // start the expiration timer
    setTimeout(() => {
      delete trialsInProgress[redeemee] // maybe call trialDone() in case there's other cleanup
    }, 
    10 * 60 * 1000  // 10 minutes expressed in milliseconds
    )

  }

  // Returns the in progress trial for a user
  static trialFor(user) {
    return LinguineRedeemer.trialsInProgress[user]
  }

  // Adds a users name to the witnesses.
  // Returnsreturn [false,  true if that succeeded, false (and a reason) if not.
  witnessSignoff(witness) {
    let outcome = {
      success: true,
      reason: undefined
    }
    if (witness !== this.redemee) { // the redeemee cannot witness their own redemption
      for (let w of this.witnesses) {
        if (w === witness) {
          outcome.success = false
          outcome.reason = "You are already a witness!"
          break;
        }
      }
    } else {
      outcome.success = false
      outcome.reason = "You cannot act as a witness for your redemption!"
    }
    return outcome
  }

  get criteriaMet() {
    // TODO stub
    // if there is at least one admin witness and one non-admin witness, then return true, else false.
    return true
  }

  trialDone() {

  }

}